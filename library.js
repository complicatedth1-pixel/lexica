// library.js — window.library state, Supabase CRUD, homepage rendering, book/PDF modals
// Owns: window.library, window.activeBookId
// Calls: renderTree(), renderPage() (from editor.js) after opening a book

'use strict';

window.library = [];
window.activeBookId = null;
window._libraryLoaded = false; // GUARD: saveAll() blocks until this is true

// ── Helpers ──────────────────────────────────────────
function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
window.esc = escHtml;

function getLastBook() {
  if (!window.library.length) return null;
  return window.library.slice().sort((a,b) => (b.lastOpened||0) - (a.lastOpened||0))[0];
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts, m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function bookCoverGradient(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h<<5)-h);
  const hue = Math.abs(h) % 360;
  return `background:linear-gradient(135deg,hsl(${hue},30%,12%) 0%,hsl(${(hue+40)%360},20%,8%) 100%);`;
}

// ── Supabase CRUD ─────────────────────────────────────
async function saveBook(book) {
  if (!currentUser || !book) return;
  const row = {
    id: book.id, user_id: currentUser.id, name: book.name || '',
    tree_data: book.treeData || [], highlights: book.highlights || {},
    notes: book.notes || {}, last_opened: book.lastOpened || 0,
    is_pdf: book.isPDF || false, is_pdf_viewer: book.isPDFViewer || false,
    pdf_num_pages: book.pdfNumPages || null, page_times: book.pageTimes || {},
    pdf_highlights: book.pdfHighlights || {},
    page_confirmed: book.pageConfirmed || {}
  };
  await sb.from('books').upsert(row, { onConflict: 'id,user_id' });
}

async function saveLibrary() {
  if (!currentUser) return;
  for (const book of window.library) { await saveBook(book); }
  try { localStorage.setItem('folio-activeBook', window.activeBookId || ''); } catch(e){}
}

async function deleteBookFromDB(bookId) {
  if (!currentUser) return;
  await sb.from('books').delete().eq('id', bookId).eq('user_id', currentUser.id);
  await sb.storage.from('pdfs').remove([`${currentUser.id}/${bookId}`]);
}

async function loadLibraryFromSupabase() {
  if (!currentUser) return;
  const { data, error } = await sb.from('books').select('*')
    .eq('user_id', currentUser.id).order('last_opened', { ascending: false });
  if (error) { console.error(error); window.library = []; }
  else {
    window.library = (data || []).map(r => ({
      id: r.id, name: r.name, treeData: r.tree_data || [],
      highlights: r.highlights || {}, notes: r.notes || {},
      lastOpened: r.last_opened || 0, isPDF: r.is_pdf || false,
      isPDFViewer: r.is_pdf_viewer || false, pdfNumPages: r.pdf_num_pages || null,
      pageTimes: r.page_times || {},
      pdfHighlights: r.pdf_highlights || {},
      pageConfirmed: r.page_confirmed || {}
    }));
  }
  try { window.activeBookId = localStorage.getItem('folio-activeBook') || null; } catch(e){}
  window._libraryLoaded = true; // GUARD: data is now safe to write back
  renderHomepage();
}

async function savePdfToStorage(bookId, base64) {
  if (!currentUser) return;
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  await sb.storage.from('pdfs').upload(`${currentUser.id}/${bookId}`, blob,
    { upsert: true, contentType: 'application/pdf' });
}

async function loadPdfFromStorage(bookId) {
  if (!currentUser) return null;
  const { data, error } = await sb.storage.from('pdfs').download(`${currentUser.id}/${bookId}`);
  if (error || !data) return null;
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.readAsDataURL(data);
  });
}

// ── In-memory sync ────────────────────────────────────
function saveAll() {
  // GUARD: never write editor defaults back to DB before library is loaded from Supabase.
  // Without this, the editor globals (treeData=[], bookName='My Book') get flushed to
  // the active book on every page load, wiping real content before it's fetched.
  if (!window._libraryLoaded) return;

  if (window.activeBookId) {
    const book = window.library.find(b => b.id === window.activeBookId);
    // FIX: Never overwrite a PDF viewer book's metadata from editor globals.
    if (book && !book.isPDFViewer) {
      book.treeData = treeData;   // treeData is owned by editor.js
      book.name = bookName;
      book.highlights = highlights;
      book.notes = notes;
      book.lastOpened = Date.now();
      saveBook(book);
    }
  }
}

