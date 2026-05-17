// highlights.js — applyPreciseHighlight, sidebar HL list, Highlights page
// Reads: treeData, selectedChapterId, selectedTopicId, pdfMode (globals)
// Reads: _savedRange (set by editor.js on selection)

'use strict';

let _hlFilter = 'all';

// ── Apply highlight span ──────────────────────────────
function applyPreciseHighlight(color, type) {
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

    if (nodes.length === 0) {
      showToast('Select some text first');
      return;
    }

    nodes.forEach(({ node, start, end }) => {
      if (start >= end) return;
      // Split tail first so start offset is still valid, then split head
      if (end < node.textContent.length) node.splitText(end);
      const mid = (start > 0) ? node.splitText(start) : node;
      const span = document.createElement('span');
      span.className = type === 'p' ? 'hl-span-p' : type === 'm' ? 'hl-span-m' : 'hl-span-f';
      span.style.background = color;
      span.style.borderRadius = '2px';
      mid.parentNode.insertBefore(span, mid);
      span.appendChild(mid);
    });

    sel.removeAllRanges();
    _savedRange = null;

    // Persist to section data
    if (inEditor.classList.contains('section-editor')) {
      const sid = inEditor.dataset.sid;
      const tp = getSelectedTopic();
      if (tp && sid) {
        const sec = tp.sections.find(s => s.id === sid);
        if (sec) { sec.content = inEditor.innerHTML; triggerAutosave(); }
      }
    }

    setTimeout(updateHL, 80);
    showToast(`✦ Highlighted as ${type.toUpperCase()}`);
  } catch(err) {
    console.warn('Highlight error:', err);
    showToast('Could not highlight selection');
  }
}

/**
 * Walk all Text nodes under range.commonAncestorContainer in DOM order.
 * Track when we've entered the range (hit startContainer) and when we've
 * left it (hit endContainer). Return each node with its selected char offsets.
 */
function getSelectedTextNodes(range) {
  const result = [];
  const startNode = range.startContainer;
  const endNode   = range.endContainer;
  const startOff  = range.startOffset;
  const endOff    = range.endOffset;

  // Simple case: single text node
  if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
    if (startOff < endOff) result.push({ node: startNode, start: startOff, end: endOff });
    return result;
  }

  // Resolve element-node boundaries to actual text nodes + char offsets
  function resolveStart(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) return { node: container, off: offset };
    const child = container.childNodes[offset] || container.childNodes[offset - 1];
    if (!child) return null;
    if (container.childNodes[offset]) {
      // offset points to a child — find first text node inside it
      const w = document.createTreeWalker(container.childNodes[offset], NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      return n ? { node: n, off: 0 } : null;
    }
    // offset is past last child — last text node, end of it
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

  const actualStart = resolved_start.node;
  const actualStartOff = resolved_start.off;
  const actualEnd = resolved_end.node;
  const actualEndOff = resolved_end.off;

  // Single resolved text node
  if (actualStart === actualEnd) {
    if (actualStartOff < actualEndOff)
      result.push({ node: actualStart, start: actualStartOff, end: actualEndOff });
    return result;
  }

  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let inside = false;

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

// ── Scan DOM for highlight spans ──────────────────────
function getHL() {
  const p = [], m = [], f = [];
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('span.hl-span-p, span.hl-span-m, span.hl-span-f, [style*="background"]').forEach(el => {
      const text = el.textContent.trim(); if (!text) return;
      const isP = el.classList.contains('hl-span-p') || (el.style.backgroundColor && (el.style.backgroundColor.includes('255,229,102') || el.style.backgroundColor.includes('255,215,0')));
      const isM = el.classList.contains('hl-span-m') || (el.style.backgroundColor && (el.style.backgroundColor.includes('125,219,125') || el.style.backgroundColor.includes('80,200,80')));
      const isF = el.classList.contains('hl-span-f') || (el.style.backgroundColor && (el.style.backgroundColor.includes('167,139,250') || el.style.backgroundColor.includes('139,92,246')));
      if (isP) p.push({ text, el });
      else if (isM) m.push({ text, el });
      else if (isF) f.push({ text, el });
    });
  });
  return { p, m, f };
}

function scrollToHL(el) {
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.remove('hl-pulse'); void el.offsetWidth; el.classList.add('hl-pulse');
  el.addEventListener('animationend', () => el.classList.remove('hl-pulse'), { once: true });
}

