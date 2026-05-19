// highlights.js — New highlight system
// 10 categories + Note + data-group hover glow + auto-assembled notes
// Supports data-make-note="false" to suppress note creation for a group
// Supports remove-highlight on click, add-to-group UI
// Reads: treeData, selectedChapterId, selectedTopicId, pdfMode (globals)
// Reads: _savedRange (set by editor.js on selection)
// Depends on: highlight-categories.js (must load before this)

'use strict';

// ── Active highlighter state (window-scoped for cross-file access) ──
window.activeHlType = null;

// ── Group hover glow ──────────────────────────────────
let _glowGroup = null;

document.addEventListener('mouseover', e => {
  const span = e.target.closest('[data-group]');
  if (!span) return;
  const grp = span.dataset.group;
  if (!grp || grp === _glowGroup) return;
  _clearGlow();
  _glowGroup = grp;
  document.querySelectorAll(`[data-group="${CSS.escape(grp)}"]`).forEach(el => el.classList.add('hl-group-glow'));
});

document.addEventListener('mouseout', e => {
  const span = e.target.closest('[data-group]');
  if (!span) return;
  const related = e.relatedTarget;
  if (related && related.closest && related.closest(`[data-group="${CSS.escape(span.dataset.group)}"]`)) return;
  _clearGlow();
});

function _clearGlow() {
  if (_glowGroup) {
    document.querySelectorAll('.hl-group-glow').forEach(el => el.classList.remove('hl-group-glow'));
    _glowGroup = null;
  }
}

// ── Remove highlight on click (when no highlighter active) ──
let _removeBtn = null;

function _ensureRemoveBtn() {
  if (_removeBtn) return _removeBtn;
  _removeBtn = document.createElement('button');
  _removeBtn.id = 'hl-remove-btn';
  _removeBtn.textContent = '✕ Remove highlight';
  _removeBtn.style.cssText = [
    'position:fixed',
    'z-index:9100',
    'background:#1a1624',
    'border:1px solid rgba(255,80,80,0.45)',
    'color:#ff9090',
    'font-family:sans-serif',
    'font-size:11px',
    'padding:5px 12px',
    'border-radius:8px',
    'cursor:pointer',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'display:none',
    'white-space:nowrap',
  ].join(';');
  document.body.appendChild(_removeBtn);

  _removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    const span = _removeBtn._targetSpan;
    if (span && span.parentNode) {
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      _saveNearestEditor(parent);
      setTimeout(updateHL, 80);
    }
    _removeBtn.style.display = 'none';
    _removeBtn._targetSpan = null;
  });

  document.addEventListener('mousedown', e => {
    if (e.target !== _removeBtn && !e.target.closest('#hl-remove-btn')) {
      _removeBtn.style.display = 'none';
      _removeBtn._targetSpan = null;
    }
  });

  return _removeBtn;
}

function _saveNearestEditor(node) {
  const editorEl = node.nodeType === 1 ? node.closest('.section-editor, #editor') : node.parentElement && node.parentElement.closest('.section-editor, #editor');
  if (!editorEl) return;
  if (editorEl.classList.contains('section-editor')) {
    const sid = editorEl.dataset.sid;
    const tp = getSelectedTopic();
    if (tp && sid) {
      const sec = tp.sections && tp.sections.find(s => s.id === sid);
      if (sec) { sec.content = editorEl.innerHTML; if (typeof triggerAutosave === 'function') triggerAutosave(); }
    }
  }
}

// Wire remove button on click of any highlight span (when no highlighter active)
document.addEventListener('click', e => {
  if (window.activeHlType) return;
  const span = e.target.closest('.section-editor [class^="hl-span-"], #editor [class^="hl-span-"], .section-editor [class*=" hl-span-"], #editor [class*=" hl-span-"]');
  if (!span) return;
  e.stopPropagation();
  const btn = _ensureRemoveBtn();
  btn._targetSpan = span;
  btn.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  btn.style.top  = (e.clientY - 38) + 'px';
  btn.style.display = 'block';
});