function loadBookIntoEditor(book) {
  treeData = book.treeData || [];
  bookName = book.name || 'My Book';
  highlights = book.highlights || {};
  notes = book.notes || {};
  selectedChapterId = null;
  selectedTopicId = null;
}

// ── Homepage render ───────────────────────────────────
function renderHomepage() {
  const heroResumeBtn = document.getElementById('heroResumeBtn');
  const lastBook = getLastBook();
  if (lastBook) {
    heroResumeBtn.style.display = 'inline-flex';
    heroResumeBtn.textContent = lastBook.isPDFViewer ? `↩ ${lastBook.name}` : `↩ Resume`;
  } else heroResumeBtn.style.display = 'none';

  const recentEmpty = document.getElementById('recentEmpty');
  const lastBookCard = document.getElementById('lastBookCard');
  if (lastBook) {
    recentEmpty.style.display = 'none'; lastBookCard.style.display = 'block';
    const chapters = lastBook.treeData || [];
    const totalTopics = chapters.reduce((a,c) => a + (c.topics||[]).length, 0);
    const filledSections = chapters.reduce((a,c) => a + (c.topics||[]).reduce((a2,t) => a2 + (t.sections||[]).filter(s => s.content && s.content.trim()).length, 0), 0);
    const totalSections = chapters.reduce((a,c) => a + (c.topics||[]).reduce((a2,t) => a2 + (t.sections||[]).length, 0), 0);
    const pct = totalSections > 0 ? Math.round(filledSections/totalSections*100) : 0;
    const ago = lastBook.lastOpened ? timeAgo(lastBook.lastOpened) : '';
    lastBookCard.innerHTML = `<div class="last-book-card" onclick="openBookById('${lastBook.id}')">
      <div class="lbc-cover"><div class="lbc-cover-title">${escHtml(lastBook.name)}</div>
      <div class="lbc-cover-overlay"><span class="lbc-open-btn">Open →</span></div></div>
      <div class="lbc-info"><div class="lbc-name">${escHtml(lastBook.name)}</div>
      <div class="lbc-meta">${chapters.length} ch · ${totalTopics} topics · ${ago}</div>
      ${totalSections > 0 ? `<div class="lbc-progress-label">${filledSections}/${totalSections} sections (${pct}%)</div><div class="lbc-progress-track"><div class="lbc-progress-fill" style="width:${pct}%"></div></div>` : ''}
      <div class="lbc-actions">
        <button class="btn-primary" style="font-size:11px;padding:.5rem 1.2rem;" onclick="event.stopPropagation();openBookById('${lastBook.id}')">Open</button>
        <button class="btn-ghost" style="font-size:11px;padding:.45rem 1rem;" onclick="event.stopPropagation();deleteBook('${lastBook.id}')">Delete</button>
      </div></div></div>`;
  } else { recentEmpty.style.display = 'flex'; lastBookCard.style.display = 'none'; }

  const collectionsEmpty = document.getElementById('collectionsEmpty');
  const booksGrid = document.getElementById('booksGrid');
  if (window.library.length === 0) { collectionsEmpty.style.display = 'flex'; booksGrid.style.display = 'none'; }
  else {
    collectionsEmpty.style.display = 'none'; booksGrid.style.display = 'grid';
    const sorted = window.library.slice().sort((a,b) => (b.lastOpened||0) - (a.lastOpened||0));
    booksGrid.innerHTML = sorted.map(book => {
      const chs = (book.treeData||[]).length;
      const tps = (book.treeData||[]).reduce((a,c) => a + (c.topics||[]).length, 0);
      const isActive = book.id === window.activeBookId;
      return `<div class="book-card" onclick="openBookById('${book.id}')">
        <div class="book-cover-block" style="${bookCoverGradient(book.name)}">
          <div class="book-cover-title">${escHtml(book.name)}</div>
          <div class="book-cover-overlay"><button class="book-open-btn">Open →</button></div>
          ${isActive ? '<div class="book-active-badge">✦ Active</div>' : ''}
        </div>
        <div class="book-meta-label">${timeAgo(book.lastOpened)}</div>
        <div class="book-meta-name" title="${escHtml(book.name)}">${escHtml(book.name)}</div>
        <div style="font-size:10px;color:var(--cream2);margin-top:3px;font-weight:300;">${chs} ch · ${tps} topics</div>
        <button class="book-delete-btn" onclick="event.stopPropagation();deleteBook('${book.id}')" title="Delete">✕</button>
      </div>`;
    }).join('');
  }
}

