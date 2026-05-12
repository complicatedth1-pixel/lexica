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
  if (!tp) { container.innerHTML = ''; plainEditor.style.display = 'block'; titleBar.style.display = 'none'; updateWordCount(); return; }
  const ch = getChapter(selectedChapterId);
  plainEditor.style.display = 'none'; titleBar.style.display = 'block';
  topicLabel.textContent = tp.name; chapterLabel.textContent = ch ? '— ' + ch.name : '';
  if (!swRunning) { swElapsed = tp.timeSpent || 0; swSessionElapsed = 0; swDisplay.textContent = swElapsed > 0 ? swFormat(swElapsed) : '00:00'; }
  if (ch && ch.topics) { const pn = ch.topics.findIndex(t => t.id === tp.id) + 1; pageProgress.textContent = `Page ${pn} of ${ch.topics.length}`; }

  // ── Confirmation tick ──
  // Remove existing confirm btn if any (from previous render)
  const oldConfirmBtn = document.getElementById('pageConfirmBtn');
  if (oldConfirmBtn) oldConfirmBtn.remove();
  const isConfirmed = tp.confirmed === true;
  const confirmBtn = document.createElement('button');
  confirmBtn.id = 'pageConfirmBtn';
  confirmBtn.title = isConfirmed ? 'Mark as unread' : 'Confirm page read';
  confirmBtn.textContent = isConfirmed ? '✓ Read' : '○ Mark as Read';
  confirmBtn.style.cssText = `margin-top:6px;display:inline-flex;align-items:center;gap:5px;background:${isConfirmed?'rgba(90,180,90,0.18)':'rgba(255,255,255,0.05)'};border:1px solid ${isConfirmed?'rgba(90,180,90,0.4)':'rgba(255,255,255,0.12)'};color:${isConfirmed?'#80d880':'#887fa0'};font-family:sans-serif;font-size:11px;letter-spacing:.06em;padding:4px 10px;border-radius:4px;cursor:pointer;transition:all .15s;`;
  confirmBtn.addEventListener('click', () => {
    tp.confirmed = !tp.confirmed;
    saveAll();
    renderPage();
    showToast(tp.confirmed ? '✓ Page marked as read' : 'Page unmarked');
  });
  pageTitleBar.appendChild(confirmBtn);

  if (!tp.sections) tp.sections = [];
  if (tp.sections.length === 0) { container.innerHTML = `<div style="padding:20px 0;text-align:center;font-family:sans-serif;font-size:13px;color:#a09080;font-style:italic;">No sections yet. Click <strong style="color:#c0b8d0;">⊞ Sections</strong> to add sections.</div>`; updateWordCount(); return; }
  container.innerHTML = '';
  tp.sections.forEach(sec => {
    const block = document.createElement('div'); block.className = 'section-block'; block.dataset.sid = sec.id;
    const hasContent = sec.content && sec.content.trim().length > 0;
    const isOpen = sec.open !== false;
    block.innerHTML = `<div class="section-header" data-sid="${sec.id}"><span class="section-toggle-icon ${isOpen?'open':''}">›</span><span class="section-title-label">${escHtml(sec.title)}</span><span class="section-status ${hasContent?'has-content':''}">${hasContent?'Has content':'Empty'}</span></div><div class="section-body ${isOpen?'':'collapsed'}"><div class="section-editor" contenteditable="true" data-sid="${sec.id}">${sec.content||''}</div>${!hasContent ? '<button class="ai-gen-btn" data-sid="' + sec.id + '">✨ Generate with AI</button>' : ''}</div>`;
    block.querySelector('.section-header').addEventListener('click', () => { sec.open = sec.open === false; block.querySelector('.section-toggle-icon').classList.toggle('open', sec.open !== false); block.querySelector('.section-body').classList.toggle('collapsed', sec.open === false); });
    const secEditor = block.querySelector('.section-editor');
    secEditor.addEventListener('touchend', () => { setTimeout(() => captureSel(), 50); });
    secEditor.addEventListener('mouseup', () => captureSel());
    secEditor.addEventListener('keyup', () => captureSel());
    secEditor.addEventListener('input', () => { sec.content = secEditor.innerHTML; const hasC = secEditor.textContent.trim().length > 0; block.querySelector('.section-status').textContent = hasC ? 'Has content' : 'Empty'; block.querySelector('.section-status').className = 'section-status' + (hasC ? ' has-content' : ''); const aiBtn = block.querySelector('.ai-gen-btn'); if (aiBtn && hasC) aiBtn.remove(); triggerAutosave(); updateWordCount(); });
    secEditor.addEventListener('click', e => { const a = e.target.closest('a'); if (a && a.href) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); } });
    secEditor.addEventListener('input', () => setTimeout(updateHL, 80));
    const aiGenBtn = block.querySelector('.ai-gen-btn'); if (aiGenBtn) aiGenBtn.addEventListener('click', () => openAIGenForSection(sec));
    container.appendChild(block);
  });
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

