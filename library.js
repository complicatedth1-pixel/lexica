// library.js — window.library state, Supabase CRUD, homepage rendering, book/PDF modals
'use strict';

window.library = [];
window.activeBookId = null;
window._libraryLoaded = false;
window._editorLoadedForBook = null;

let _saveQueue = Promise.resolve();
function _enqueueSave(fn) {
  _saveQueue = _saveQueue.then(() => fn().catch(err => console.error('[saveQueue]', err)));
  return _saveQueue;
}

// ── Tab-visibility guard ──────────────────────────────
window._tabFocusedAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const awayMs = Date.now() - window._tabFocusedAt;
    if (awayMs > 30000 && currentUser) {
      _saveQueue.then(() => { window._libraryLoaded = false; loadLibraryFromSupabase(); });
    }
    window._tabFocusedAt = Date.now();
  } else {
    if (window.activeBookId && window._libraryLoaded) {
      saveAll();
      const active = window.library.find(b => b.id === window.activeBookId);
      if (active && !active.isPDFViewer) _enqueueSave(() => saveBook(active));
    }
    window._tabFocusedAt = Date.now();
  }
});

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

// ── Hero cover image ──────────────────────────────────
function updateHeroCover(book) {
  const heroBg = document.querySelector('.hero-bg');
  const heroSection = document.querySelector('.hero');
  if (!heroBg || !heroSection) return;

  if (book && book.coverImage) {
    heroBg.style.backgroundImage = `url(${CSS.escape ? book.coverImage : book.coverImage})`;
    heroBg.style.backgroundSize = 'cover';
    heroBg.style.backgroundPosition = 'center';
    heroBg.style.opacity = '0';
    heroSection.classList.add('has-cover');
    // Fade in
    requestAnimationFrame(() => {
      heroBg.style.transition = 'opacity 0.8s ease';
      heroBg.style.opacity = '0.35';
    });
  } else {
    heroBg.style.transition = 'opacity 0.4s ease';
    heroBg.style.opacity = '0';
    setTimeout(() => {
      heroBg.style.backgroundImage = '';
      heroSection.classList.remove('has-cover');
    }, 400);
  }
}

// ── Supabase CRUD ─────────────────────────────────────
async function saveBook(book) {
  if (!currentUser || !book) return;
  if (!window._libraryLoaded) return;
  const row = {
    id: book.id, user_id: currentUser.id, name: book.name || '',
    tree_data: book.treeData || [], highlights: book.highlights || {},
    notes: book.notes || {}, last_opened: book.lastOpened || 0,
    is_pdf: book.isPDF || false, is_pdf_viewer: book.isPDFViewer || false,
    pdf_num_pages: book.pdfNumPages || null, page_times: book.pageTimes || {},
    pdf_highlights: book.pdfHighlights || {},
    page_confirmed: book.pageConfirmed || {},
    cover_image: book.coverImage || null
  };
  const { error } = await sb.from('books').upsert(row, { onConflict: 'id,user_id' });
  if (error) console.error('[saveBook] upsert error:', error);
}

async function saveLibrary() {
  if (!currentUser) return;
  if (!window._libraryLoaded) return;
  for (const book of window.library) { await saveBook(book); }
  try { localStorage.setItem('folio-activeBook', window.activeBookId || ''); } catch(e){}
}

async function deleteBookFromDB(bookId) {
  if (!currentUser) return;
  await Promise.all([
    sb.from('books').delete().eq('id', bookId).eq('user_id', currentUser.id),
    sb.storage.from('pdfs').remove([`${currentUser.id}/${bookId}`])
  ]);
}