// ── Navigation ────────────────────────────────────────
const homepage = document.getElementById('homepage');
const editorShell = document.getElementById('editor-shell');

function openBookById(bookId) {
  const book = window.library.find(b => b.id === bookId); if (!book) return;
  if (window.activeBookId && window.activeBookId !== bookId) {
    const outgoing = window.library.find(b => b.id === window.activeBookId);
    if (outgoing && !outgoing.isPDFViewer) saveAll();
  }
  window.activeBookId = bookId; book.lastOpened = Date.now(); saveBook(book);
  if (book.isPDFViewer) { openPDFViewer(book); return; }
  loadBookIntoEditor(book);
  document.getElementById('sidebarBookTitle').textContent = bookName;
  homepage.classList.add('hidden'); editorShell.classList.add('visible');
  renderTree(); renderPage();
}

function resumeLastBook() { const last = getLastBook(); if (last) openBookById(last.id); }

function openEditor(bName) {
  if (bName) {
    const book = { id: uid(), name: bName, treeData: [], highlights: {}, notes: {}, lastOpened: Date.now() };
    window.library.push(book); window.activeBookId = book.id; loadBookIntoEditor(book); saveBook(book);
    document.getElementById('sidebarBookTitle').textContent = bookName;
    homepage.classList.add('hidden'); editorShell.classList.add('visible');
    renderTree(); renderPage();
  } else { const last = getLastBook(); if (last) openBookById(last.id); else openNewBookModal(); }
}

function goHome() {
  if (window.activeBookId) {
    const active = window.library.find(b => b.id === window.activeBookId);
    if (active && !active.isPDFViewer) saveAll();
  }
  editorShell.classList.remove('visible'); homepage.classList.remove('hidden'); renderHomepage();
}
document.getElementById('homeLink').addEventListener('click', goHome);

function deleteBook(bookId) {
  if (!confirm('Delete this book? This cannot be undone.')) return;
  window.library = window.library.filter(b => b.id !== bookId);
  if (window.activeBookId === bookId) window.activeBookId = null;
  deleteBookFromDB(bookId); renderHomepage();
}

function scrollToSection(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }

// ── New Book Modal ─────────────────────────────────────
const newBookModal = document.getElementById('newBookModal');
const bookNameInput = document.getElementById('bookNameInput');

function openNewBookModal() { bookNameInput.value = ''; newBookModal.classList.add('open'); setTimeout(() => bookNameInput.focus(), 120); }
function closeModal() { newBookModal.classList.remove('open'); }

document.getElementById('modalCancel').addEventListener('click', closeModal);
newBookModal.addEventListener('click', e => { if (e.target === newBookModal) closeModal(); });

function confirmModal() {
  const name = bookNameInput.value.trim() || 'Untitled'; closeModal();
  const book = { id: uid(), name, treeData: [], highlights: {}, notes: {}, lastOpened: Date.now() };
  window.library.push(book); window.activeBookId = book.id; loadBookIntoEditor(book); saveBook(book);
  document.getElementById('sidebarBookTitle').textContent = bookName;
  homepage.classList.add('hidden'); editorShell.classList.add('visible');
  renderTree(); renderPage();
}

document.getElementById('modalConfirm').addEventListener('click', confirmModal);
bookNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); });

