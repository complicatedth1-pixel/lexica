// highlights.js — applyPreciseHighlight, sidebar HL list, Highlights page (unified with Facts)
// Reads: treeData, selectedChapterId, selectedTopicId, pdfMode (globals)
// Reads: _savedRange (set by editor.js on selection)

'use strict';

let _hlTab = 'all'; // current subtab: 'all','p','m','f','per','ins'

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
      if (end < node.textContent.length) node.splitText(end);
      const mid = (start > 0) ? node.splitText(start) : node;
      const span = document.createElement('span');
      span.className = type === 'p' ? 'hl-span-p'
                     : type === 'm' ? 'hl-span-m'
                     : type === 'f' ? 'hl-span-f'
                     : type === 'per' ? 'hl-span-per'
                     : 'hl-span-ins';
      span.style.background = color;
      span.style.borderRadius = '2px';
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
    const typeLabel = type === 'p' ? 'P' : type === 'm' ? 'M' : type === 'f' ? 'F' : type === 'per' ? 'Per' : 'Ins';
    showToast(`✦ Highlighted as ${typeLabel}`);
  } catch(err) {
    console.warn('Highlight error:', err);
    showToast('Could not highlight selection');
  }
}

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

  const actualStart = resolved_start.node;
  const actualStartOff = resolved_start.off;
  const actualEnd = resolved_end.node;
  const actualEndOff = resolved_end.off;

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
  const p = [], m = [], f = [], per = [], ins = [];
  document.querySelectorAll('.section-editor, #editor').forEach(container => {
    container.querySelectorAll('span.hl-span-p, span.hl-span-m, span.hl-span-f, span.hl-span-per, span.hl-span-ins, [style*="background"]').forEach(el => {
      const text = el.textContent.trim(); if (!text) return;
      const isP   = el.classList.contains('hl-span-p')   || (el.style.backgroundColor && (el.style.backgroundColor.includes('255,229,102') || el.style.backgroundColor.includes('255,215,0')));
      const isM   = el.classList.contains('hl-span-m')   || (el.style.backgroundColor && (el.style.backgroundColor.includes('125,219,125') || el.style.backgroundColor.includes('80,200,80')));
      const isF   = el.classList.contains('hl-span-f')   || (el.style.backgroundColor && (el.style.backgroundColor.includes('167,139,250') || el.style.backgroundColor.includes('139,92,246')));
      const isPer = el.classList.contains('hl-span-per') || (el.style.backgroundColor && el.style.backgroundColor.includes('251,146,60'));
      const isIns = el.classList.contains('hl-span-ins') || (el.style.backgroundColor && el.style.backgroundColor.includes('34,211,238'));
      if (isP) p.push({ text, el });
      else if (isM) m.push({ text, el });
      else if (isF) f.push({ text, el });
      else if (isPer) per.push({ text, el });
      else if (isIns) ins.push({ text, el });
    });
  });
  return { p, m, f, per, ins };
}

function scrollToHL(el) {
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.remove('hl-pulse'); void el.offsetWidth; el.classList.add('hl-pulse');
  el.addEventListener('animationend', () => el.classList.remove('hl-pulse'), { once: true });
}

function renderList(id, items, type) {
  const c = document.getElementById(id);
  if (!c) return;
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
  const { p, m, f, per, ins } = getHL();
  renderList('hl-list-p', p, 'p');
  renderList('hl-list-m', m, 'm');
  const flList = document.getElementById('hl-list-f');
  if (flList) renderList('hl-list-f', f, 'f');
  const perList = document.getElementById('hl-list-per');
  if (perList) renderList('hl-list-per', per, 'per');
  const insList = document.getElementById('hl-list-ins');
  if (insList) renderList('hl-list-ins', ins, 'ins');
}

new MutationObserver(updateHL).observe(document.getElementById('pageCard'), {
  childList: true, subtree: true, attributes: true, attributeFilter: ['style','class']
});

// ── Highlights Page (unified) ─────────────────────────
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
  _hlTab = 'all';
  applyHlTabUI('all');
  document.getElementById('highlightsPage').style.display = 'block';
  renderHighlightsPage();
}

function closeHighlightsPage() { document.getElementById('highlightsPage').style.display = 'none'; }

