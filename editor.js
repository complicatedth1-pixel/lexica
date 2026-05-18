// editor.js — Tree render, sections, toolbar, autosave, word count, mobile sidebar
// Owns: treeData, bookName, highlights, notes, selectedChapterId, selectedTopicId, _savedRange
// Must load last (reads globals from all other files)

'use strict';

let treeData = [], bookName = 'My Book', highlights = {}, notes = {};
let selectedChapterId = null, selectedTopicId = null;
let dragSrc = null, secDragSrc = null;
let _savedRange = null; // saved selection range for mobile highlight support

// ── Helpers ──────────────────────────────────────────
function getChapter(cid) { return treeData.find(c => c.id === cid); }
function getTopic(cid, tid) { const ch = getChapter(cid); return ch && ch.topics.find(t => t.id === tid); }
function getSelectedTopic() { return getTopic(selectedChapterId, selectedTopicId); }

function captureSel() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) { _savedRange = sel.getRangeAt(0).cloneRange(); }
}

function restoreSel() {
  if (!_savedRange) return false;
  // ── FIX: Validate that the saved range's nodes are still attached to the
  // document. After renderPage() replaces section DOM, _savedRange points to
  // detached nodes. addRange() on a detached range silently succeeds but
  // produces a collapsed selection, causing "no text selected" on next highlight.
  try {
    const sc = _savedRange.startContainer;
    const ec = _savedRange.endContainer;
    if (!document.contains(sc) || !document.contains(ec)) {
      _savedRange = null;
      return false;
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedRange);
    // Double-check the restored selection is not collapsed
    if (sel.isCollapsed) { _savedRange = null; return false; }
    return true;
  } catch(e) {
    _savedRange = null;
    return false;
  }
}

// ── Mobile sidebar ────────────────────────────────────
function toggleMobileSidebar() {
  const sb = document.getElementById('sidebar'); const ov = document.getElementById('sidebarOverlay');
  const isOpen = sb.classList.contains('mobile-open');
  if (isOpen) { sb.classList.remove('mobile-open'); ov.classList.remove('visible'); }
  else { sb.classList.remove('collapsed'); sb.classList.add('mobile-open'); ov.classList.add('visible'); }
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;

// ── Sidebar toggles ───────────────────────────────────
document.getElementById('sidebarToggle').addEventListener('click', function() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 768) { closeMobileSidebar(); return; }
  sb.classList.toggle('collapsed'); this.textContent = sb.classList.contains('collapsed') ? '›' : '‹';
});
document.getElementById('rpToggle').addEventListener('click', function() {
  const rp = document.getElementById('rightPanel'); rp.classList.toggle('collapsed');
  this.textContent = rp.classList.contains('collapsed') ? '‹' : '›';
});

