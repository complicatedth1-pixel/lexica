// highlights.js — New highlight system
// 10 categories + Note + data-group hover glow + auto-assembled notes
// Replaces old P/M/F/Per/Ins system (old spans still render, not removed)
// Reads: treeData, selectedChapterId, selectedTopicId, pdfMode (globals)
// Reads: _savedRange (set by editor.js on selection)
// Depends on: highlight-categories.js (must load before this)
 
'use strict';
 
// ── Active highlighter state ──────────────────────────
// activeHlType now holds a HL_CATEGORIES key (e.g. 'per', 'date') or null
let activeHlType = null;
 
// ── Group hover glow ──────────────────────────────────
// When mouse enters any hl span with data-group, all spans with same group glow.
// We attach/detach listeners on the whole document via delegation.
 
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
 
// ── Apply highlight span ──────────────────────────────
function applyPreciseHighlight(color, type, groupId) {
  // groupId is optional — if provided, stamps data-group on the span
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
        if (sec) { sec.content = inEditor.innerHTML; triggerAutosave(); }
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
 
// ── Text node walker (unchanged from original) ────────
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
 
// ── Scan DOM for all highlight spans (new + legacy) ───
function _allHlSpanSelectors() {
  // New system classes
  const newClasses = (window.HL_CATEGORIES || []).map(c => 'span.' + c.spanClass).join(', ');
  // Legacy classes
  const legacy = 'span.hl-span-p, span.hl-span-m, span.hl-span-f, span.hl-span-per, span.hl-span-ins';
  return newClasses ? newClasses + ', ' + legacy : legacy;
}
 
function getHL() {
  // Returns map: { catKey -> [{text, el}] }
  const result = {};
  (window.HL_CATEGORIES || []).forEach(c => { result[c.key] = []; });
  // Legacy buckets
  ['p','m','f','per','ins'].forEach(k => { if (!result[k]) result[k] = []; });
 
  const selector = _allHlSpanSelectors();
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll(selector).forEach(el => {
      const text = el.textContent.trim();
      if (!text) return;
      // Determine category
      let cat = el.dataset.hlCat || null;
      if (!cat) {
        // Infer from class (new system)
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
 
  // Update right panel containers for each new category
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
      card.innerHTML = `<span class="hl-card-badge" style="background:${cat.color};color:#000;font-size:9px;font-family:sans-serif;font-weight:700;letter-spacing:.08em;border-radius:10px;padding:1px 7px;margin-bottom:4px;display:inline-block;">✦ ${cat.label.toUpperCase()}</span><div style="font-size:11px;font-family:var(--font);line-height:1.5;color:#c0b8d0;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(text)}</div>`;
      card.addEventListener('click', () => scrollToHL(spanEl));
      el.appendChild(card);
    });
  });
 
  // Also update legacy panel containers if they still exist
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
 
  // Rebuild notes panel
  _updateNotesPanel();
}
 
// ── Notes assembly ────────────────────────────────────
// Rule 1: Group with 2+ highlights → note = full text from first span start to last span end
// Rule 2: data-hl-cat="note" standalone → note = span text as-is
 