// Tab switching — subtabs within Highlights page
const _hlTabColors = {
  all: { bg: 'var(--amber)', color: 'var(--ink)', border: 'none' },
  p:   { bg: 'transparent', color: '#ffe566', border: '1px solid rgba(255,229,102,0.4)' },
  m:   { bg: 'transparent', color: '#6adf6a', border: '1px solid rgba(106,223,106,0.4)' },
  f:   { bg: 'transparent', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)' },
  per: { bg: 'transparent', color: '#fb923c', border: '1px solid rgba(251,146,60,0.4)' },
  ins: { bg: 'transparent', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.4)' },
};

function applyHlTabUI(tab) {
  ['all','p','m','f','per','ins'].forEach(t => {
    const btn = document.getElementById('hlTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (!btn) return;
    const cfg = _hlTabColors[t];
    if (t === tab) {
      // Active state
      btn.style.background = cfg.bg;
      btn.style.color = cfg.color;
      btn.style.border = cfg.border;
      btn.style.fontWeight = '700';
      btn.style.opacity = '1';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = _hlTabColors[t].color;
      btn.style.border = _hlTabColors[t].border;
      btn.style.fontWeight = '400';
      btn.style.opacity = '0.5';
    }
  });
  // Show/hide sections
  const sections = ['P','M','F','Per','Ins'];
  sections.forEach(s => {
    const sec = document.getElementById('hlPage' + s + 'Section');
    if (!sec) return;
    sec.style.display = (tab === 'all' || tab === s.toLowerCase()) ? '' : 'none';
  });
}

function switchHlTab(tab) { _hlTab = tab; applyHlTabUI(tab); renderHighlightsPage(); }

// Legacy filter compat
function filterHighlights(type) { switchHlTab(type); }

function extractHighlightsFromBook(book) {
  const pItems = [], mItems = [], fItems = [], perItems = [], insItems = [];
  (book.treeData || []).forEach(ch => {
    (ch.topics || []).forEach(tp => {
      (tp.sections || []).forEach(sec => {
        if (!sec.content) return;
        const tmp = document.createElement('div'); tmp.innerHTML = sec.content;
        tmp.querySelectorAll('span.hl-span-p, span.hl-span-m, span.hl-span-f, span.hl-span-per, span.hl-span-ins').forEach(el => {
          const text = el.textContent.trim(); if (!text) return;
          const it = { text, bookName: book.name, loc: tp.name };
          if (el.classList.contains('hl-span-p')) pItems.push(it);
          else if (el.classList.contains('hl-span-m')) mItems.push(it);
          else if (el.classList.contains('hl-span-f')) fItems.push(it);
          else if (el.classList.contains('hl-span-per')) perItems.push(it);
          else if (el.classList.contains('hl-span-ins')) insItems.push(it);
        });
        // Fallback style-based detection
        tmp.querySelectorAll('[style*="background"]').forEach(el => {
          if (el.classList.contains('hl-span-p') || el.classList.contains('hl-span-m') ||
              el.classList.contains('hl-span-f') || el.classList.contains('hl-span-per') ||
              el.classList.contains('hl-span-ins')) return;
          const text = el.textContent.trim(); if (!text) return;
          const bg = el.style.backgroundColor || '';
          const isP   = bg.includes('255,229,102') || bg.includes('255,215,0');
          const isM   = bg.includes('125,219,125') || bg.includes('80,200,80');
          const isF   = bg.includes('167,139,250') || bg.includes('139,92,246');
          const isPer = bg.includes('251,146,60');
          const isIns = bg.includes('34,211,238');
          if (isP) pItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isM) mItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isF) fItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isPer) perItems.push({ text, bookName: book.name, loc: tp.name });
          else if (isIns) insItems.push({ text, bookName: book.name, loc: tp.name });
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
        else if (hl.type === 'per') perItems.push(it);
        else if (hl.type === 'ins') insItems.push(it);
      });
    });
  }
  return { pItems, mItems, fItems, perItems, insItems };
}

function renderHighlightsPage() {
  const bookId = document.getElementById('hlPageBookSelect').value;
  const books = bookId === 'all' ? window.library : window.library.filter(b => b.id === bookId);
  let allP = [], allM = [], allF = [], allPer = [], allIns = [];
  books.forEach(book => {
    const { pItems, mItems, fItems, perItems, insItems } = extractHighlightsFromBook(book);
    allP = allP.concat(pItems);
    allM = allM.concat(mItems);
    allF = allF.concat(fItems);
    allPer = allPer.concat(perItems);
    allIns = allIns.concat(insItems);
  });
  const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = '(' + n + ')'; };
  setCount('hlPagePCount', allP.length);
  setCount('hlPageMCount', allM.length);
  setCount('hlPageFCount', allF.length);
  setCount('hlPagePerCount', allPer.length);
  setCount('hlPageInsCount', allIns.length);
  renderHlGrid('hlPagePList',   allP,   'p');
  renderHlGrid('hlPageMList',   allM,   'm');
  renderHlGrid('hlPageFList',   allF,   'f');
  renderHlGrid('hlPagePerList', allPer, 'per');
  renderHlGrid('hlPageInsList', allIns, 'ins');
}