// ── Sidebar resizer ───────────────────────────────────
(function() {
  const resizer = document.getElementById('sidebarResizer'), sidebar = document.getElementById('sidebar');
  let isResizing = false, startX = 0, startW = 0;
  resizer.addEventListener('mousedown', e => { if (sidebar.classList.contains('collapsed')) return; isResizing = true; startX = e.clientX; startW = sidebar.offsetWidth; resizer.classList.add('dragging'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (!isResizing) return; const newW = Math.min(520, Math.max(160, startW + (e.clientX - startX))); sidebar.style.width = newW + 'px'; document.documentElement.style.setProperty('--sidebar-w', newW + 'px'); });
  document.addEventListener('mouseup', () => { if (!isResizing) return; isResizing = false; resizer.classList.remove('dragging'); document.body.style.cursor = ''; document.body.style.userSelect = ''; });
})();

// ── Font / Font-size ──────────────────────────────────
document.getElementById('fontSizeSlider').addEventListener('input', function() { document.documentElement.style.setProperty('--font-size', this.value + 'px'); });
document.getElementById('fontPicker').addEventListener('change', function() { document.documentElement.style.setProperty('--font', this.value); });

// ── Tree render ───────────────────────────────────────
function renderTree(filter) {
  // Clear stale saved range whenever the tree re-renders (DOM is about to change)
  _savedRange = null;

  const list = document.getElementById('chapterList'); list.innerHTML = '';
  const q = (filter || '').toLowerCase();
  treeData.forEach(ch => {
    if (q && !ch.name.toLowerCase().includes(q) && !ch.topics.some(t => t.name.toLowerCase().includes(q))) return;
    const chRow = document.createElement('div');
    chRow.className = 'chapter-row' + (selectedChapterId === ch.id && !selectedTopicId ? ' selected' : '');
    chRow.dataset.cid = ch.id; chRow.draggable = true;
    chRow.innerHTML = `<span class="chapter-toggle ${ch.open?'open':''}">›</span><span class="chapter-icon">${ch.open?'📂':'📁'}</span><span class="chapter-name" data-cid="${ch.id}">${escHtml(ch.name)}</span><span class="chapter-actions"><button class="ch-act-btn" data-action="add-topic" data-cid="${ch.id}">📄+</button><button class="ch-act-btn" data-action="rename-ch" data-cid="${ch.id}">✎</button><button class="ch-act-btn" data-action="del-ch" data-cid="${ch.id}">✕</button></span>`;
    chRow.addEventListener('dragstart', e => { dragSrc = { type:'chapter', chapterId:ch.id }; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => chRow.classList.add('dragging'), 0); });
    chRow.addEventListener('dragend', () => chRow.classList.remove('dragging'));
    chRow.addEventListener('dragover', e => { e.preventDefault(); chRow.classList.add('drag-over'); });
    chRow.addEventListener('dragleave', () => chRow.classList.remove('drag-over'));
    chRow.addEventListener('drop', e => {
      e.preventDefault(); chRow.classList.remove('drag-over'); if (!dragSrc) return;
      if (dragSrc.type === 'chapter' && dragSrc.chapterId !== ch.id) { const fi = treeData.findIndex(c => c.id === dragSrc.chapterId), ti = treeData.findIndex(c => c.id === ch.id); const [m] = treeData.splice(fi,1); treeData.splice(ti,0,m); saveAll(); renderTree(q||''); }
      else if (dragSrc.type === 'topic') { const srcCh = getChapter(dragSrc.chapterId), tp = srcCh && srcCh.topics.find(t => t.id === dragSrc.topicId); if (tp && srcCh) { srcCh.topics = srcCh.topics.filter(t => t.id !== tp.id); ch.topics.push(tp); ch.open = true; saveAll(); renderTree(q||''); } }
      dragSrc = null;
    });
    chRow.querySelector('.chapter-toggle').addEventListener('click', e => { e.stopPropagation(); ch.open = !ch.open; saveAll(); renderTree(q||''); });
    chRow.querySelector('.chapter-icon').addEventListener('click', e => { e.stopPropagation(); ch.open = !ch.open; saveAll(); renderTree(q||''); });
    chRow.querySelector('.chapter-name').addEventListener('click', e => { e.stopPropagation(); selectedChapterId = ch.id; selectedTopicId = null; saveAll(); renderTree(q||''); renderPage(); if (window.innerWidth <= 768) closeMobileSidebar(); });
    chRow.querySelectorAll('.ch-act-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); const act = btn.dataset.action;
        if (act === 'add-topic') { ch.open = true; selectedChapterId = ch.id; saveAll(); renderTree(q||''); showNewTopicInput(ch.id); }
        else if (act === 'rename-ch') startRenameChapter(ch.id);
        else if (act === 'del-ch') { if (confirm(`Delete "${ch.name}" and all its topics?`)) { treeData = treeData.filter(c => c.id !== ch.id); if (selectedChapterId === ch.id) { selectedChapterId = null; selectedTopicId = null; } saveAll(); renderTree(q||''); renderPage(); } }
      });
    });
    list.appendChild(chRow);
    if (ch.open) {
      const wrap = document.createElement('div'); wrap.className = 'topics-list';
      ch.topics.forEach(tp => {
        if (q && !ch.name.toLowerCase().includes(q) && !tp.name.toLowerCase().includes(q)) return;
        const hasContent = tp.sections && tp.sections.some(s => s.content && s.content.trim());
        const tpRow = document.createElement('div');
        tpRow.className = 'topic-row' + (selectedTopicId === tp.id ? ' active' : '');
        tpRow.dataset.tid = tp.id; tpRow.draggable = true;
        tpRow.innerHTML = `<span class="topic-line"></span><span class="topic-indent"></span><span class="topic-icon">${hasContent?'📝':'📄'}</span><span class="topic-name" data-tid="${tp.id}">${escHtml(tp.name)}</span><span class="topic-actions"><button class="ch-act-btn" data-action="rename-tp" data-tid="${tp.id}" data-cid="${ch.id}">✎</button><button class="ch-act-btn" data-action="del-tp" data-tid="${tp.id}" data-cid="${ch.id}">✕</button></span>`;
        tpRow.addEventListener('dragstart', e => { dragSrc = { type:'topic', chapterId:ch.id, topicId:tp.id }; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => tpRow.classList.add('dragging'), 0); });
        tpRow.addEventListener('dragend', () => tpRow.classList.remove('dragging'));
        tpRow.addEventListener('dragover', e => { e.preventDefault(); tpRow.classList.add('drag-over'); });
        tpRow.addEventListener('dragleave', () => tpRow.classList.remove('drag-over'));
        tpRow.addEventListener('drop', e => {
          e.preventDefault(); tpRow.classList.remove('drag-over');
          if (!dragSrc || dragSrc.type !== 'topic' || dragSrc.topicId === tp.id) return;
          if (dragSrc.chapterId === ch.id) { const fi = ch.topics.findIndex(t => t.id === dragSrc.topicId), ti2 = ch.topics.findIndex(t => t.id === tp.id); const [m] = ch.topics.splice(fi,1); ch.topics.splice(ti2,0,m); }
          else { const sc = getChapter(dragSrc.chapterId), mt = sc && sc.topics.find(t => t.id === dragSrc.topicId); if (mt && sc) { sc.topics = sc.topics.filter(t => t.id !== mt.id); const ins = ch.topics.findIndex(t => t.id === tp.id); ch.topics.splice(ins,0,mt); } }
          saveAll(); renderTree(q||''); dragSrc = null;
        });
        tpRow.querySelector('.topic-name').addEventListener('click', e => { e.stopPropagation(); selectedChapterId = ch.id; selectedTopicId = tp.id; saveAll(); renderTree(q||''); renderPage(); if (window.innerWidth <= 768) closeMobileSidebar(); });
        tpRow.querySelectorAll('.ch-act-btn').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation(); const act = btn.dataset.action;
            if (act === 'rename-tp') startRenameTopic(ch.id, tp.id);
            else if (act === 'del-tp') { ch.topics = ch.topics.filter(t => t.id !== tp.id); if (selectedTopicId === tp.id) selectedTopicId = null; saveAll(); renderTree(q||''); renderPage(); }
          });
        });
        wrap.appendChild(tpRow);
      });
      list.appendChild(wrap);
    }
  });
  if (treeData.length === 0) {
    const emp = document.createElement('div'); emp.style.cssText = 'padding:14px 10px;font-size:11px;color:#443d58;font-family:sans-serif;line-height:1.7;font-style:italic;';
    emp.textContent = 'No chapters yet. Click 📁+ to create your first chapter.'; list.appendChild(emp);
  }
  injectChapterProgress();
}

function showNewChapterInput() {
  const list = document.getElementById('chapterList'); const row = document.createElement('div'); row.className = 'new-item-row';
  const inp = document.createElement('input'); inp.className = 'new-item-input'; inp.placeholder = 'Chapter name…'; inp.maxLength = 60; row.appendChild(inp); list.appendChild(row); inp.focus();
  function commit() { const name = inp.value.trim(); if (name) { const ch = { id: uid(), name, open:true, topics:[] }; treeData.push(ch); selectedChapterId = ch.id; selectedTopicId = null; saveAll(); } renderTree(); }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderTree(); }); inp.addEventListener('blur', commit);
}