// ── Theme ──────────────────────────────────────────────
if ((localStorage.getItem('folio-theme') || 'dark') === 'light') document.body.classList.add('light');
document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('folio-theme', document.body.classList.contains('light') ? 'light' : 'dark');
});
document.getElementById('themeToggleAnalytics').addEventListener('click', () => {
  document.body.classList.toggle('light');
  localStorage.setItem('folio-theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

// ── Nav links ──────────────────────────────────────────
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href && href !== '#') { e.preventDefault(); const t = document.querySelector(href); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    this.classList.add('active');
  });
});

// ── PDF Import ────────────────────────────────────────
function loadPDFJS(cb) {
  if (window.pdfjsLib) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; cb(); };
  document.head.appendChild(s);
}

function openUploadPDFModal() {
  document.getElementById('pdfUploadStatus').textContent = '';
  document.getElementById('uploadPDFModal').classList.add('open');
}

document.getElementById('pdfModalCancel').addEventListener('click', () => document.getElementById('uploadPDFModal').classList.remove('open'));
document.getElementById('uploadPDFModal').addEventListener('click', e => { if (e.target === document.getElementById('uploadPDFModal')) document.getElementById('uploadPDFModal').classList.remove('open'); });

const pdfDropZone = document.getElementById('pdfDropZone');
pdfDropZone.addEventListener('dragover', e => { e.preventDefault(); pdfDropZone.style.borderColor = 'var(--amber)'; });
pdfDropZone.addEventListener('dragleave', () => { pdfDropZone.style.borderColor = 'rgba(212,135,42,0.35)'; });
pdfDropZone.addEventListener('drop', e => { e.preventDefault(); pdfDropZone.style.borderColor = 'rgba(212,135,42,0.35)'; const file = e.dataTransfer.files[0]; if (file && file.type === 'application/pdf') processPDFFile(file); });
document.getElementById('pdfFileInput').addEventListener('change', function() { if (this.files[0]) processPDFFile(this.files[0]); this.value = ''; });

async function processPDFFile(file) {
  const status = document.getElementById('pdfUploadStatus'); status.style.color = 'var(--cream2)'; status.textContent = '⏳ Reading file…';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer); let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    status.textContent = '⏳ Loading PDF.js…';
    loadPDFJS(async () => {
      try {
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages; status.textContent = `⏳ Detected ${numPages} pages…`;
        const bkName = file.name.replace(/\.pdf$/i, '').trim() || 'Imported PDF';
        const newBook = {
          id: uid(),
          name: bkName,
          pdfSourceName: bkName,
          treeData: [], highlights: {}, notes: {},
          lastOpened: Date.now(),
          isPDF: true, isPDFViewer: true,
          pdfBase64: base64, pdfNumPages: numPages,
          pageTimes: {}, pdfHighlights: {}
        };
        window.library.push(newBook); window.activeBookId = newBook.id;
        status.textContent = '⏳ Uploading to cloud…';
        await savePdfToStorage(newBook.id, base64); await saveBook(newBook);
        renderHomepage(); document.getElementById('uploadPDFModal').classList.remove('open');
        showToast(`✓ Imported "${bkName}" (${numPages} pages)`);
      } catch(err) { status.style.color = '#ff7070'; status.textContent = '❌ Error: ' + err.message; }
    });
  } catch(err) { status.style.color = '#ff7070'; status.textContent = '❌ Error: ' + err.message; }
}

// ── Export Book PDF ───────────────────────────────────
function openExportBookPDFModal() {
  const sel = document.getElementById('exportPDFBookSelect'); sel.innerHTML = '';
  if (!window.library.length) { showToast('No books yet.'); return; }
  window.library.forEach(book => { const opt = document.createElement('option'); opt.value = book.id; opt.textContent = book.name; sel.appendChild(opt); });
  const last = getLastBook(); if (last) sel.value = last.id;
  document.getElementById('exportBookPDFModal').classList.add('open');
}

document.getElementById('exportPDFCancel').addEventListener('click', () => document.getElementById('exportBookPDFModal').classList.remove('open'));
document.getElementById('exportBookPDFModal').addEventListener('click', e => { if (e.target === document.getElementById('exportBookPDFModal')) document.getElementById('exportBookPDFModal').classList.remove('open'); });
document.getElementById('exportPDFConfirm').addEventListener('click', () => {
  const bookId = document.getElementById('exportPDFBookSelect').value;
  const book = window.library.find(b => b.id === bookId); if (!book) return;
  document.getElementById('exportBookPDFModal').classList.remove('open');
  exportBookAsPDF(book);
});