function renderHlGrid(id, items, type) {
  const c = document.getElementById(id);
  if (!c) return;
  if (!items.length) {
    const label = type === 'p' ? 'P' : type === 'm' ? 'M' : type === 'f' ? 'F' : type === 'per' ? 'Per' : 'Ins';
    c.innerHTML = '<div style="color:var(--cream2);font-size:14px;padding:1rem 0;font-style:italic;">No ' + label + ' highlights yet.</div>';
    return;
  }
  const typeColors = {
    p:   { border: 'rgba(212,135,42,0.35)',  text: 'var(--amber)', bg: 'rgba(255,255,255,0.03)' },
    m:   { border: 'rgba(106,223,106,0.35)', text: '#6adf6a',      bg: 'rgba(255,255,255,0.03)' },
    f:   { border: 'rgba(167,139,250,0.3)',  text: '#a78bfa',      bg: 'rgba(167,139,250,0.08)' },
    per: { border: 'rgba(251,146,60,0.3)',   text: '#fb923c',      bg: 'rgba(251,146,60,0.08)'  },
    ins: { border: 'rgba(34,211,238,0.3)',   text: '#22d3ee',      bg: 'rgba(34,211,238,0.08)'  },
  };
  const cfg = typeColors[type] || typeColors.p;
  const label = type === 'p' ? 'P' : type === 'm' ? 'M' : type === 'f' ? 'F' : type === 'per' ? 'PER' : 'INS';
  c.innerHTML = '';
  items.forEach(item => {
    const d = document.createElement('div');
    d.style.cssText = `background:${cfg.bg};border:1px solid ${cfg.border};border-radius:5px;padding:0.9rem 1rem;`;
    const shortName = item.bookName.length > 20 ? item.bookName.substring(0,18)+'…' : item.bookName;
    d.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;gap:0.5rem;">'
      + `<span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${cfg.text};flex-shrink:0;">${label}</span>`
      + `<span style="font-size:10px;color:var(--cream2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;text-align:right;" title="${escHtml(item.bookName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}">${escHtml(shortName)}${item.loc ? ' · ' + escHtml(item.loc) : ''}</span>`
      + '</div>'
      + `<div style="font-size:13px;color:var(--cream);line-height:1.65;font-family:'Lora',serif;word-break:break-word;">${escHtml(item.text.substring(0,280))}${item.text.length > 280 ? '…' : ''}</div>`;
    c.appendChild(d);
  });
}

// ── Stubs for backward compat (Facts page is now inside Highlights) ──────────
function openFactsPage() { openHighlightsPage(); switchHlTab('f'); }
function closeFactsPage() { closeHighlightsPage(); }
function renderFactsPage() { renderHighlightsPage(); }

window.openHighlightsPage = openHighlightsPage;
window.closeHighlightsPage = closeHighlightsPage;
window.filterHighlights = filterHighlights;
window.switchHlTab = switchHlTab;
window.renderHighlightsPage = renderHighlightsPage;
window.applyPreciseHighlight = applyPreciseHighlight;
window.updateHL = updateHL;
window.openFactsPage = openFactsPage;
window.closeFactsPage = closeFactsPage;
window.renderFactsPage = renderFactsPage;