function showNewTopicInput(chapterId) {
  const ch = getChapter(chapterId); if (!ch) return;
  const list = document.getElementById('chapterList'); let insertAfter = null;
  list.querySelectorAll('.chapter-row').forEach(r => { if (r.dataset.cid === chapterId) insertAfter = r; });
  const row = document.createElement('div'); row.className = 'new-item-row';
  const inp = document.createElement('input'); inp.className = 'new-item-input topic'; inp.placeholder = 'Topic name…'; inp.maxLength = 60; row.appendChild(inp);
  let topicsWrap = insertAfter ? insertAfter.nextElementSibling : null;
  if (topicsWrap && topicsWrap.classList.contains('topics-list')) topicsWrap.appendChild(row);
  else if (insertAfter) insertAfter.insertAdjacentElement('afterend', row);
  else list.appendChild(row);
  inp.focus();
  function commit() { const name = inp.value.trim(); if (name) { const tp = { id: uid(), name, sections:[] }; ch.topics.push(tp); selectedTopicId = tp.id; saveAll(); } renderTree(); renderPage(); }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderTree(); }); inp.addEventListener('blur', commit);
}

function startRenameChapter(cid) {
  const ch = getChapter(cid); if (!ch) return;
  const el = document.querySelector(`.chapter-name[data-cid="${cid}"]`); if (!el) return;
  const old = ch.name; el.contentEditable = 'true'; el.classList.add('editing'); el.focus();
  const r = document.createRange(); r.selectNodeContents(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
  function fin() { el.contentEditable = 'false'; el.classList.remove('editing'); ch.name = el.textContent.trim() || old; saveAll(); renderTree(); }
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); fin(); } }, { once:true });
  el.addEventListener('blur', fin, { once:true });
}

function startRenameTopic(cid, tid) {
  const ch = getChapter(cid); const tp = ch && ch.topics.find(t => t.id === tid); if (!tp) return;
  const el = document.querySelector(`.topic-name[data-tid="${tid}"]`); if (!el) return;
  const old = tp.name; el.contentEditable = 'true'; el.classList.add('editing'); el.focus();
  const r = document.createRange(); r.selectNodeContents(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
  function fin() { el.contentEditable = 'false'; el.classList.remove('editing'); tp.name = el.textContent.trim() || old; saveAll(); renderTree(); }
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); fin(); } }, { once:true });
  el.addEventListener('blur', fin, { once:true });
}

document.getElementById('newChapterBtn').addEventListener('click', () => showNewChapterInput());
document.getElementById('newTopicBtn').addEventListener('click', () => { if (selectedChapterId) { const ch = getChapter(selectedChapterId); if (ch) { ch.open = true; saveAll(); renderTree(); showNewTopicInput(selectedChapterId); } } else alert('Select a chapter first.'); });
document.getElementById('treeSearch').addEventListener('input', function() { renderTree(this.value); });

// ── Chapter progress bars ─────────────────────────────
function injectChapterProgress() {
  document.querySelectorAll('.chapter-row').forEach(chRow => {
    if (chRow.nextElementSibling && chRow.nextElementSibling.classList.contains('chapter-progress')) return;
    const cid = chRow.dataset.cid; const ch = getChapter(cid); if (!ch) return;
    let filled = 0, total = 0;
    (ch.topics||[]).forEach(tp => { (tp.sections||[]).forEach(s => { total++; if (s.content && s.content.trim()) filled++; }); });
    if (total === 0) return;
    const pct = Math.round((filled/total)*100);
    const prog = document.createElement('div'); prog.className = 'chapter-progress';
    prog.innerHTML = `${filled}/${total} sections<div class="chapter-progress-bar"><div class="chapter-progress-fill" style="width:${pct}%"></div></div>`;
    chRow.insertAdjacentElement('afterend', prog);
  });
}
new MutationObserver(injectChapterProgress).observe(document.getElementById('chapterList'), { childList:true, subtree:false });