// ── Two-phase load ────────────────────────────────────
async function loadLibraryFromSupabase() {
  if (!currentUser) return;

  // Phase 1 — lightweight metadata
  const { data: metaRows, error: metaErr } = await sb
    .from('books')
    .select('id, name, last_opened, is_pdf, is_pdf_viewer, pdf_num_pages, cover_image')
    .eq('user_id', currentUser.id)
    .order('last_opened', { ascending: false });

  if (metaErr) { console.error('[loadLibrary] meta fetch error:', metaErr); window.library = []; }
  else {
    window.library = (metaRows || []).map(r => ({
      id: r.id, name: r.name,
      treeData: null,
      highlights: {}, notes: {},
      lastOpened: r.last_opened || 0,
      isPDF: r.is_pdf || false,
      isPDFViewer: r.is_pdf_viewer || false,
      pdfNumPages: r.pdf_num_pages || null,
      pageTimes: {}, pdfHighlights: {}, pageConfirmed: {},
      coverImage: r.cover_image || null
    }));
  }

  let storedId = null;
  try { storedId = localStorage.getItem('folio-activeBook') || null; } catch(e){}
  if (!storedId && window.library.length) storedId = window.library[0].id;
  window.activeBookId = storedId;
  try { if (window.activeBookId) localStorage.setItem('folio-activeBook', window.activeBookId); } catch(e){}

  window._libraryLoaded = true;
  renderHomepage();

  // Phase 2 — full data for active book
  if (window.activeBookId) {
    const { data: fullRows, error: fullErr } = await sb
      .from('books').select('*')
      .eq('id', window.activeBookId).eq('user_id', currentUser.id).single();

    if (!fullErr && fullRows) {
      const full = {
        id: fullRows.id, name: fullRows.name,
        treeData: fullRows.tree_data || [],
        highlights: fullRows.highlights || {},
        notes: fullRows.notes || {},
        lastOpened: fullRows.last_opened || 0,
        isPDF: fullRows.is_pdf || false,
        isPDFViewer: fullRows.is_pdf_viewer || false,
        pdfNumPages: fullRows.pdf_num_pages || null,
        pageTimes: fullRows.page_times || {},
        pdfHighlights: fullRows.pdf_highlights || {},
        pageConfirmed: fullRows.page_confirmed || {},
        coverImage: fullRows.cover_image || null
      };
      const idx = window.library.findIndex(b => b.id === full.id);
      if (idx !== -1) window.library[idx] = full; else window.library.unshift(full);
      if (!full.isPDFViewer && typeof loadBookIntoEditor === 'function') loadBookIntoEditor(full);
      renderHomepage();
    }
  }
}

async function _ensureBookFullyLoaded(bookId) {
  const book = window.library.find(b => b.id === bookId);
  if (!book) return null;
  if (book.treeData !== null) return book;
  const { data, error } = await sb.from('books').select('*')
    .eq('id', bookId).eq('user_id', currentUser.id).single();
  if (error || !data) return book;
  book.treeData = data.tree_data || [];
  book.highlights = data.highlights || {};
  book.notes = data.notes || {};
  book.pageTimes = data.page_times || {};
  book.pdfHighlights = data.pdf_highlights || {};
  book.pageConfirmed = data.page_confirmed || {};
  book.coverImage = data.cover_image || null;
  return book;
}

async function savePdfToStorage(bookId, base64) {
  if (!currentUser) return;
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  await sb.storage.from('pdfs').upload(`${currentUser.id}/${bookId}`, blob, { upsert: true, contentType: 'application/pdf' });
}

async function loadPdfFromStorage(bookId) {
  if (!currentUser) return null;
  const { data, error } = await sb.storage.from('pdfs').download(`${currentUser.id}/${bookId}`);
  if (error || !data) return null;
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(data); });
}

// ── In-memory sync ────────────────────────────────────
function saveAll() {
  if (!window._libraryLoaded) return;
  if (typeof treeData === 'undefined') return;
  if (!window.activeBookId && window._editorLoadedForBook) {
    window.activeBookId = window._editorLoadedForBook;
    try { localStorage.setItem('folio-activeBook', window.activeBookId); } catch(e){}
  }
  if (window.activeBookId) {
    const book = window.library.find(b => b.id === window.activeBookId);
    if (book && !book.isPDFViewer) {
      if (window._editorLoadedForBook !== window.activeBookId) return;
      book.treeData = treeData;
      book.name = bookName;
      book.highlights = highlights;
      book.notes = notes;
      book.lastOpened = Date.now();
      _enqueueSave(() => saveBook(book));
    }
  }
}