// ── Apply highlight span ──────────────────────────────
function applyPreciseHighlight(color, type, groupId) {
  if (!restoreSel()) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { showToast('Select some text first'); return; }
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { showToast('Select some text first'); return; }

  const range = sel.getRangeAt(0).cloneRange();
  const editorArea = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  const inEditor = editorArea.closest('.section-editor, #editor');
  if (!inEditor) { showToast('Click inside the editor first'); return; }

  try {
    const nodes = getSelectedTextNodes(range);
    if (nodes.length === 0) { showToast('Select some text first'); return; }

    const catDef = window.HL_CAT_MAP && window.HL_CAT_MAP[type];
    const spanClass = catDef ? catDef.spanClass : ('hl-span-' + type);

    nodes.forEach(({ node, start, end }) => {
      if (start >= end) return;
      if (end < node.textContent.length) node.splitText(end);
      const mid = (start > 0) ? node.splitText(start) : node;
      const span = document.createElement('span');
      span.className = spanClass;
      span.dataset.hlCat = type;
      if (groupId) span.dataset.group = groupId;
      mid.parentNode.insertBefore(span, mid);
      span.appendChild(mid);
    });

    sel.removeAllRanges();
    _savedRange = null;

    if (inEditor.classList.contains('section-editor')) {
      const sid = inEditor.dataset.sid;
      const tp = getSelectedTopic();
      if (tp && sid) {
        const sec = tp.sections.find(s => s.id === sid);
        if (sec) { sec.content = inEditor.innerHTML; if (typeof triggerAutosave === 'function') triggerAutosave(); }
      }
    }

    setTimeout(updateHL, 80);
    const label = catDef ? catDef.label : type;
    showToast(`✦ Highlighted as ${label}`);
  } catch(err) {
    console.warn('Highlight error:', err);
    showToast('Could not highlight selection');
  }
}

// ── Add to existing group UI ──────────────────────────
document.addEventListener('click', e => {
  if (!e.shiftKey) return;
  const span = e.target.closest('[data-hl-cat]');
  if (!span) return;
  e.stopPropagation();
  e.preventDefault();
  const currentGroup = span.dataset.group || '';
  const newGroup = prompt(`Set group name for this highlight (leave blank to remove group):\nCurrent: "${currentGroup}"`, currentGroup);
  if (newGroup === null) return;
  const clean = newGroup.trim().toLowerCase().replace(/\s+/g, '-');
  if (clean) {
    span.dataset.group = clean;
  } else {
    delete span.dataset.group;
  }
  _saveNearestEditor(span);
  setTimeout(updateHL, 80);
  showToast(clean ? `Group set: "${clean}"` : 'Group removed');
});

// ── Text node walker ──────────────────────────────────
function getSelectedTextNodes(range) {
  const result = [];
  const startNode = range.startContainer;
  const endNode   = range.endContainer;
  const startOff  = range.startOffset;
  const endOff    = range.endOffset;

  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    if (startOff < endOff) result.push({ node: startNode, start: startOff, end: endOff });
    return result;
  }

  function resolveStart(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) return { node: container, off: offset };
    const child = container.childNodes[offset] || container.childNodes[offset - 1];
    if (!child) return null;
    if (container.childNodes[offset]) {
      const w = document.createTreeWalker(container.childNodes[offset], NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      return n ? { node: n, off: 0 } : null;
    }
    const w = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = w.nextNode())) last = n;
    return last ? { node: last, off: last.textContent.length } : null;
  }

  function resolveEnd(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) return { node: container, off: offset };
    if (offset === 0) return null;
    const child = container.childNodes[offset - 1];
    if (!child) return null;
    const w = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = w.nextNode())) last = n;
    return last ? { node: last, off: last.textContent.length } : null;
  }

  const resolved_start = resolveStart(startNode, startOff);
  const resolved_end   = resolveEnd(endNode, endOff);
  if (!resolved_start || !resolved_end) return result;

  const actualStart    = resolved_start.node;
  const actualStartOff = resolved_start.off;
  const actualEnd      = resolved_end.node;
  const actualEndOff   = resolved_end.off;

  if (actualStart === actualEnd) {
    if (actualStartOff < actualEndOff)
      result.push({ node: actualStart, start: actualStartOff, end: actualEndOff });
    return result;
  }

  const root   = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let inside   = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!inside) {
      if (node === actualStart) {
        inside = true;
        const end = (node === actualEnd) ? actualEndOff : node.textContent.length;
        if (actualStartOff < end) result.push({ node, start: actualStartOff, end });
        if (node === actualEnd) break;
      }
    } else {
      if (node === actualEnd) {
        if (actualEndOff > 0) result.push({ node, start: 0, end: actualEndOff });
        break;
      }
      result.push({ node, start: 0, end: node.textContent.length });
    }
  }

  return result;
}