// ── Page / Section renderer ───────────────────────────
function renderPage() {
  // Clear stale saved range — section DOM is about to be replaced
  _savedRange = null;

  const container = document.getElementById('sectionsContainer'), plainEditor = document.getElementById('editor');
  const titleBar = document.getElementById('pageTitleBar'), topicLabel = document.getElementById('pageTopicLabel');
  const chapterLabel = document.getElementById('pageChapterLabel'), pageProgress = document.getElementById('pageProgress');
  const tp = getSelectedTopic();
  if (!tp) {
    container.innerHTML = '';
    plainEditor.style.display = 'block';
    titleBar.style.display = 'none';
    // Show plain editor as a single A4 sheet
    plainEditor.classList.add('a4-editor-standalone');
    const markBtn = document.getElementById('markReadBtn'); if (markBtn) markBtn.style.display = 'none';
    updateWordCount(); return;
  }
  const ch = getChapter(selectedChapterId);
  plainEditor.style.display = 'none';
  plainEditor.classList.remove('a4-editor-standalone');
  titleBar.style.display = 'block';
  titleBar.style.marginBottom = '0';
  topicLabel.textContent = tp.name; chapterLabel.textContent = ch ? '— ' + ch.name : '';

  // ── Load this topic's accumulated time into the stopwatch display ──
  // (stopwatch.js owns swElapsed/swRunning; we only set display when stopped)
  if (!swRunning) {
    swElapsed = tp.timeSpent || 0;
    swSessionElapsed = 0;
    swDisplay.textContent = swElapsed > 0 ? swFormat(swElapsed) : '00:00';
  }

  if (ch && ch.topics) { const pn = ch.topics.findIndex(t => t.id === tp.id) + 1; pageProgress.textContent = `Page ${pn} of ${ch.topics.length}`; }
  const markBtn = document.getElementById('markReadBtn');
  if (markBtn) {
    markBtn.style.display = 'block';
    const isRead = tp.isRead || false;
    markBtn.textContent = isRead ? '✓ Read' : '○ Read';
    markBtn.style.background = isRead ? 'rgba(106,223,106,0.25)' : 'var(--glass2)';
    markBtn.style.color = isRead ? '#6adf6a' : 'var(--cream2)';
    markBtn.style.borderColor = isRead ? 'rgba(106,223,106,0.5)' : 'var(--border-color)';
  }
  if (!tp.sections) tp.sections = [];

  // ── A4 continuous flow: all sections in one scrollable sheet, page breaks are visual overlays ──
  container.innerHTML = '';

  // Topic header card (not an A4 sheet, just a label strip)
  const headerSheet = document.createElement('div');
  headerSheet.className = 'a4-topic-header';
  headerSheet.innerHTML = `<div class="a4-topic-name">${escHtml(tp.name)}</div><div class="a4-topic-meta">${ch ? escHtml(ch.name) : ''} ${pageProgress.textContent ? '· ' + pageProgress.textContent : ''}</div>`;
  container.appendChild(headerSheet);

  if (tp.sections.length === 0) {
    const emptySheet = document.createElement('div');
    emptySheet.className = 'a4-page-sheet';
    emptySheet.innerHTML = `<div style="padding:40px 0;text-align:center;font-family:sans-serif;font-size:13px;color:#a09080;font-style:italic;">No sections yet. Click <strong style="color:#c0b8d0;">⊞ Sections</strong> to add sections.</div>`;
    container.appendChild(emptySheet);
    updateWordCount(); return;
  }

  // Single continuous A4-width sheet that holds all sections
  const pageWrap = document.createElement('div');
  pageWrap.className = 'a4-page-wrap';
  const sheet = document.createElement('div');
  sheet.className = 'a4-page-sheet a4-continuous-sheet';
  pageWrap.appendChild(sheet);
  container.appendChild(pageWrap);

  // Overlay container for page-break ruler lines (positioned absolute over the sheet)
  const rulerOverlay = document.createElement('div');
  rulerOverlay.className = 'a4-ruler-overlay';
  pageWrap.appendChild(rulerOverlay);

  // A4 at 96dpi: content height per page = 1123px total - 56px top padding - 72px bottom padding = 995px
  const A4_TOTAL = 1123;
  const A4_PAD_TOP = 56;
  const A4_PAD_BOTTOM = 72;
  const A4_CONTENT = A4_TOTAL - A4_PAD_TOP - A4_PAD_BOTTOM; // 995px

  function updatePageRulers() {
    rulerOverlay.innerHTML = '';
    const sheetH = sheet.offsetHeight;
    const totalPages = Math.ceil((sheetH - A4_PAD_TOP) / A4_CONTENT);
    for (let p = 1; p < totalPages; p++) {
      const yInSheet = A4_PAD_TOP + p * A4_CONTENT;
      const ruler = document.createElement('div');
      ruler.className = 'a4-page-ruler';
      ruler.style.top = yInSheet + 'px';
      const label = document.createElement('span');
      label.className = 'a4-page-ruler-label';
      label.textContent = `Page ${p + 1}`;
      ruler.appendChild(label);
      rulerOverlay.appendChild(ruler);
    }
    // Update page count badge in topbar area
    const pgInfo = document.getElementById('pageProgress');
    if (pgInfo && ch && ch.topics) {
      const pn = ch.topics.findIndex(t => t.id === tp.id) + 1;
      pgInfo.textContent = `Page ${pn} of ${ch.topics.length}`;
    }
  }

  // Page number badge (top-right, purely cosmetic — shows visual A4 sheet count)
  const pgBadge = document.createElement('div');
  pgBadge.className = 'a4-page-number';
  pgBadge.textContent = '1';
  sheet.appendChild(pgBadge);

  // Update the cosmetic badge when scrolling (no time tracking side-effects)
  function updateCurrentPageBadge() {
    const docArea = document.querySelector('.doc-area');
    if (!docArea) return;
    const sheetTopInDocArea = sheet.offsetTop - docArea.scrollTop;
    const contentScrolled = Math.max(0, -sheetTopInDocArea - A4_PAD_TOP + docArea.clientHeight / 2);
    const currentPage = Math.max(1, Math.floor(contentScrolled / A4_CONTENT) + 1);
    pgBadge.textContent = currentPage;
  }

  const docAreaEl = document.querySelector('.doc-area');
  if (docAreaEl) {
    docAreaEl.addEventListener('scroll', updateCurrentPageBadge, { passive: true });
  }

  tp.sections.forEach((sec, idx) => {
    // Section wrapper (no page boundary enforced)
    const secWrap = document.createElement('div');
    secWrap.className = 'a4-section-wrap';
    secWrap.dataset.sid = sec.id;

    // Section header (title + collapse toggle)
    const secHeader = document.createElement('div');
    secHeader.className = 'a4-section-header';
    const isOpen = sec.open !== false;
    const hasContent = sec.content && sec.content.trim().length > 0;
    secHeader.innerHTML = `<span class="a4-sec-toggle ${isOpen ? 'open' : ''}">›</span><span class="a4-sec-title">${escHtml(sec.title)}</span><span class="section-status ${hasContent ? 'has-content' : ''}">${hasContent ? 'Has content' : 'Empty'}</span>`;
    secWrap.appendChild(secHeader);

    // Section body (the actual editor)
    const secBody = document.createElement('div');
    secBody.className = 'a4-section-body' + (isOpen ? '' : ' collapsed');

    const secEditor = document.createElement('div');
    secEditor.className = 'section-editor a4-section-editor';
    secEditor.contentEditable = 'true';
    secEditor.dataset.sid = sec.id;
    secEditor.innerHTML = sec.content || '';
    secBody.appendChild(secEditor);

    if (!hasContent) {
      const aiBtn = document.createElement('button');
      aiBtn.className = 'ai-gen-btn';
      aiBtn.dataset.sid = sec.id;
      aiBtn.textContent = '✨ Generate with AI';
      aiBtn.addEventListener('click', () => openAIGenForSection(sec));
      secBody.appendChild(aiBtn);
    }
    secWrap.appendChild(secBody);
    sheet.appendChild(secWrap);

    // Toggle collapse on header click
    secHeader.addEventListener('click', () => {
      sec.open = sec.open === false ? true : false;
      secHeader.querySelector('.a4-sec-toggle').classList.toggle('open', sec.open !== false);
      secBody.classList.toggle('collapsed', sec.open === false);
    });

    // Editor events
    secEditor.addEventListener('touchend', () => { setTimeout(() => captureSel(), 50); });
    secEditor.addEventListener('mouseup', () => captureSel());
    secEditor.addEventListener('keyup', () => captureSel());
    secEditor.addEventListener('input', () => {
      sec.content = secEditor.innerHTML;
      const hasC = secEditor.textContent.trim().length > 0;
      secHeader.querySelector('.section-status').textContent = hasC ? 'Has content' : 'Empty';
      secHeader.querySelector('.section-status').className = 'section-status' + (hasC ? ' has-content' : '');
      const aiBtn2 = secBody.querySelector('.ai-gen-btn'); if (aiBtn2 && hasC) aiBtn2.remove();
      triggerAutosave(); updateWordCount();
    });
    secEditor.addEventListener('click', e => { const a = e.target.closest('a'); if (a && a.href) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); } });
    secEditor.addEventListener('input', () => setTimeout(updateHL, 80));
    secEditor.addEventListener('paste', e => handleEditorPaste(e, secEditor, sec));

    // Update rulers whenever content changes height
    secEditor.addEventListener('input', () => {
      requestAnimationFrame(updatePageRulers);
    });
  });

  // Draw page rulers after initial render
  requestAnimationFrame(() => { updatePageRulers(); updateCurrentPageBadge(); });

  // Keep rulers updated when sheet resizes (images load, window resize)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => updatePageRulers());
    ro.observe(sheet);
    container._sheetRO = ro;
  }

  updateWordCount();
}