// ── Upload Page / Chapter Modals ──────────────────────
const uploadPageModal = document.getElementById('uploadPageModal');
function buildPagePrompt() {
  const tp = getSelectedTopic();
  const ch = getChapter(selectedChapterId);
  if (!tp || !ch) return '(No topic selected)';
 
  const sections = (tp.sections || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n');
 
  // Get active instructions from preset system (falls back to default if none set)
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('page')
    : '';
 
  return `${instructions ? instructions + '\n\n---\n\n' : ''}TASK: Write structured lesson content for this specific page.
 
Book: ${bookName}
Chapter: ${ch.name}
Page: ${tp.name}
Sections to cover (in order):
${sections || '(none)'}
 
OUTPUT ONLY this HTML, no preamble, no markdown fences:
 
<!DOCTYPE html>
<html>
<body>
<div class="lesson-content" data-page="${tp.name}">
  <div class="lesson-section" data-title="[EXACT SECTION 1 TITLE]">
    <h3>[Section 1 Title]</h3>
    <p>Content for section 1...</p>
  </div>
  <div class="lesson-section" data-title="[EXACT SECTION 2 TITLE]">
    <h3>[Section 2 Title]</h3>
    <p>Content for section 2...</p>
  </div>
</div>
</body>
</html>
 
CRITICAL RULES:
1. Each <div class="lesson-section"> must have data-title="..." that is EXACTLY the section title as listed above (character-for-character match).
2. Output one .lesson-section per section listed — no more, no less.
3. Use <h3> for sub-headings inside a section, <p> for paragraphs, <ul>/<ol> for lists, <blockquote> for key insights.
4. Make content thorough — 150-400 words per section.
5. Include clickable source links as <a href="url" target="_blank">Source</a>`;
}
document.getElementById('uploadPageBtn').addEventListener('click', () => {
  document.getElementById('pagePromptBox').textContent = buildPagePrompt();
  document.getElementById('uploadPageStatus').textContent = '';
  uploadPageModal.classList.add('open');
});
document.getElementById('uploadPageClose').addEventListener('click', () => uploadPageModal.classList.remove('open'));
uploadPageModal.addEventListener('click', e => { if (e.target === uploadPageModal) uploadPageModal.classList.remove('open'); });

const uploadChapterModal = document.getElementById('uploadChapterModal');
function buildChapterPrompt() {
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('index')
    : '';
 
  return `${instructions ? instructions + '\n\n---\n\n' : ''}TASK: Create a complete chapter structure with pages for the topic I give you.
 
Book: ${bookName}
 
OUTPUT ONLY this HTML, no explanation:
 
<!DOCTYPE html>
<html>
<body>
<div class="brain-index">
  <h1>[CHAPTER NAME]</h1>
  <div class="page" order="1">[Page 1 Title]</div>
  <div class="page" order="2">[Page 2 Title]</div>
  <div class="page" order="3">[Page 3 Title]</div>
</div>
</body>
</html>
 
Rules:
- h1 = exact chapter name
- Each .page = one learnable topic (4-8 pages per chapter)
- Page titles should be specific and action-oriented (e.g. "1.1 Agriculture ka structural paradox" not just "Agriculture")
- Order attribute determines sequence
 
Now create chapter and pages for: [YOUR TOPIC HERE]`;
}
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
      const ch = { id: uid(), name: chName, open: true, topics: pageEls.map(p => { const name = p.textContent.trim().split('\n')[0].trim(); const sectionEls = Array.from(p.querySelectorAll('.section')).sort((a,b) => parseFloat(a.getAttribute('order')||0)-parseFloat(b.getAttribute('order')||0)); return { id: uid(), name, sections: sectionEls.map(s => ({ id: uid(), title: s.textContent.trim(), content: '', open: true })) }; }) };
      treeData.push(ch); selectedChapterId = ch.id; selectedTopicId = null; saveAll(); renderTree(); renderPage();
      status.textContent = `✓ Created "${chName}" with ${ch.topics.length} topics.`; status.style.color = '#90dba0'; uploadChapterModal.classList.remove('open');
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
 
  const instructions = window.promptSettings
    ? window.promptSettings.getInstructions('page')
    : '';
 
  document.getElementById('pagePromptBox').textContent =
    `${instructions ? instructions + '\n\n---\n\n' : ''}TASK: Write content for a single section.
 
Book: ${bookName}
Chapter: ${ch.name}
Section: ${sec.title}
 
OUTPUT ONLY this HTML, no preamble, no markdown fences:
 
<!DOCTYPE html>
<html>
<body>
<div class="lesson-content">
  <div class="lesson-section" data-title="${sec.title}">
    <h3>${escHtml(sec.title)}</h3>
    <p>Content...</p>
  </div>
</div>
</body>
</html>`;
 
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
        const secEl = Array.from(sectionEls).find(el => (el.getAttribute('data-title')||'').trim().toLowerCase() === aiTargetSection.title.trim().toLowerCase()) || sectionEls[0];
        if (secEl) { aiTargetSection.content = secEl.innerHTML; filled = 1; } aiTargetSection = null;
      } else {
        sectionEls.forEach(secEl => { const dt = secEl.getAttribute('data-title'); const sec = tp.sections.find(s => s.title.trim().toLowerCase() === (dt||'').trim().toLowerCase()); if (sec) { sec.content = secEl.innerHTML; filled++; } });
        if (filled === 0) sectionEls.forEach((secEl, i) => { if (tp.sections[i]) { tp.sections[i].content = secEl.innerHTML; filled++; } });
      }
      saveAll(); renderPage(); renderTree(); status.textContent = `✓ Filled ${filled} section(s).`; status.style.color = '#90dba0'; uploadPageModal.classList.remove('open');
    } catch(err) { status.textContent = '❌ Error: ' + err.message; status.style.color = '#ff7070'; }
  };
  reader.readAsText(file); this.value = '';
}, false);