// ── Selector for all hl spans ─────────────────────────
function _allHlSpanSelectors() {
  const newClasses = (window.HL_CATEGORIES || []).map(c => 'span.' + c.spanClass).join(', ');
  const legacy = 'span.hl-span-p, span.hl-span-m, span.hl-span-f, span.hl-span-per, span.hl-span-ins';
  return newClasses ? newClasses + ', ' + legacy : legacy;
}

function getHL() {
  const result = {};
  (window.HL_CATEGORIES || []).forEach(c => { result[c.key] = []; });
  ['p','m','f','per','ins'].forEach(k => { if (!result[k]) result[k] = []; });

  const selector = _allHlSpanSelectors();
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll(selector).forEach(el => {
      const text = el.textContent.trim();
      if (!text) return;
      let cat = el.dataset.hlCat || null;
      if (!cat) {
        const cls = Array.from(el.classList).find(c => c.startsWith('hl-span-'));
        if (cls) cat = cls.replace('hl-span-', '');
      }
      if (!cat) return;
      if (!result[cat]) result[cat] = [];
      result[cat].push({ text, el });
    });
  });
  return result;
}

function scrollToHL(el) {
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.remove('hl-pulse'); void el.offsetWidth; el.classList.add('hl-pulse');
  el.addEventListener('animationend', () => el.classList.remove('hl-pulse'), { once: true });
}

// ── Sidebar right panel — render HL cards ─────────────
function updateHL() {
  if (typeof pdfMode !== 'undefined' && pdfMode) {
    if (typeof updatePDFHighlightSidebar === 'function') updatePDFHighlightSidebar();
    return;
  }
  const hlData = getHL();

  (window.HL_CATEGORIES || []).forEach(cat => {
    const el = document.getElementById('hl-list-' + cat.key);
    if (!el) return;
    const items = hlData[cat.key] || [];
    if (!items.length) {
      el.innerHTML = `<div class="hl-empty">No ${cat.label} highlights yet</div>`;
      return;
    }
    el.innerHTML = '';
    items.forEach(({ text, el: spanEl }) => {
      const card = document.createElement('div');
      card.className = 'hl-card hl-card-new hl-card-clickable';
      card.style.cssText = `background:rgba(0,0,0,0.15);border:1px solid ${cat.color}33;border-radius:5px;margin-bottom:6px;padding:7px 10px;cursor:pointer;`;
      card.innerHTML = `<span class="hl-card-badge" style="background:${cat.color};color:#000;font-size:9px;font-family:sans-serif;font-weight:700;letter-spacing:.08em;border-radius:10px;padding:1px 7px;margin-bottom:4px;display:inline-block;">✦ ${escHtml(cat.label.toUpperCase())}</span><div style="font-size:11px;font-family:var(--font);line-height:1.5;color:#c0b8d0;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(text)}</div>`;
      card.addEventListener('click', () => scrollToHL(spanEl));
      el.appendChild(card);
    });
  });

  const legacyMap = { p:'hl-list-p', m:'hl-list-m', f:'hl-list-f', per:'hl-list-per', ins:'hl-list-ins' };
  Object.entries(legacyMap).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const items = hlData[k] || [];
    if (!items.length) { el.innerHTML = `<div class="hl-empty">No highlights yet</div>`; return; }
    el.innerHTML = '';
    items.forEach(({ text, el: spanEl }) => {
      const card = document.createElement('div');
      card.className = `hl-card hl-card-${k} hl-card-clickable`;
      card.innerHTML = `<span class="hl-card-badge badge-${k}">✦ ${k.toUpperCase()}</span><div class="hl-card-text">${escHtml(text)}</div>`;
      card.addEventListener('click', () => scrollToHL(spanEl));
      el.appendChild(card);
    });
  });

  _updateNotesPanel();
}