// ── Manage Sections Modal ─────────────────────────────
const manageSectionsModal = document.getElementById('manageSectionsModal');
document.getElementById('manageSectionsBtn').addEventListener('click', () => {
  const tp = getSelectedTopic(); if (!tp) { alert('Select a topic first.'); return; }
  if (!tp.sections) tp.sections = [];
  document.getElementById('manageSectionsSubtitle').textContent = `Sections for: ${tp.name}`;
  renderSectionsList(); manageSectionsModal.classList.add('open');
});
document.getElementById('manageSectionsClose').addEventListener('click', () => { manageSectionsModal.classList.remove('open'); renderPage(); saveAll(); });
manageSectionsModal.addEventListener('click', e => { if (e.target === manageSectionsModal) { manageSectionsModal.classList.remove('open'); renderPage(); saveAll(); } });
document.getElementById('addSectionBtn').addEventListener('click', () => { const tp = getSelectedTopic(); if (!tp) return; tp.sections.push({ id: uid(), title:`Section ${tp.sections.length+1}`, content:'', open:true }); saveAll(); renderSectionsList(); });

function renderSectionsList() {
  const tp = getSelectedTopic(); if (!tp) return;
  const list = document.getElementById('sectionsList'); list.innerHTML = '';
  tp.sections.forEach(sec => {
    const row = document.createElement('div'); row.className = 'sec-manage-row'; row.draggable = true; row.dataset.sid = sec.id;
    row.innerHTML = `<span class="sec-manage-drag">⠿</span><input class="sec-manage-input" value="${escHtml(sec.title)}" placeholder="Section title…"><button class="sec-manage-del">✕</button>`;
    row.querySelector('.sec-manage-input').addEventListener('change', function() { sec.title = this.value.trim() || sec.title; saveAll(); });
    row.querySelector('.sec-manage-del').addEventListener('click', () => { if (sec.content && sec.content.trim().length > 0) { if (!confirm(`Delete "${sec.title}"?`)) return; } tp.sections = tp.sections.filter(s => s.id !== sec.id); saveAll(); renderSectionsList(); });
    row.addEventListener('dragstart', e => { secDragSrc = sec.id; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => row.classList.add('dragging'), 0); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drag-over'); if (!secDragSrc || secDragSrc === sec.id) return; const fi = tp.sections.findIndex(s => s.id === secDragSrc), ti = tp.sections.findIndex(s => s.id === sec.id); const [m] = tp.sections.splice(fi,1); tp.sections.splice(ti,0,m); saveAll(); renderSectionsList(); secDragSrc = null; });
    list.appendChild(row);
  });
}

// ── Prompt builders ───────────────────────────────────
// These pull the active preset instructions from prompt-settings.js,
// then append a minimal structural task block so the output format
// stays consistent regardless of which preset is active.

function buildPagePrompt() {
  const tp = getSelectedTopic();
  const ch = getChapter(selectedChapterId);
  if (!tp || !ch) return '(No topic selected)';

  const sections = (tp.sections || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  // Pull full instructions from the active preset (falls back to built-in default)
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('page')
    : '';

  // Append the task-specific context block.
  // The preset's own TASK section already contains the full HTML template,
  // so we only need to inject the live book/chapter/page/section values.
  return `${instructions}

---

Book: ${bookName}
Chapter: ${ch.name}
Page (data-page): ${tp.name}
Sections to cover (in exact order):
${sections || '(none defined yet — create appropriate sections for this page)'}`;
}

function buildChapterPrompt() {
  // Pull full instructions from the active preset (falls back to built-in default)
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('index')
    : '';

  // Append the task-specific context block.
  // The preset's own TASK section already contains the full HTML template
  // (with .page and .section divs). We only inject the book name and topic placeholder.
  return `${instructions}

---

Book: ${bookName}

Topic to structure: [YOUR TOPIC HERE]`;
}

// ── Upload Page / Chapter Modals ──────────────────────
const uploadPageModal = document.getElementById('uploadPageModal');

document.getElementById('uploadPageBtn').addEventListener('click', () => {
  document.getElementById('pagePromptBox').textContent = buildPagePrompt();
  document.getElementById('uploadPageStatus').textContent = '';
  uploadPageModal.classList.add('open');
});
document.getElementById('uploadPageClose').addEventListener('click', () => uploadPageModal.classList.remove('open'));
uploadPageModal.addEventListener('click', e => { if (e.target === uploadPageModal) uploadPageModal.classList.remove('open'); });

const uploadChapterModal = document.getElementById('uploadChapterModal');

document.getElementById('uploadChapterBtn').addEventListener('click', () => {
  document.getElementById('chapterPromptBox').textContent = buildChapterPrompt();
  document.getElementById('uploadChapterStatus').textContent = '';
  uploadChapterModal.classList.add('open');
});
document.getElementById('uploadChapterClose').addEventListener('click', () => uploadChapterModal.classList.remove('open'));
uploadChapterModal.addEventListener('click', e => { if (e.target === uploadChapterModal) uploadChapterModal.classList.remove('open'); });

document.getElementById('uploadChapterFile').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
  const status = document.getElementById('uploadChapterStatus'); const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parser = new DOMParser(); const doc = parser.parseFromString(ev.target.result, 'text/html');
      const indexEl = doc.querySelector('.brain-index'); if (!indexEl) { status.textContent = '❌ No .brain-index found'; status.style.color = '#ff7070'; return; }
      const chName = (indexEl.querySelector('h1') || {}).textContent?.trim() || 'New Chapter';
      const pageEls = Array.from(indexEl.querySelectorAll('.page')).sort((a,b) => parseInt(a.getAttribute('order')||0)-parseInt(b.getAttribute('order')||0));
      if (!pageEls.length) { status.textContent = '❌ No page elements found'; status.style.color = '#ff7070'; return; }
      const ch = {
        id: uid(),
        name: chName,
        open: true,
        topics: pageEls.map(p => {
          // Page title: first line of text content (excludes nested .section text)
          const titleNode = p.querySelector('.page-title');
          const name = titleNode
            ? titleNode.textContent.trim()
            : p.childNodes[0]?.textContent?.trim() || p.textContent.trim().split('\n')[0].trim();
          // Sections: read .section divs inside this page, sorted by order attr
          const sectionEls = Array.from(p.querySelectorAll('.section')).sort(
            (a, b) => parseFloat(a.getAttribute('order') || 0) - parseFloat(b.getAttribute('order') || 0)
          );
          return {
            id: uid(),
            name,
            sections: sectionEls.map(s => ({
              id: uid(),
              title: s.textContent.trim(),
              content: '',
              open: true
            }))
          };
        })
      };
      treeData.push(ch); selectedChapterId = ch.id; selectedTopicId = null; saveAll(); renderTree(); renderPage();
      saveLibrary()
        .then(() => showToast(`✓ Index saved — "${chName}" with ${ch.topics.length} pages`))
        .catch(() => showToast(`✓ Index saved locally — "${chName}"`));
      status.textContent = `✓ Created "${chName}" with ${ch.topics.length} topics.`;
      status.style.color = '#90dba0';
      uploadChapterModal.classList.remove('open');
    } catch(err) { status.textContent = '❌ Error: ' + err.message; status.style.color = '#ff7070'; }
  };
  reader.readAsText(file); this.value = '';
});