window.copyPrompt = function(boxId, btnId) {
  const text = document.getElementById(boxId).textContent;
  navigator.clipboard.writeText(text).then(() => { const btn = document.getElementById(btnId); const orig = btn.textContent; btn.textContent = '✓ Copied!'; btn.style.color = '#90dba0'; setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000); })
  .catch(() => { const r = document.createRange(); r.selectNode(document.getElementById(boxId)); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); document.execCommand('copy'); });
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
let activeHlType = null; // 'p', 'm', or null

function setActiveHighlighter(type) {
  const hlP = document.getElementById('hl-p');
  const hlM = document.getElementById('hl-m');
  if (activeHlType === type) {
    // Toggle off
    activeHlType = null;
    hlP.classList.remove('hl-active');
    hlM.classList.remove('hl-active');
    showToast('Highlighter off');
  } else {
    activeHlType = type;
    hlP.classList.toggle('hl-active', type === 'p');
    hlM.classList.toggle('hl-active', type === 'm');
    showToast(type === 'p' ? '✦ Yellow highlighter on' : '✦ Green highlighter on');
  }
}

document.getElementById('hl-p').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('p'); });
document.getElementById('hl-m').addEventListener('click', e => { e.preventDefault(); setActiveHighlighter('m'); });

// Auto-highlight on mouseup / touchend when a highlighter is active
document.addEventListener('mouseup', e => {
  if (!activeHlType) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const color = activeHlType === 'p' ? '#ffe566' : '#7ddb7d';
  if (pdfMode && pdfCurrentPage !== null) applyHighlightToPDF(color, activeHlType);
  else applyPreciseHighlight(color, activeHlType);
});

document.addEventListener('touchend', e => {
  if (!activeHlType) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const color = activeHlType === 'p' ? '#ffe566' : '#7ddb7d';
    if (pdfMode && pdfCurrentPage !== null) applyHighlightToPDF(color, activeHlType);
    else applyPreciseHighlight(color, activeHlType);
  }, 100);
});

document.getElementById('exportPDFBtn').addEventListener('click', () => window.print());

// ── Autosave ──────────────────────────────────────────
let autosaveTimer = null;
function triggerAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveAll();
    const ind = document.getElementById('autosaveIndicator'); ind.classList.add('visible');
    setTimeout(() => ind.classList.remove('visible'), 1500);
  }, 1500);
}
document.getElementById('editor').addEventListener('input', () => { triggerAutosave(); updateWordCount(); });

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

// ── Init ──────────────────────────────────────────────
renderTree(); renderPage(); renderHomepage(); updateHL();