// ── Notes assembly ────────────────────────────────────
function _assembleNotes() {
  const notes = [];

  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('span.hl-span-note').forEach(el => {
      const text = el.textContent.trim();
      if (text) notes.push({ text, type: 'note', el });
    });
  });

  const groupMap = {};
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('[data-group]').forEach(el => {
      const grp = el.dataset.group;
      if (!grp) return;
      if (!groupMap[grp]) groupMap[grp] = [];
      groupMap[grp].push(el);
    });
  });

  Object.entries(groupMap).forEach(([grp, spans]) => {
    if (spans.length < 2) return;
    const suppressNote = spans.some(s => s.dataset.makeNote === 'false');
    if (suppressNote) return;

    const sorted = Array.from(spans).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    const firstSpan = sorted[0];
    const lastSpan  = sorted[sorted.length - 1];
    const container = firstSpan.closest('.section-editor, #editor');
    if (!container) return;

    try {
      const range = document.createRange();
      range.setStart(firstSpan, 0);
      range.setEnd(lastSpan, lastSpan.childNodes.length || lastSpan.textContent.length);
      const text = range.toString().trim();
      if (text) notes.push({ text, type: 'group', group: grp, el: firstSpan });
    } catch(e) {
      const text = sorted.map(s => s.textContent).join(' … ');
      if (text) notes.push({ text, type: 'group', group: grp, el: firstSpan });
    }
  });

  return notes;
}

function _updateNotesPanel() {
  const panel = document.getElementById('notes-list');
  if (!panel) return;
  const notes = _assembleNotes();
  if (!notes.length) {
    panel.innerHTML = '<div class="hl-empty">No notes yet — groups with 2+ highlights auto-appear here</div>';
    return;
  }
  panel.innerHTML = '';
  notes.forEach(({ text, type, group, el }) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.cursor = 'pointer';
    const badge = type === 'note' ? '📝 Note' : `✦ ${group || 'Group'}`;
    card.innerHTML = `<p>${escHtml(text.substring(0, 300))}${text.length > 300 ? '…' : ''}</p><div class="note-tag">${badge}</div>`;
    if (el) card.addEventListener('click', () => scrollToHL(el));
    panel.appendChild(card);
  });
}

new MutationObserver(updateHL).observe(document.getElementById('pageCard'), {
  childList: true, subtree: true, attributes: true, attributeFilter: ['style','class','data-group','data-make-note']
});

// ── initGroupHighlightsFromHTML ───────────────────────
function initGroupHighlightsFromHTML() {
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('[data-hl-cat]').forEach(el => {
      const cat = el.dataset.hlCat;
      const catDef = window.HL_CAT_MAP && window.HL_CAT_MAP[cat];
      if (!catDef) return;
      if (!el.classList.contains(catDef.spanClass)) {
        el.classList.add(catDef.spanClass);
      }
    });
  });
  setTimeout(updateHL, 80);
}
window.initGroupHighlightsFromHTML = initGroupHighlightsFromHTML;

// ── Highlights Page ───────────────────────────────────
function openHighlightsPage() {
  const sel = document.getElementById('hlPageBookSelect');
  sel.innerHTML = '<option value="all">All Books</option>';
  window.library.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.name.length > 30 ? b.name.substring(0,28) + '…' : b.name;
    o.title = b.name;
    sel.appendChild(o);
  });
  document.getElementById('highlightsPage').style.display = 'block';
  renderHighlightsPage();
}

function closeHighlightsPage() { document.getElementById('highlightsPage').style.display = 'none'; }