let aiTargetSection = null;
function openAIGenForSection(sec) {
  const tp = getSelectedTopic();
  const ch = getChapter(selectedChapterId);
  if (!tp || !ch) return;
  aiTargetSection = sec;

  // Pull full page instructions from active preset
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('page')
    : '';

  // Inject single-section context. The preset template already includes
  // the full lesson-section HTML structure so we only supply live values.
  document.getElementById('pagePromptBox').textContent =
    `${instructions}

---

Book: ${bookName}
Chapter: ${ch.name}
Page (data-page): ${tp.name}
Sections to cover (in exact order):
1. ${sec.title}

NOTE: Generate content for this single section only.`;

  document.getElementById('uploadPageStatus').textContent = '';
  uploadPageModal.classList.add('open');
}

document.getElementById('uploadPageFile').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
  const status = document.getElementById('uploadPageStatus'); const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parser = new DOMParser(); const doc = parser.parseFromString(ev.target.result, 'text/html');
      const lessonEl = doc.querySelector('.lesson-content'); if (!lessonEl) { status.textContent = '❌ No .lesson-content found.'; status.style.color = '#ff7070'; return; }
      const tp = getSelectedTopic(); if (!tp || !tp.sections) { status.textContent = '❌ No topic selected.'; status.style.color = '#ff7070'; return; }
      const sectionEls = doc.querySelectorAll('.lesson-section'); let filled = 0;
      if (aiTargetSection) {
        // Single-section AI gen: match by data-title, fall back to first element
        const secEl = Array.from(sectionEls).find(
          el => (el.getAttribute('data-title') || '').trim().toLowerCase() === aiTargetSection.title.trim().toLowerCase()
        ) || sectionEls[0];
        if (secEl) { aiTargetSection.content = secEl.innerHTML; filled = 1; }
        aiTargetSection = null;
      } else {
        // Full-page upload: match each lesson-section to a topic section by data-title
        sectionEls.forEach(secEl => {
          const dt = secEl.getAttribute('data-title');
          const sec = tp.sections.find(s => s.title.trim().toLowerCase() === (dt || '').trim().toLowerCase());
          if (sec) { sec.content = secEl.innerHTML; filled++; }
        });
        // Fallback: positional matching if titles didn't align
        if (filled === 0) {
          sectionEls.forEach((secEl, i) => {
            if (tp.sections[i]) { tp.sections[i].content = secEl.innerHTML; filled++; }
          });
        }
      }
      saveAll(); renderPage(); renderTree();
      saveLibrary()
        .then(() => showToast(`✓ Page content saved — ${filled} section(s) filled`))
        .catch(() => showToast(`✓ Page saved locally — ${filled} section(s)`));
      status.textContent = `✓ Filled ${filled} section(s).`;
      status.style.color = '#90dba0';
      uploadPageModal.classList.remove('open');
    } catch(err) { status.textContent = '❌ Error: ' + err.message; status.style.color = '#ff7070'; }
  };
  reader.readAsText(file); this.value = '';
}, false);

window.copyPrompt = function(boxId, btnId) {
  const text = document.getElementById(boxId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById(btnId); const orig = btn.textContent;
    btn.textContent = '✓ Copied!'; btn.style.color = '#90dba0';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  }).catch(() => {
    const r = document.createRange(); r.selectNode(document.getElementById(boxId));
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    document.execCommand('copy');
  });
};