function loadBookIntoEditor(book) {
  window.treeData = treeData = book.treeData || [];
  window.bookName = bookName = book.name || 'My Book';
  window.highlights = highlights = book.highlights || {};
  window.notes = notes = book.notes || {};
  if (window._editorLoadedForBook !== book.id) {
    window.selectedChapterId = selectedChapterId = null;
    window.selectedTopicId = selectedTopicId = null;
  }
  window._editorLoadedForBook = book.id;
  window.activeBookId = book.id;
  try { localStorage.setItem('folio-activeBook', book.id); } catch(e){}
}

// ── Book cover image helpers ──────────────────────────
// Compress image to base64, max 800px wide, quality 0.75
function _compressImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Called from the book cover modal
window.openBookCoverModal = function(bookId) {
  const book = window.library.find(b => b.id === (bookId || window.activeBookId));
  if (!book) return;
  const modal = document.getElementById('bookCoverModal');
  const preview = document.getElementById('bookCoverPreview');
  const urlInput = document.getElementById('bookCoverUrlInput');
  modal.dataset.bookId = book.id;
  preview.src = book.coverImage || '';
  preview.style.display = book.coverImage ? 'block' : 'none';
  urlInput.value = '';
  document.getElementById('bookCoverStatus').textContent = '';
  modal.classList.add('open');
};

window.closeBookCoverModal = function() {
  document.getElementById('bookCoverModal').classList.remove('open');
};

window.saveBookCoverFromUrl = async function() {
  const url = document.getElementById('bookCoverUrlInput').value.trim();
  const status = document.getElementById('bookCoverStatus');
  if (!url) { status.textContent = 'Enter a URL'; return; }
  const modal = document.getElementById('bookCoverModal');
  const book = window.library.find(b => b.id === modal.dataset.bookId);
  if (!book) return;
  status.textContent = 'Testing URL…';
  // Validate the URL loads as an image
  const img = new Image();
  img.onload = async () => {
    book.coverImage = url;
    _enqueueSave(() => saveBook(book));
    document.getElementById('bookCoverPreview').src = url;
    document.getElementById('bookCoverPreview').style.display = 'block';
    status.textContent = '✓ Cover saved';
    renderHomepage();
  };
  img.onerror = () => { status.textContent = '❌ Could not load image from that URL'; };
  img.src = url;
};

window.handleBookCoverFileUpload = async function(input) {
  const file = input.files[0]; if (!file) return;
  const status = document.getElementById('bookCoverStatus');
  const modal = document.getElementById('bookCoverModal');
  const book = window.library.find(b => b.id === modal.dataset.bookId);
  if (!book) return;
  status.textContent = '⏳ Compressing…';
  try {
    const dataUrl = await _compressImage(file, 1200, 0.8);
    book.coverImage = dataUrl;
    _enqueueSave(() => saveBook(book));
    document.getElementById('bookCoverPreview').src = dataUrl;
    document.getElementById('bookCoverPreview').style.display = 'block';
    status.textContent = '✓ Cover saved';
    renderHomepage();
  } catch(e) {
    status.textContent = '❌ Could not read image';
  }
  input.value = '';
};

window.removeBookCover = function() {
  const modal = document.getElementById('bookCoverModal');
  const book = window.library.find(b => b.id === modal.dataset.bookId);
  if (!book) return;
  book.coverImage = null;
  _enqueueSave(() => saveBook(book));
  document.getElementById('bookCoverPreview').src = '';
  document.getElementById('bookCoverPreview').style.display = 'none';
  document.getElementById('bookCoverStatus').textContent = '✓ Cover removed';
  renderHomepage();
};