function extractHighlightsFromBook(book) {
  const byCategory = {};
  (window.HL_CATEGORIES || []).forEach(c => { byCategory[c.key] = []; });
  ['p','m','f','per','ins'].forEach(k => { if (!byCategory[k]) byCategory[k] = []; });

  (book.treeData || []).forEach(ch => {
    (ch.topics || []).forEach(tp => {
      (tp.sections || []).forEach(sec => {
        if (!sec.content) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = sec.content;
        const selector = _allHlSpanSelectors();
        tmp.querySelectorAll(selector).forEach(el => {
          const text = el.textContent.trim();
          if (!text) return;
          let cat = el.dataset.hlCat || null;
          if (!cat) {
            const cls = Array.from(el.classList).find(c => c.startsWith('hl-span-'));
            if (cls) cat = cls.replace('hl-span-', '');
          }
          if (!cat) return;
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push({ text, bookName: book.name, loc: tp.name });
        });
      });
    });
  });

  if (book.pdfHighlights) {
    Object.entries(book.pdfHighlights).forEach(([pg, hls]) => {
      if (!Array.isArray(hls)) return;
      hls.forEach(hl => {
        const cat = hl.type || 'p';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ text: hl.text || '', bookName: book.name, loc: 'Page ' + pg });
      });
    });
  }

  return byCategory;
}