// ── Plain editor toolbar ──────────────────────────────
const editor = document.getElementById('editor');
editor.addEventListener('mouseup', captureSel);
editor.addEventListener('touchend', () => setTimeout(captureSel, 50));
editor.addEventListener('keyup', () => { captureSel(); updateStates(); });

function exec(cmd, val) { document.execCommand(cmd, false, val || null); editor.focus(); updateStates(); }
function applyColor(hex) { if (restoreSel()) { document.execCommand('foreColor', false, hex); _savedRange = null; } }
function updateStates() { document.getElementById('btn-bold').classList.toggle('active', document.queryCommandState('bold')); document.getElementById('btn-italic').classList.toggle('active', document.queryCommandState('italic')); }
function execOnActive(cmd, val) { const focused = document.activeElement; if (focused && (focused.classList.contains('section-editor') || focused.id === 'editor')) { focused.focus(); document.execCommand(cmd, false, val || null); } else { restoreSel(); document.execCommand(cmd, false, val || null); editor.focus(); } _savedRange = null; }

document.getElementById('btn-bold').addEventListener('mousedown', e => { e.preventDefault(); restoreSel(); exec('bold'); });
document.getElementById('btn-italic').addEventListener('mousedown', e => { e.preventDefault(); restoreSel(); exec('italic'); });
document.getElementById('btn-ul').addEventListener('mousedown', e => { e.preventDefault(); execOnActive('insertUnorderedList'); });
document.getElementById('btn-ol').addEventListener('mousedown', e => { e.preventDefault(); execOnActive('insertOrderedList'); });
document.getElementById('btn-h3').addEventListener('mousedown', e => { e.preventDefault(); execOnActive('formatBlock', 'h3'); });
document.getElementById('btn-bq').addEventListener('mousedown', e => { e.preventDefault(); execOnActive('formatBlock', 'blockquote'); });
document.getElementById('btn-link').addEventListener('mousedown', e => { e.preventDefault(); restoreSel(); const url = prompt('Enter URL:', 'https://'); if (url) exec('createLink', url); });
document.getElementById('btn-undo').addEventListener('mousedown', e => { e.preventDefault(); document.execCommand('undo'); setTimeout(updateHL, 60); });
document.getElementById('btn-redo').addEventListener('mousedown', e => { e.preventDefault(); document.execCommand('redo'); setTimeout(updateHL, 60); });

['color-black','color-red','color-green','color-blue','color-gold'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('mousedown', e => { e.preventDefault(); applyColor(el.style.background); });
  el.addEventListener('touchend', e => { e.preventDefault(); applyColor(el.style.background); });
});

editor.addEventListener('click', e => { const a = e.target.closest('a'); if (a && a.href) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); } });

// Highlight buttons
let activeHlType = null; // 'p', 'm', 'f', 'per', 'ins', or null

function setActiveHighlighter(type) {
  const hlP   = document.getElementById('hl-p');
  const hlM   = document.getElementById('hl-m');
  const hlF   = document.getElementById('hl-f');
  const hlPer = document.getElementById('hl-per');
  const hlIns = document.getElementById('hl-ins');
  if (activeHlType === type) {
    activeHlType = null;
    [hlP, hlM, hlF, hlPer, hlIns].forEach(el => el && el.classList.remove('hl-active'));
    showToast('Highlighter off');
  } else {
    activeHlType = type;
    hlP   && hlP.classList.toggle('hl-active', type === 'p');
    hlM   && hlM.classList.toggle('hl-active', type === 'm');
    hlF   && hlF.classList.toggle('hl-active', type === 'f');
    hlPer && hlPer.classList.toggle('hl-active', type === 'per');
    hlIns && hlIns.classList.toggle('hl-active', type === 'ins');
    const labels = { p:'Yellow (P)', m:'Green (M)', f:'Purple (F — Facts)', per:'Orange (Per — Personalities)', ins:'Cyan (Ins — Institutions)' };
    showToast('✦ ' + (labels[type] || type) + ' highlighter on');
  }
}

document.getElementById('hl-p').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('p'); });
document.getElementById('hl-m').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('m'); });
document.getElementById('hl-f').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('f'); });
document.getElementById('hl-per').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('per'); });
document.getElementById('hl-ins').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('ins'); });

// Auto-highlight on mouseup / touchend when a highlighter is active
const _hlColors = { p: '#ffe566', m: '#7ddb7d', f: '#a78bfa', per: '#fb923c', ins: '#22d3ee' };

document.addEventListener('mouseup', e => {
  if (!activeHlType) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const color = _hlColors[activeHlType] || '#ffe566';
  if (pdfMode && pdfCurrentPage !== null) applyHighlightToPDF(color, activeHlType);
  else applyPreciseHighlight(color, activeHlType);
});

document.addEventListener('touchend', e => {
  if (!activeHlType) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const color = _hlColors[activeHlType] || '#ffe566';
    if (pdfMode && pdfCurrentPage !== null) applyHighlightToPDF(color, activeHlType);
    else applyPreciseHighlight(color, activeHlType);
  }, 100);
});

document.getElementById('exportPDFBtn').addEventListener('click', () => window.print());