function renderList(id, items, type) {
  const c = document.getElementById(id);
  if (!items.length) { c.innerHTML = `<div class="hl-empty">No ${type.toUpperCase()} highlights yet</div>`; return; }
  c.innerHTML = '';
  items.forEach(({ text, el }) => {
    const card = document.createElement('div');
    card.className = `hl-card hl-card-${type} hl-card-clickable`;
    card.innerHTML = `<span class="hl-card-badge badge-${type}">✦ ${type.toUpperCase()}</span><div class="hl-card-text">${escHtml(text)}</div>`;
    card.addEventListener('click', () => scrollToHL(el));
    c.appendChild(card);
  });
}

function updateHL() {
  if (pdfMode) { updatePDFHighlightSidebar(); return; }
  const { p, m, f } = getHL();
  renderList('hl-list-p', p, 'p');
  renderList('hl-list-m', m, 'm');
  // F list rendered in right panel if element exists
  const flList = document.getElementById('hl-list-f');
  if (flList) renderList('hl-list-f', f, 'f');
}

new MutationObserver(updateHL).observe(document.getElementById('pageCard'), {
  childList: true, subtree: true, attributes: true, attributeFilter: ['style','class']
});

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
  _hlFilter = 'all'; setHlFilterBtn('all');
  document.getElementById('highlightsPage').style.display = 'block';
  renderHighlightsPage();
}

function closeHighlightsPage() { document.getElementById('highlightsPage').style.display = 'none'; }

function setHlFilterBtn(type) {
  ['hlFilterAll','hlFilterP','hlFilterM'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.background = 'transparent'; el.style.color = 'var(--cream2)'; el.style.border = '1px solid var(--border-color)'; }
  });
  const map = { all:'hlFilterAll', p:'hlFilterP', m:'hlFilterM' };
  const el = document.getElementById(map[type]);
  if (!el) return;
  el.style.background = type === 'm' ? 'rgba(106,223,106,0.2)' : 'var(--amber)';
  el.style.color = type === 'm' ? '#6adf6a' : 'var(--ink)'; el.style.border = 'none';
}

function filterHighlights(type) { _hlFilter = type; setHlFilterBtn(type); renderHighlightsPage(); }

function extractHighlightsFromBook(book) {
  const pItems = [], mItems = [], fItems = [];
  (book.treeData || []).forEach(ch => {
    (ch.topics || []).forEach(tp => {
      (tp.sections || []).forEach(sec => {
        if (!sec.content) return;
        const tmp = document.createElement('div'); tmp.innerHTML = sec.content;
        tmp.querySelectorAll('span.hl-span-p, span.hl-span-m, span.hl-span-f').forEach(el => {
          const text = el.textContent.trim(); if (!text) return;
          const it = { text, bookName: book.name, loc: tp.name };
          if (el.classList.contains('hl-span-p')) pItems.push(it);
          else if (el.classList.contains('hl-span-m')) mItems.push(it);
          else if (el.classList.contains('hl-span-f')) fItems.push(it);
        });
        tmp.querySelectorAll('[style*="background"]').forEach(el => {
          if (el.classList.contains('hl-span-p') || el.classList.contains('hl-span-m') || el.classList.contains('hl-span-f')) return;
          const text = el.textContent.trim(); if (!text) return;
          const bg = el.style.backgroundColor || '';
          const isP = bg.includes('255,229,102') || bg.includes('255,215,0');
          const isM = bg.includes('125,219,125') || bg.includes('80,200,80');
          const isF = bg.includes('167,139,250') || bg.includes('139,92,246');
          if (isP) pItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isM) mItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isF) fItems.push({ text, bookName: book.name, loc: tp.name });
        });
      });
    });
  });
  if (book.pdfHighlights) {
    Object.entries(book.pdfHighlights).forEach(([pg, hls]) => {
      if (!Array.isArray(hls)) return;
      hls.forEach(hl => {
        const it = { text: hl.text || '', bookName: book.name, loc: 'Page ' + pg };
        if (hl.type === 'p') pItems.push(it);
        else if (hl.type === 'm') mItems.push(it);
        else if (hl.type === 'f') fItems.push(it);
      });
    });
  }
  return { pItems, mItems, fItems };
}