function renderHighlightsPage() {
  const bookId = document.getElementById('hlPageBookSelect').value;
  const books = bookId === 'all' ? window.library : window.library.filter(b => b.id === bookId);

  // ── Collect all items with full location metadata ──
  const combined = {};
  (window.HL_CATEGORIES || []).forEach(c => { combined[c.key] = []; });
  ['p','m','f','per','ins'].forEach(k => { if (!combined[k]) combined[k] = []; });

  books.forEach(book => {
    (book.treeData || []).forEach(ch => {
      (ch.topics || []).forEach(tp => {
        (tp.sections || []).forEach(sec => {
          if (!sec.content) return;
          const tmp = document.createElement('div');
          tmp.innerHTML = sec.content;
          const selector = _allHlSpanSelectors();
          tmp.querySelectorAll(selector).forEach(el => {
            const text = el.textContent.trim();
            if (!text) return;
            let cat = el.dataset.hlCat || null;
            if (!cat) {
              const cls = Array.from(el.classList).find(c => c.startsWith('hl-span-'));
              if (cls) cat = cls.replace('hl-span-', '');
            }
            if (!cat) return;
            if (!combined[cat]) combined[cat] = [];
            combined[cat].push({
              text,
              bookName: book.name,
              bookId: book.id,
              chapterId: ch.id,
              chapterName: ch.name,
              topicId: tp.id,
              topicName: tp.name,
              loc: tp.name
            });
          });
        });
      });
    });

    if (book.pdfHighlights) {
      Object.entries(book.pdfHighlights).forEach(([pg, hls]) => {
        if (!Array.isArray(hls)) return;
        hls.forEach(hl => {
          const cat = hl.type || 'p';
          if (!combined[cat]) combined[cat] = [];
          combined[cat].push({
            text: hl.text || '',
            bookName: book.name,
            bookId: book.id,
            chapterId: null,
            chapterName: null,
            topicId: null,
            topicName: 'Page ' + pg,
            loc: 'Page ' + pg
          });
        });
      });
    }
  });

  // ── Build chapter/topic lists for dropdowns ──
  // Gather all chapters present in filtered books
  const chapterSet = {}; // chapterId -> chapterName
  const topicSet = {};   // topicId -> { name, chapterId }
  books.forEach(book => {
    (book.treeData || []).forEach(ch => {
      chapterSet[ch.id] = ch.name;
      (ch.topics || []).forEach(tp => {
        topicSet[tp.id] = { name: tp.name, chapterId: ch.id };
      });
    });
  });

  const container = document.getElementById('hlPageAllContent');
  if (!container) return;

  // ── Render filter bar ──
  // Read current filter values (persist across re-renders)
  const prevChapter = (document.getElementById('hlFilterChapter') || {}).value || 'all';
  const prevTopic   = (document.getElementById('hlFilterTopic')   || {}).value || 'all';
  const prevCat     = (document.getElementById('hlFilterCat')     || {}).value || 'all';

  container.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:1.8rem;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:6px;">
      <span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--cream2);flex-shrink:0;">Filter</span>

      <select id="hlFilterChapter" style="background:var(--glass2,rgba(255,255,255,0.06));border:1px solid var(--border-color);color:var(--cream);font-family:'Outfit',sans-serif;font-size:12px;padding:6px 10px;border-radius:4px;outline:none;cursor:pointer;min-height:36px;max-width:180px;">
        <option value="all">All Chapters</option>
        ${Object.entries(chapterSet).map(([id, name]) =>
          `<option value="${escHtml(id)}" ${prevChapter === id ? 'selected' : ''}>${escHtml(name.length > 28 ? name.substring(0,26)+'…' : name)}</option>`
        ).join('')}
      </select>

      <select id="hlFilterTopic" style="background:var(--glass2,rgba(255,255,255,0.06));border:1px solid var(--border-color);color:var(--cream);font-family:'Outfit',sans-serif;font-size:12px;padding:6px 10px;border-radius:4px;outline:none;cursor:pointer;min-height:36px;max-width:180px;">
        <option value="all">All Topics</option>
        ${Object.entries(topicSet).map(([id, tp]) =>
          `<option value="${escHtml(id)}" data-chapter="${escHtml(tp.chapterId)}" ${prevTopic === id ? 'selected' : ''}>${escHtml(tp.name.length > 28 ? tp.name.substring(0,26)+'…' : tp.name)}</option>`
        ).join('')}
      </select>

      <select id="hlFilterCat" style="background:var(--glass2,rgba(255,255,255,0.06));border:1px solid var(--border-color);color:var(--cream);font-family:'Outfit',sans-serif;font-size:12px;padding:6px 10px;border-radius:4px;outline:none;cursor:pointer;min-height:36px;max-width:180px;">
        <option value="all">All Types</option>
        ${(window.HL_CATEGORIES || []).map(cat =>
          `<option value="${escHtml(cat.key)}" ${prevCat === cat.key ? 'selected' : ''} style="color:${cat.color};">✦ ${escHtml(cat.label)}</option>`
        ).join('')}
      </select>

      <button onclick="renderHighlightsPage()" style="background:rgba(212,135,42,0.15);border:1px solid rgba(212,135,42,0.3);color:#d4a060;font-family:'Outfit',sans-serif;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:6px 14px;border-radius:4px;cursor:pointer;min-height:36px;">Apply</button>
      <button onclick="_hlClearFilters()" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:var(--cream2);font-family:'Outfit',sans-serif;font-size:11px;padding:6px 12px;border-radius:4px;cursor:pointer;min-height:36px;">Clear</button>
    </div>
    <div id="hlPageCards"></div>
  `;

  // Wire chapter dropdown to cascade-filter topic dropdown
  document.getElementById('hlFilterChapter').addEventListener('change', function() {
    const selCh = this.value;
    const topicSel = document.getElementById('hlFilterTopic');
    Array.from(topicSel.options).forEach(opt => {
      if (opt.value === 'all') { opt.style.display = ''; return; }
      opt.style.display = (selCh === 'all' || opt.dataset.chapter === selCh) ? '' : 'none';
    });
    // Reset topic if current selection no longer visible
    const cur = topicSel.value;
    if (cur !== 'all') {
      const curOpt = topicSel.querySelector(`option[value="${cur}"]`);
      if (curOpt && curOpt.style.display === 'none') topicSel.value = 'all';
    }
  });

  // Read filter values
  const filterChapter = document.getElementById('hlFilterChapter').value;
  const filterTopic   = document.getElementById('hlFilterTopic').value;
  const filterCat     = document.getElementById('hlFilterCat').value;

  const cardsEl = document.getElementById('hlPageCards');

  // ── Render filtered cards grouped by category ──
  const categoriesToShow = filterCat === 'all'
    ? (window.HL_CATEGORIES || [])
    : (window.HL_CATEGORIES || []).filter(c => c.key === filterCat);

  let totalShown = 0;

  categoriesToShow.forEach(cat => {
    let items = combined[cat.key] || [];

    // Apply filters
    if (filterChapter !== 'all') items = items.filter(i => i.chapterId === filterChapter);
    if (filterTopic   !== 'all') items = items.filter(i => i.topicId   === filterTopic);

    if (!items.length) return;
    totalShown += items.length;

    const section = document.createElement('div');
    section.style.marginBottom = '2.5rem';
    section.innerHTML = `<div style="font-family:'Cormorant Garamond',serif;font-size:clamp(20px,4vw,26px);font-weight:400;color:var(--cream);margin-bottom:1rem;padding-bottom:0.6rem;border-bottom:1px solid var(--border-color);">${escHtml(cat.label)} <span style="font-size:16px;color:${cat.color};">(${items.length})</span></div>`;

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;';

    items.forEach(item => {
      const d = document.createElement('div');
      d.style.cssText = `background:rgba(0,0,0,0.2);border:1px solid ${cat.color}44;border-radius:5px;padding:0.9rem 1rem;cursor:pointer;transition:opacity 0.15s,transform 0.15s;`;
      const shortName = item.bookName.length > 18 ? item.bookName.substring(0,16)+'…' : item.bookName;
      const locLabel = [item.chapterName, item.topicName].filter(Boolean).map(s => s.length > 18 ? s.substring(0,16)+'…' : s).join(' › ');
      d.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;gap:0.5rem;">
          <span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${cat.color};flex-shrink:0;">✦ ${escHtml(cat.label.toUpperCase())}</span>
          <span style="font-size:10px;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right;" title="${escHtml(item.bookName)}${locLabel ? ' › ' + locLabel : ''}">${escHtml(shortName)}${locLabel ? ' › ' + escHtml(locLabel) : ''}</span>
        </div>
        <div style="font-size:13px;color:var(--cream);line-height:1.65;font-family:'Lora',serif;word-break:break-word;">${escHtml(item.text.substring(0,280))}${item.text.length > 280 ? '…' : ''}</div>
        <div style="margin-top:8px;font-size:9px;color:var(--cream2);letter-spacing:1px;text-transform:uppercase;opacity:0.6;">Click to navigate →</div>
      `;
      d.addEventListener('mouseover', () => { d.style.opacity = '0.85'; d.style.transform = 'translateY(-1px)'; });
      d.addEventListener('mouseout',  () => { d.style.opacity = '1';    d.style.transform = ''; });

      d.addEventListener('click', () => _navigateToHighlight(item, cat.key));
      grid.appendChild(d);
    });

    section.appendChild(grid);
    cardsEl.appendChild(section);
  });

  if (totalShown === 0) {
    cardsEl.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--cream2);font-style:italic;font-size:14px;">No highlights match the current filters.</div>`;
  }
}