// ── Paste handler (images + tables) ──────────────────
function handleEditorPaste(e, editorEl, secObj) {
  const cd = e.clipboardData || window.clipboardData;
  if (!cd) return;

  // ── Image paste ──────────────────────────────────────
  const items = Array.from(cd.items || []);
  const imgItem = items.find(it => it.type.startsWith('image/'));
  if (imgItem) {
    e.preventDefault();
    const blob = imgItem.getAsFile();
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      img.style.margin = '0.5em 0';
      img.style.borderRadius = '4px';
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editorEl.appendChild(img);
      }
      if (secObj) { secObj.content = editorEl.innerHTML; }
      triggerAutosave();
      updateWordCount();
      setTimeout(updateHL, 80);
    };
    reader.readAsDataURL(blob);
    return;
  }

  // ── HTML paste (tables, rich content) ───────────────
  const html = cd.getData('text/html');
  if (html) {
    e.preventDefault();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Sanitise: fix images so they don't overflow
    tmp.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.removeAttribute('width');
      img.removeAttribute('height');
    });
    // Sanitise tables: make them scrollable-friendly
    tmp.querySelectorAll('table').forEach(tbl => {
      tbl.style.borderCollapse = 'collapse';
      tbl.style.width = '100%';
      tbl.style.fontSize = '13px';
      tbl.querySelectorAll('td, th').forEach(cell => {
        cell.style.border = '1px solid rgba(100,80,40,0.3)';
        cell.style.padding = '4px 8px';
        cell.style.wordBreak = 'break-word';
      });
    });
    // Strip unwanted outer wrappers but keep content
    const frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorEl.appendChild(frag);
    }
    if (secObj) { secObj.content = editorEl.innerHTML; }
    triggerAutosave();
    updateWordCount();
    setTimeout(updateHL, 80);
    return;
  }
}

function triggerAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveAll();
    const ind = document.getElementById('autosaveIndicator'); ind.classList.add('visible');
    setTimeout(() => ind.classList.remove('visible'), 1500);
  }, 1500);
}
document.getElementById('editor').addEventListener('input', () => { triggerAutosave(); updateWordCount(); });
document.getElementById('editor').addEventListener('paste', e => handleEditorPaste(e, document.getElementById('editor'), null));

async function doSaveDownload() { saveAll(); try { await saveLibrary(); showToast('✓ Synced to cloud'); } catch(e) { showToast('⚠ Sync failed'); } }
document.addEventListener('keydown', e => { const mod = e.ctrlKey || e.metaKey; if (mod && e.key === 's') { e.preventDefault(); doSaveDownload(); } });

// ── Word count ────────────────────────────────────────
function updateWordCount() {
  const editors = document.querySelectorAll('.section-editor, #editor'); let text = '';
  editors.forEach(el => { if (el.style.display !== 'none') text += el.textContent + ' '; });
  text = text.trim(); const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const el = document.getElementById('wordCount'); if (el) el.textContent = `${words.toLocaleString()} words`;
}

// ── Toast ─────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast'); toast.textContent = msg; toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}
window.showToast = showToast;

// ── Mark as Read ──────────────────────────────────────
function toggleMarkRead() {
  const tp = getSelectedTopic(); if (!tp) return;
  tp.isRead = !tp.isRead;
  saveAll();
  const markBtn = document.getElementById('markReadBtn');
  if (markBtn) {
    markBtn.textContent = tp.isRead ? '✓ Read' : '○ Read';
    markBtn.style.background = tp.isRead ? 'rgba(106,223,106,0.25)' : 'var(--glass2)';
    markBtn.style.color = tp.isRead ? '#6adf6a' : 'var(--cream2)';
    markBtn.style.borderColor = tp.isRead ? 'rgba(106,223,106,0.5)' : 'var(--border-color)';
  }
  renderTree();
  showToast(tp.isRead ? '✓ Marked as read' : '○ Marked as unread');
}
window.toggleMarkRead = toggleMarkRead;

// ── Custom Selection Menu ─────────────────────────────
// Search modal logic lives in search-modal.js (LexicaSearch global).
(function() {
  'use strict';

  // ── Build selection menu DOM ──────────────────────────
  const selMenu = document.createElement('div');
  selMenu.id = 'custom-sel-menu';
  selMenu.innerHTML = `
    <button data-action="copy"   title="Copy">⎘ Copy</button>
    <button data-action="modal"  title="Search & Insert">🔍 Search</button>
    <button data-action="newtab" title="Open in new tab">⧉ New Tab</button>
    <button data-action="ai"     title="AI (coming soon)" disabled>✦ AI</button>
  `;
  document.body.appendChild(selMenu);

  function showSelMenu(x, y, text) {
    selMenu.style.left = x + 'px';
    selMenu.style.top  = y + 'px';
    selMenu.classList.add('visible');
    selMenu.dataset.text = text;
    requestAnimationFrame(() => {
      const r = selMenu.getBoundingClientRect();
      if (r.right  > window.innerWidth  - 8) selMenu.style.left = (window.innerWidth  - r.width  - 8) + 'px';
      if (r.bottom > window.innerHeight - 8) selMenu.style.top  = (y - r.height - 10) + 'px';
    });
  }
  function hideSelMenu() { selMenu.classList.remove('visible'); }

  // ── Show on mouseup when no highlighter active ────────
  let _selTimer = null;
  document.addEventListener('mouseup', e => {
    if (activeHlType) return;
    if (e.target.closest('#custom-sel-menu') || e.target.closest('#srm-overlay')) return;
    clearTimeout(_selTimer);
    _selTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideSelMenu(); return; }
      const text = sel.toString().trim();
      try { navigator.clipboard.writeText(text); } catch(er) {}
      // Pass anchor to search modal module
      const range = sel.getRangeAt(0).cloneRange();
      if (window.LexicaSearch) window.LexicaSearch.setAnchor(range);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showSelMenu(rect.left + window.scrollX, rect.top + window.scrollY - 42, text);
    }, 350);
  });

  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#custom-sel-menu') && !e.target.closest('#srm-overlay')) {
      hideSelMenu();
    }
  });

  // ── Menu button actions ───────────────────────────────
  selMenu.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const text   = selMenu.dataset.text;
    if (action === 'copy') {
      navigator.clipboard.writeText(text).then(() => showToast('✓ Copied'));
      hideSelMenu();
    } else if (action === 'modal') {
      hideSelMenu();
      if (window.LexicaSearch) window.LexicaSearch.open(text);
    } else if (action === 'newtab') {
      window.open('https://www.bing.com/search?q=' + encodeURIComponent(text), '_blank', 'noopener');
      hideSelMenu();
    } else if (action === 'ai') {
      showToast('AI feature coming soon');
      hideSelMenu();
    }
  });
})();

// ── Init ──────────────────────────────────────────────
renderTree(); renderPage(); renderHomepage(); updateHL();