function _assembleNotes() {
  const notes = [];
 
  // --- Rule 2: standalone Note category spans ---
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('span.hl-span-note').forEach(el => {
      const text = el.textContent.trim();
      if (text) notes.push({ text, type: 'note', el });
    });
  });
 
  // --- Rule 1: groups with 2+ spans ---
  // Find all spans that have data-group
  const groupMap = {}; // groupId -> [{el, order}]
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
 
    // Sort spans by DOM order
    const sorted = Array.from(spans).sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
 
    const firstSpan = sorted[0];
    const lastSpan  = sorted[sorted.length - 1];
 
    // Get the common ancestor section editor
    const container = firstSpan.closest('.section-editor, #editor');
    if (!container) return;
 
    // Build a range from start of firstSpan to end of lastSpan
    try {
      const range = document.createRange();
      range.setStart(firstSpan, 0);
      range.setEnd(lastSpan, lastSpan.childNodes.length || lastSpan.textContent.length);
      const text = range.toString().trim();
      if (text) notes.push({ text, type: 'group', group: grp, el: firstSpan });
    } catch(e) {
      // Fallback: just concatenate
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
 
// Observe DOM changes and re-run updateHL
new MutationObserver(updateHL).observe(document.getElementById('pageCard'), {
  childList: true, subtree: true, attributes: true, attributeFilter: ['style','class','data-group']
});
 
// ── initGroupHighlightsFromHTML ───────────────────────
// Called after page content is loaded (renderPage calls this).
// Reads spans with data-hl-cat and data-group already in the HTML
// (placed there by Claude's generated content) and stamps the correct
// spanClass on them so they render properly.
 
function initGroupHighlightsFromHTML() {
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('[data-hl-cat]').forEach(el => {
      const cat = el.dataset.hlCat;
      const catDef = window.HL_CAT_MAP && window.HL_CAT_MAP[cat];
      if (!catDef) return;
      // Add the correct span class if not already present
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
 
  // PDF highlights
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
 
  const combined = {};
  (window.HL_CATEGORIES || []).forEach(c => { combined[c.key] = []; });
  ['p','m','f','per','ins'].forEach(k => { if (!combined[k]) combined[k] = []; });
 
  books.forEach(book => {
    const byCat = extractHighlightsFromBook(book);
    Object.entries(byCat).forEach(([k, arr]) => {
      if (!combined[k]) combined[k] = [];
      combined[k] = combined[k].concat(arr);
    });
  });
 
  const container = document.getElementById('hlPageAllContent');
  if (!container) return;
  container.innerHTML = '';
 
  (window.HL_CATEGORIES || []).forEach(cat => {
    const items = combined[cat.key] || [];
    const section = document.createElement('div');
    section.style.marginBottom = '2.5rem';
 
    section.innerHTML = `<div style="font-family:'Cormorant Garamond',serif;font-size:clamp(20px,4vw,26px);font-weight:400;color:var(--cream);margin-bottom:1rem;padding-bottom:0.6rem;border-bottom:1px solid var(--border-color);">${cat.label} <span style="font-size:16px;color:${cat.color};">(${items.length})</span></div>`;
 
    if (!items.length) {
      section.innerHTML += `<div style="color:var(--cream2);font-size:13px;font-style:italic;">No ${cat.label} highlights yet.</div>`;
    } else {
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;';
      items.forEach(item => {
        const d = document.createElement('div');
        d.style.cssText = `background:rgba(0,0,0,0.2);border:1px solid ${cat.color}44;border-radius:5px;padding:0.9rem 1rem;`;
        const shortName = item.bookName.length > 20 ? item.bookName.substring(0,18)+'…' : item.bookName;
        d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;gap:0.5rem;"><span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${cat.color};flex-shrink:0;">${cat.label.toUpperCase()}</span><span style="font-size:10px;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right;" title="${escHtml(item.bookName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}">${escHtml(shortName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}</span></div><div style="font-size:13px;color:var(--cream);line-height:1.65;font-family:'Lora',serif;word-break:break-word;">${escHtml(item.text.substring(0,280))}${item.text.length > 280 ? '…' : ''}</div>`;
        grid.appendChild(d);
      });
      section.appendChild(grid);
    }
    container.appendChild(section);
  });
}
 
// ── Toolbar: setActiveHighlighter ────────────────────
function setActiveHighlighter(type) {
  if (activeHlType === type) {
    activeHlType = null;
    _syncHighlighterUI();
    showToast('Highlighter off');
  } else {
    activeHlType = type;
    _syncHighlighterUI();
    const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[type];
    showToast('✦ ' + (cat ? cat.label : type) + ' highlighter on');
  }
}
 
function _syncHighlighterUI() {
  (window.HL_CATEGORIES || []).forEach(cat => {
    const btn = document.getElementById('hl-btn-' + cat.key);
    if (btn) btn.classList.toggle('hl-active', activeHlType === cat.key);
  });
}
 
// ── Auto-highlight on mouseup / touchend ─────────────
document.addEventListener('mouseup', e => {
  if (!activeHlType) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[activeHlType];
  const color = cat ? cat.color : '#ffe566';
  if (typeof pdfMode !== 'undefined' && pdfMode && typeof pdfCurrentPage !== 'undefined' && pdfCurrentPage !== null) {
    if (typeof applyHighlightToPDF === 'function') applyHighlightToPDF(color, activeHlType);
  } else {
    applyPreciseHighlight(color, activeHlType);
  }
});
 
document.addEventListener('touchend', e => {
  if (!activeHlType) return;
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[activeHlType];
    const color = cat ? cat.color : '#ffe566';
    if (typeof pdfMode !== 'undefined' && pdfMode && typeof pdfCurrentPage !== 'undefined' && pdfCurrentPage !== null) {
      if (typeof applyHighlightToPDF === 'function') applyHighlightToPDF(color, activeHlType);
    } else {
      applyPreciseHighlight(color, activeHlType);
    }
  }, 100);
});
 
// ── Legacy stubs (backward compat) ───────────────────
function openFactsPage() { openHighlightsPage(); }
function closeFactsPage() { closeHighlightsPage(); }
function renderFactsPage() { renderHighlightsPage(); }
function filterHighlights() {}
function switchHlTab() {}
 
// ── Expose globals ────────────────────────────────────
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