// ── Navigate from highlights page to the live span ──
function _navigateToHighlight(item, catKey) {
  if (!item.bookId || !item.topicId) {
    showToast('Cannot navigate — no topic info available');
    return;
  }

  const book = window.library.find(b => b.id === item.bookId);
  if (!book) { showToast('Book not found'); return; }

  // Hide highlights page without triggering homepage show
  document.getElementById('highlightsPage').style.display = 'none';

  const editorShell = document.getElementById('editor-shell');
  const homepage    = document.getElementById('homepage');

  function _afterBookOpen() {
    // Set topic selection directly on window globals
    window.selectedChapterId = item.chapterId;
    window.selectedTopicId   = item.topicId;
    // Sync to editor.js local vars
    selectedChapterId = item.chapterId;
    selectedTopicId   = item.topicId;

    if (typeof renderTree === 'function') renderTree();
    if (typeof renderPage === 'function') renderPage();

    setTimeout(() => {
      const selector = _allHlSpanSelectors();
      let found = null;
      document.querySelectorAll('.section-editor, #editor').forEach(container => {
        if (found) return;
        container.querySelectorAll(selector).forEach(el => {
          if (found) return;
          const elCat = el.dataset.hlCat
            || Array.from(el.classList).find(c => c.startsWith('hl-span-'))?.replace('hl-span-', '');
          if (elCat === catKey && el.textContent.trim() === item.text.trim()) found = el;
        });
      });
      if (found) {
        scrollToHL(found);
        showToast('✦ Found highlight');
      } else {
        showToast('Navigated to topic — highlight visible in page');
      }
    }, 450);
  }

  if (window.activeBookId !== item.bookId) {
    homepage.classList.add('hidden');
    editorShell.classList.add('visible');
    if (typeof loadBookIntoEditor === 'function') loadBookIntoEditor(book);
    window.activeBookId = item.bookId;
    book.lastOpened = Date.now();
    if (typeof saveBook === 'function') saveBook(book);
    document.getElementById('sidebarBookTitle').textContent = book.name;
    _afterBookOpen();
  } else {
    // Book already open — just make sure editor is visible
    homepage.classList.add('hidden');
    editorShell.classList.add('visible');
    _afterBookOpen();
  }
}