function renderHighlightsPage() {
  const bookId = document.getElementById('hlPageBookSelect').value;
  const books = bookId === 'all' ? window.library : window.library.filter(b => b.id === bookId);
  let allP = [], allM = [];
  books.forEach(book => { const { pItems, mItems } = extractHighlightsFromBook(book); allP = allP.concat(pItems); allM = allM.concat(mItems); });
  const showP = _hlFilter === 'all' || _hlFilter === 'p';
  const showM = _hlFilter === 'all' || _hlFilter === 'm';
  document.getElementById('hlPagePSection').style.display = showP ? '' : 'none';
  document.getElementById('hlPageMSection').style.display = showM ? '' : 'none';
  document.getElementById('hlPagePCount').textContent = '(' + allP.length + ')';
  document.getElementById('hlPageMCount').textContent = '(' + allM.length + ')';
  renderHlGrid('hlPagePList', allP, 'p');
  renderHlGrid('hlPageMList', allM, 'm');
}

function renderHlGrid(id, items, type) {
  const c = document.getElementById(id);
  if (!items.length) { c.innerHTML = '<div style="color:var(--cream2);font-size:14px;padding:1rem 0;font-style:italic;">No ' + type.toUpperCase() + ' highlights yet.</div>'; return; }
  c.innerHTML = '';
  const bc = type === 'p' ? 'rgba(212,135,42,0.35)' : 'rgba(106,223,106,0.35)';
  const tc = type === 'p' ? 'var(--amber)' : '#6adf6a';
  items.forEach(item => {
    const d = document.createElement('div');
    d.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid ' + bc + ';border-radius:5px;padding:0.9rem 1rem;';
    const shortName = item.bookName.length > 20 ? item.bookName.substring(0,18)+'…' : item.bookName;
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;gap:0.5rem;">'
      + `<span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${tc};flex-shrink:0;">${type.toUpperCase()}</span>`
      + `<span style="font-size:10px;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right;" title="${escHtml(item.bookName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}">${escHtml(shortName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}</span>`
      + '</div>'
      + `<div style="font-size:13px;color:var(--cream);line-height:1.65;font-family:'Lora',serif;word-break:break-word;">${escHtml(item.text.substring(0,280))}${item.text.length > 280 ? '…' : ''}</div>`;
    c.appendChild(d);
  });
}

// ── Facts Page ────────────────────────────────────────
function openFactsPage() {
  const sel = document.getElementById('factsPageBookSelect');
  sel.innerHTML = '<option value="all">All Books</option>';
  window.library.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.name.length > 30 ? b.name.substring(0,28) + '…' : b.name;
    o.title = b.name;
    sel.appendChild(o);
  });
  document.getElementById('factsPage').style.display = 'block';
  renderFactsPage();
}

function closeFactsPage() { document.getElementById('factsPage').style.display = 'none'; }

function renderFactsPage() {
  const bookId = document.getElementById('factsPageBookSelect').value;
  const books = bookId === 'all' ? window.library : window.library.filter(b => b.id === bookId);
  let allF = [];
  books.forEach(book => { const { fItems } = extractHighlightsFromBook(book); allF = allF.concat(fItems); });
  document.getElementById('factsPageFCount').textContent = '(' + allF.length + ')';
  renderFactsGrid('factsPageFList', allF);
}

function renderFactsGrid(id, items) {
  const c = document.getElementById(id);
  if (!items.length) { c.innerHTML = '<div style="color:var(--cream2);font-size:14px;padding:1rem 0;font-style:italic;">No F facts yet. Use the ✦ F highlighter to mark facts.</div>'; return; }
  c.innerHTML = '';
  items.forEach(item => {
    const d = document.createElement('div');
    d.style.cssText = 'background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);border-radius:5px;padding:0.9rem 1rem;';
    const shortName = item.bookName.length > 20 ? item.bookName.substring(0,18)+'…' : item.bookName;
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;gap:0.5rem;">'
      + '<span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a78bfa;flex-shrink:0;">F</span>'
      + `<span style="font-size:10px;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right;" title="${escHtml(item.bookName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}">${escHtml(shortName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}</span>`
      + '</div>'
      + `<div style="font-size:13px;color:var(--cream);line-height:1.65;font-family:'Lora',serif;word-break:break-word;">${escHtml(item.text.substring(0,280))}${item.text.length > 280 ? '…' : ''}</div>`;
    c.appendChild(d);
  });
}

window.openHighlightsPage = openHighlightsPage;
window.closeHighlightsPage = closeHighlightsPage;
window.filterHighlights = filterHighlights;
window.renderHighlightsPage = renderHighlightsPage;
window.applyPreciseHighlight = applyPreciseHighlight;
window.updateHL = updateHL;
window.openFactsPage = openFactsPage;
window.closeFactsPage = closeFactsPage;
window.renderFactsPage = renderFactsPage;