// ── Homepage render ───────────────────────────────────
function renderHomepage() {
  const lastBook = getLastBook();

  // Update hero cover image with the most-recently-opened book
  updateHeroCover(lastBook);

  const heroResumeBtn = document.getElementById('heroResumeBtn');
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
    const coverStyle = lastBook.coverImage
      ? `background-image:url(${escHtml(lastBook.coverImage)});background-size:cover;background-position:center;`
      : bookCoverGradient(lastBook.name);
    lastBookCard.innerHTML = `<div class="last-book-card" onclick="openBookById('${lastBook.id}')">
      <div class="lbc-cover" style="${coverStyle}">
        <div class="lbc-cover-title">${escHtml(lastBook.name)}</div>
        <div class="lbc-cover-overlay"><span class="lbc-open-btn">Open →</span></div>
        <button class="lbc-cover-edit-btn" onclick="event.stopPropagation();openBookCoverModal('${lastBook.id}')" title="Change cover">🖼</button>
      </div>
      <div class="lbc-info"><div class="lbc-name">${escHtml(lastBook.name)}</div>
      <div class="lbc-meta">${chapters.length} ch · ${totalTopics} topics · ${ago}</div>
      ${totalSections > 0 ? `<div class="lbc-progress-label">${filledSections}/${totalSections} sections (${pct}%)</div><div class="lbc-progress-track"><div class="lbc-progress-fill" style="width:${pct}%"></div></div>` : ''}
      <div class="lbc-actions">
        <button class="btn-primary" style="font-size:11px;padding:.5rem 1.2rem;" onclick="event.stopPropagation();openBookById('${lastBook.id}')">Open</button>
        <button class="btn-ghost" style="font-size:11px;padding:.45rem 1rem;" onclick="event.stopPropagation();openBookCoverModal('${lastBook.id}')">🖼 Cover</button>
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
      const chs = book.treeData ? book.treeData.length : '…';
      const tps = book.treeData ? book.treeData.reduce((a,c) => a + (c.topics||[]).length, 0) : '…';
      const isActive = book.id === window.activeBookId;
      const coverStyle = book.coverImage
        ? `background-image:url(${escHtml(book.coverImage)});background-size:cover;background-position:center;`
        : bookCoverGradient(book.name);
      return `<div class="book-card" onclick="openBookById('${book.id}')">
        <div class="book-cover-block" style="${coverStyle}">
          <div class="book-cover-title" style="${book.coverImage ? 'text-shadow:0 2px 8px rgba(0,0,0,0.8);' : ''}">${escHtml(book.name)}</div>
          <div class="book-cover-overlay"><button class="book-open-btn">Open →</button></div>
          ${isActive ? '<div class="book-active-badge">✦ Active</div>' : ''}
          <button class="book-cover-edit-badge" onclick="event.stopPropagation();openBookCoverModal('${book.id}')" title="Change cover">🖼</button>
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

async function openBookById(bookId) {
  if (window.activeBookId && window.activeBookId !== bookId) {
    const outgoing = window.library.find(b => b.id === window.activeBookId);
    if (outgoing && !outgoing.isPDFViewer) saveAll();
  }
  const book = await _ensureBookFullyLoaded(bookId);
  if (!book) return;
  window.activeBookId = bookId;
  book.lastOpened = Date.now();
  try { localStorage.setItem('folio-activeBook', bookId); } catch(e){}
  _enqueueSave(() => saveBook(book));
  if (book.isPDFViewer) { openPDFViewer(book); return; }
  loadBookIntoEditor(book);
  document.getElementById('sidebarBookTitle').textContent = bookName;
  homepage.classList.add('hidden'); editorShell.classList.add('visible');
  renderTree(); renderPage();
}

function resumeLastBook() { const last = getLastBook(); if (last) openBookById(last.id); }

function openEditor(bName) {
  if (bName) {
    const book = { id: uid(), name: bName, treeData: [], highlights: {}, notes: {}, lastOpened: Date.now(), coverImage: null };
    window.library.push(book); window.activeBookId = book.id;
    try { localStorage.setItem('folio-activeBook', book.id); } catch(e){}
    loadBookIntoEditor(book);
    _enqueueSave(() => saveBook(book));
    document.getElementById('sidebarBookTitle').textContent = bookName;
    homepage.classList.add('hidden'); editorShell.classList.add('visible');
    renderTree(); renderPage();
  } else { const last = getLastBook(); if (last) openBookById(last.id); else openNewBookModal(); }
}

async function goHome() {
  if (window.activeBookId) {
    const active = window.library.find(b => b.id === window.activeBookId);
    if (active && !active.isPDFViewer) { saveAll(); await _saveQueue; }
  }
  window._editorLoadedForBook = null;
  editorShell.classList.remove('visible'); homepage.classList.remove('hidden'); renderHomepage();
}
document.getElementById('homeLink').addEventListener('click', goHome);

function deleteBook(bookId) {
  if (!confirm('Delete this book? This cannot be undone.')) return;
  window.library = window.library.filter(b => b.id !== bookId);
  if (window.activeBookId === bookId) {
    window.activeBookId = null; window._editorLoadedForBook = null;
    try { localStorage.removeItem('folio-activeBook'); } catch(e){}
  }
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
  const book = { id: uid(), name, treeData: [], highlights: {}, notes: {}, lastOpened: Date.now(), coverImage: null };
  window.library.push(book); window.activeBookId = book.id;
  try { localStorage.setItem('folio-activeBook', book.id); } catch(e){}
  loadBookIntoEditor(book);
  _enqueueSave(() => saveBook(book));
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
        const newBook = { id: uid(), name: bkName, pdfSourceName: bkName, treeData: [], highlights: {}, notes: {}, lastOpened: Date.now(), isPDF: true, isPDFViewer: true, pdfBase64: base64, pdfNumPages: numPages, pageTimes: {}, pdfHighlights: {}, coverImage: null };
        window.library.push(newBook); window.activeBookId = newBook.id;
        try { localStorage.setItem('folio-activeBook', newBook.id); } catch(e){}
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
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escHtml(book.name)}</title><link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Merriweather',serif;font-size:13pt;line-height:1.8;color:#111;background:#fff;}.book-title-page{page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:4rem;}.book-title-page h1{font-size:36pt;font-weight:300;}.chapter-heading{font-size:20pt;font-weight:300;margin:3rem 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #ddd;page-break-before:always;}.topic-heading{font-size:15pt;margin:2rem 0 0.8rem;}.section-content{margin:0 0 1.5rem;}@page{margin:2.5cm 3cm;size:A4;}</style></head><body>`;
  html += `<div class="book-title-page">${book.coverImage ? `<img src="${escHtml(book.coverImage)}" style="max-width:280px;max-height:360px;object-fit:cover;border-radius:4px;margin-bottom:2rem;">` : ''}<h1>${escHtml(book.name)}</h1><p>Exported from Lexica</p></div>`;
  (book.treeData||[]).forEach(ch => {
    html += `<h2 class="chapter-heading">${escHtml(ch.name)}</h2>`;
    (ch.topics||[]).forEach(tp => {
      html += `<h3 class="topic-heading">${escHtml(tp.name)}</h3>`;
      (tp.sections||[]).forEach(sec => { if (sec.content && sec.content.trim()) html += `<div class="section-content">${sec.content}</div>`; });
    });
  });
  html += `</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { showToast('❌ Pop-up blocked'); return; }
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
        const book = { id: uid(), name: payload.bookName||'Imported', treeData: payload.treeData||[], highlights: payload.highlights||{}, notes: payload.notes||{}, lastOpened: Date.now(), coverImage: null };
        window.library.push(book); window.activeBookId = book.id; loadBookIntoEditor(book);
        saveBook(book); renderHomepage(); showToast(`✓ Imported "${book.name}"`);
      }
    } catch(err) { showToast('❌ Error: ' + err.message); }
  };
  reader.readAsText(file);
});

// ── Notify auth.js that library is ready ─────────────
if (typeof window._onLibraryReady === 'function') window._onLibraryReady();

// Expose
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