// ── Clear filters ──
window._hlClearFilters = function() {
  const ch  = document.getElementById('hlFilterChapter');
  const tp  = document.getElementById('hlFilterTopic');
  const cat = document.getElementById('hlFilterCat');
  if (ch)  ch.value  = 'all';
  if (tp)  tp.value  = 'all';
  if (cat) cat.value = 'all';
  renderHighlightsPage();
};

// ── Toolbar: setActiveHighlighter ────────────────────
function setActiveHighlighter(type) {
  if (window.activeHlType === type) {
    window.activeHlType = null;
    _syncHighlighterUI();
    showToast('Highlighter off');
  } else {
    window.activeHlType = type;
    _syncHighlighterUI();
    const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[type];
    showToast('✦ ' + (cat ? cat.label : type) + ' highlighter on');
  }
}

function _syncHighlighterUI() {
  (window.HL_CATEGORIES || []).forEach(cat => {
    const btn = document.getElementById('hl-btn-' + cat.key);
    if (btn) btn.classList.toggle('hl-active', window.activeHlType === cat.key);
  });
}

// ── Auto-highlight on mouseup / touchend ─────────────
document.addEventListener('mouseup', e => {
  if (!window.activeHlType) return;
  if (e.target.closest('#hl-remove-btn')) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[window.activeHlType];
  const color = cat ? cat.color : '#ffe566';
  if (typeof pdfMode !== 'undefined' && pdfMode && typeof pdfCurrentPage !== 'undefined' && pdfCurrentPage !== null) {
    if (typeof applyHighlightToPDF === 'function') applyHighlightToPDF(color, window.activeHlType);
  } else {
    applyPreciseHighlight(color, window.activeHlType);
  }
  // Deactivate after highlighting (optional — remove this line if you want persistent mode)
  // window.activeHlType = null;
  // _syncHighlighterUI();
});

document.addEventListener('touchend', e => {
  if (!window.activeHlType) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[window.activeHlType];
    const color = cat ? cat.color : '#ffe566';
    if (typeof pdfMode !== 'undefined' && pdfMode && typeof pdfCurrentPage !== 'undefined' && pdfCurrentPage !== null) {
      if (typeof applyHighlightToPDF === 'function') applyHighlightToPDF(color, window.activeHlType);
    } else {
      applyPreciseHighlight(color, window.activeHlType);
    }
  }, 100);
});

// ── Legacy stubs ──────────────────────────────────────
function openFactsPage() { openHighlightsPage(); }
function closeFactsPage() { closeHighlightsPage(); }
function renderFactsPage() { renderHighlightsPage(); }
function filterHighlights() {}
function switchHlTab() {}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.openHighlightsPage  = openHighlightsPage;
window.closeHighlightsPage = closeHighlightsPage;
window.renderHighlightsPage = renderHighlightsPage;
window.applyPreciseHighlight = applyPreciseHighlight;
window.updateHL = updateHL;
window.setActiveHighlighter = setActiveHighlighter;
window.openFactsPage  = openFactsPage;
window.closeFactsPage = closeFactsPage;
window.renderFactsPage = renderFactsPage;
window.filterHighlights = filterHighlights;
window.switchHlTab = switchHlTab;