function exportBookAsPDF(book) {
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(book.name)}</title><link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Merriweather',serif;font-size:13pt;line-height:1.8;color:#111;background:#fff;padding:0;}.book-title-page{page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:4rem;}.book-title-page h1{font-size:36pt;font-weight:300;}.chapter-heading{font-size:20pt;font-weight:300;margin:3rem 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #ddd;page-break-before:always;}.topic-heading{font-size:15pt;margin:2rem 0 0.8rem;}.section-content{margin:0 0 1.5rem;}.section-content p{margin-bottom:0.8em;}@page{margin:2.5cm 3cm;size:A4;}</style></head><body>`;
  html += `<div class="book-title-page"><h1>${escHtml(book.name)}</h1><p>Exported from Lexica</p></div>`;
  (book.treeData||[]).forEach(ch => {
    html += `<h2 class="chapter-heading">${escHtml(ch.name)}</h2>`;
    (ch.topics||[]).forEach(tp => {
      html += `<h3 class="topic-heading">${escHtml(tp.name)}</h3>`;
      (tp.sections||[]).forEach(sec => { if (sec.content && sec.content.trim()) html += `<div class="section-content">${sec.content}</div>`; });
    });
  });
  html += `</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { showToast('❌ Pop-up blocked — allow pop-ups'); return; }
  win.document.write(html); win.document.close(); win.onload = () => { win.focus(); win.print(); };
  showToast('✓ Opening print dialog…');
}

// ── Drag-drop backup restore ──────────────────────────
const dropOverlay = document.getElementById('dropRestoreOverlay');
let dragCounter = 0;
homepage.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragCounter++; dropOverlay.classList.add('visible'); } });
homepage.addEventListener('dragleave', e => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('visible'); } });
homepage.addEventListener('dragover', e => e.preventDefault());
homepage.addEventListener('drop', e => {
  e.preventDefault(); dragCounter = 0; dropOverlay.classList.remove('visible');
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.match(/\.html?$/i)) { showToast('❌ Drop an HTML backup file'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parser = new DOMParser(); const doc = parser.parseFromString(ev.target.result, 'text/html');
      const scriptEl = doc.getElementById('folio-embedded-data') || doc.getElementById('folio-backup-data');
      if (!scriptEl) { showToast('❌ No backup data found'); return; }
      const payload = JSON.parse(scriptEl.textContent);
      if (payload.library) {
        window.library = payload.library; window.activeBookId = payload.activeBookId || null;
        saveLibrary().then(() => renderHomepage()); showToast('✓ Library restored');
      } else if (payload.treeData) {
        const book = { id: uid(), name: payload.bookName||'Imported', treeData: payload.treeData||[], highlights: payload.highlights||{}, notes: payload.notes||{}, lastOpened: Date.now() };
        window.library.push(book); window.activeBookId = book.id; loadBookIntoEditor(book);
        saveBook(book); renderHomepage(); showToast(`✓ Imported "${book.name}"`);
      }
    } catch(err) { showToast('❌ Error: ' + err.message); }
  };
  reader.readAsText(file);
});

// Expose to HTML
window.openBookById = openBookById;
window.resumeLastBook = resumeLastBook;
window.openEditor = openEditor;
window.deleteBook = deleteBook;
window.openNewBookModal = openNewBookModal;
window.scrollToSection = scrollToSection;
window.openUploadPDFModal = openUploadPDFModal;
window.openExportBookPDFModal = openExportBookPDFModal;
window.saveAll = saveAll;
window.saveBook = saveBook;
window.saveLibrary = saveLibrary;
window.loadPdfFromStorage = loadPdfFromStorage;
window.savePdfToStorage = savePdfToStorage;
window.loadPDFJS = loadPDFJS;
window.getLastBook = getLastBook;
window.loadBookIntoEditor = loadBookIntoEditor;
window.timeAgo = timeAgo;
window.bookCoverGradient = bookCoverGradient;
window.uid = uid;
window.escHtml = escHtml;