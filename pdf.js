// pdf.js — PDF.js canvas viewer, outline sidebar, PDF highlights
// Owns: pdfViewerDoc, pdfViewerScale, pdfViewerBook, pdfCurrentPage, pdfMode

'use strict';

let pdfViewerDoc = null, pdfViewerScale = 1, pdfViewerBook = null, pdfCurrentPage = null;
let pdfMode = false;

// ── Inject PDF-specific topbar controls ──────────────
(function injectPDFTopbarControls() {
  const topbar = document.querySelector('.topbar');
  const sep1 = document.createElement('div'); sep1.className = 'topbar-sep'; sep1.id = 'pdfSep1';
  const zoomWrap = document.createElement('div'); zoomWrap.id = 'pdfZoomWrap'; zoomWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
  zoomWrap.innerHTML = `<span class="ctrl-label">Zoom</span><select id="pdfZoomSelect" class="eo-select"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5" selected>150%</option><option value="2">200%</option></select>`;
  const pageInfoSpan = document.createElement('span'); pageInfoSpan.id = 'pdfPageInfo'; pageInfoSpan.style.cssText = 'font-size:10px;font-family:sans-serif;color:#9a8a6a;white-space:nowrap;flex-shrink:0;';
  const sep2 = document.createElement('div'); sep2.className = 'topbar-sep'; sep2.id = 'pdfSep2';
  const capBtn = document.createElement('button'); capBtn.id = 'pdfCaptureBtn'; capBtn.className = 'eo-btn'; capBtn.title = 'Capture page'; capBtn.textContent = '📷';
  [sep1, zoomWrap, pageInfoSpan, sep2, capBtn].forEach(el => topbar.appendChild(el));
  setPDFTopbarVisible(false);
})();

function setPDFTopbarVisible(show) {
  ['pdfSep1','pdfZoomWrap','pdfPageInfo','pdfSep2','pdfCaptureBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; });
  ['fontPicker','btn-bold','btn-italic','btn-ul','btn-ol','btn-h3','btn-bq','btn-link','btn-undo','btn-redo','fontSizeSlider','manageSectionsBtn','uploadPageBtn','exportPDFBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show ? 'none' : ''; });
  document.querySelectorAll('.topbar .topbar-sep:not(#pdfSep1):not(#pdfSep2)').forEach(s => { s.style.display = show ? 'none' : ''; });
  document.querySelectorAll('.eo-color').forEach(el => { el.style.display = show ? 'none' : ''; });
}

async function openPDFViewer(book) {
  pdfViewerBook = book; pdfMode = true; pdfCurrentPage = 1;
  const homepage = document.getElementById('homepage');
  const editorShell = document.getElementById('editor-shell');
  homepage.classList.add('hidden'); editorShell.classList.add('visible');
  document.getElementById('sidebarBookTitle').textContent = book.name;
  setPDFTopbarVisible(true);
  document.getElementById('sectionsContainer').innerHTML = '';
  document.getElementById('editor').style.display = 'none';
  document.getElementById('pageTitleBar').style.display = 'none';
  const pageCard = document.getElementById('pageCard');
  pageCard.style.cssText = 'padding:0;border:none;background:transparent;box-shadow:none;backdrop-filter:none;border-radius:0;max-width:100%;width:100%;display:flex;flex-direction:column;align-items:center;';
  let pdfArea = document.getElementById('pdfCanvasArea');
  if (!pdfArea) {
    pdfArea = document.createElement('div'); pdfArea.id = 'pdfCanvasArea';
    pdfArea.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;padding:24px 8px 60px;min-height:100%;width:100%;';
    pageCard.appendChild(pdfArea);
  }
  pdfArea.innerHTML = '<div id="pdfLoadMsg" style="font-family:sans-serif;font-size:13px;color:#9a8a6a;padding:60px 24px;text-align:center;">Loading PDF…</div>';
  document.getElementById('pdfZoomSelect').onchange = function() { if (!pdfViewerDoc) return; pdfViewerScale = parseFloat(this.value); renderAllPDFPagesInEditor(pdfViewerDoc, pdfViewerScale); };
  document.getElementById('pdfCaptureBtn').onclick = capturePDFVisibleArea;

  loadPDFJS(async () => {
    try {
      let base64 = book.pdfBase64;
      if (!base64) { document.getElementById('pdfLoadMsg').textContent = '⏳ Downloading from cloud…'; base64 = await loadPdfFromStorage(book.id); if (base64) book.pdfBase64 = base64; }
      if (!base64) { document.getElementById('pdfLoadMsg').textContent = '❌ PDF not found. Please re-import.'; return; }
      const binary = atob(base64); const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      window.pdfjsLib.getDocument({ data: bytes }).promise.then(pdf => {
        pdfViewerDoc = pdf; pdfViewerScale = parseFloat(document.getElementById('pdfZoomSelect').value) || 1;
        buildPDFOutlineSidebar(pdf).then(() => {
          renderAllPDFPagesInEditor(pdf, pdfViewerScale);
          swRunning = false; swStart = null; clearInterval(swTimer); swStartStop.textContent = '▶';
          swElapsed = loadPDFPageTime(1); swDisplay.textContent = swFormat(swElapsed);
          updatePDFHighlightSidebar();
        });
      }).catch(err => { document.getElementById('pdfLoadMsg').textContent = '❌ Error: ' + err.message; });
    } catch(err) { document.getElementById('pdfLoadMsg').textContent = '❌ Error: ' + err.message; }
  });
}

async function buildPDFOutlineSidebar(pdf) {
  const chapterList = document.getElementById('chapterList'); chapterList.innerHTML = '';
  let outline = null; try { outline = await pdf.getOutline(); } catch(e){}
  if (outline && outline.length > 0) renderOutlineNode(chapterList, outline, pdf, 0);
  else {
    for (let p = 1; p <= pdf.numPages; p++) {
      const row = document.createElement('div'); row.className = 'topic-row'; row.style.padding = '3px 0 3px 10px';
      row.innerHTML = `<span class="topic-icon" style="font-size:10px;">📄</span><span class="topic-name">Page ${p}</span>`;
      row.addEventListener('click', () => scrollToPDFPage(p)); chapterList.appendChild(row);
    }
  }
}

function renderOutlineNode(container, items, pdf, depth) {
  items.forEach(item => {
    const row = document.createElement('div'); const isChapter = depth === 0;
    row.className = isChapter ? 'chapter-row' : 'topic-row'; row.style.paddingLeft = (10 + depth * 12) + 'px';
    const nameSpan = document.createElement('span'); nameSpan.className = isChapter ? 'chapter-name' : 'topic-name';
    nameSpan.textContent = item.title || '—'; nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 4px;';
    row.innerHTML = `<span style="font-size:12px;margin-right:5px;">${isChapter?'📑':'📄'}</span>`; row.appendChild(nameSpan);
    row.addEventListener('click', async () => {
      try { let dest = item.dest; if (typeof dest === 'string') dest = await pdf.getDestination(dest); if (dest && dest[0]) { const ref = dest[0]; scrollToPDFPage(await pdf.getPageIndex(ref)+1); } } catch(e){}
      container.querySelectorAll('.chapter-row,.topic-row').forEach(r => r.classList.remove('active')); row.classList.add('active');
    });
    container.appendChild(row);
    if (item.items && item.items.length > 0) renderOutlineNode(container, item.items, pdf, depth+1);
  });
}

function scrollToPDFPage(pageNum) {
  const pdfArea = document.getElementById('pdfCanvasArea');
  const target = pdfArea && pdfArea.querySelector(`[data-page="${pageNum}"]`); if (!target) return;
  const docArea = document.querySelector('.doc-area');
  if (docArea) docArea.scrollTo({ top: target.offsetTop - 24, behavior: 'auto' });
  else target.scrollIntoView({ behavior:'auto', block:'start' });
}

async function renderAllPDFPagesInEditor(pdf, scale) {
  const pdfArea = document.getElementById('pdfCanvasArea'); if (!pdfArea) return;
  if (window._pageObserver) { window._pageObserver.disconnect(); window._pageObserver = null; }
  if (window._renderObserver) { window._renderObserver.disconnect(); window._renderObserver = null; }
  const wasPage = pdfCurrentPage; pdfArea.innerHTML = '';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const effectiveScale = window.innerWidth <= 768 ? Math.min(scale, 1.0) : scale;
  const firstPage = await pdf.getPage(1); const firstVp = firstPage.getViewport({ scale: effectiveScale });
  const pageW = Math.floor(Math.min(firstVp.width, window.innerWidth - 16));
  const pageH = Math.floor(firstVp.height * (pageW / firstVp.width));
  const wrappers = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const wrapper = document.createElement('div'); wrapper.dataset.page = pageNum; wrapper.dataset.rendered = 'false';
    wrapper.style.cssText = `position:relative;flex-shrink:0;width:${pageW}px;min-height:${pageH}px;box-shadow:0 6px 40px rgba(0,0,0,0.45);border-radius:3px;background:#e8e0d0;margin-bottom:16px;display:flex;align-items:center;justify-content:center;`;
    const ph = document.createElement('div'); ph.style.cssText = 'color:#aaa;font-size:12px;font-family:sans-serif;'; ph.textContent = 'Page ' + pageNum;
    wrapper.appendChild(ph); pdfArea.appendChild(wrapper); wrappers.push(wrapper);
  }
  await new Promise(resolve => requestAnimationFrame(resolve));

  const pageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const newPage = parseInt(entry.target.dataset.page);
        if (newPage !== pdfCurrentPage) {
          if (pdfCurrentPage !== null) { if (swRunning && swStart) { swElapsed += Date.now() - swStart; swStart = Date.now(); } savePDFPageTime(); }
          pdfCurrentPage = newPage; swElapsed = loadPDFPageTime(newPage);
          if (swRunning) swStart = Date.now();
          swDisplay.textContent = swFormat(swElapsed);
          document.getElementById('pdfPageInfo').textContent = `Page ${newPage} / ${pdf.numPages}`;
        }
      }
    });
  }, { threshold: 0.3 });
  window._pageObserver = pageObserver; wrappers.forEach(w => pageObserver.observe(w));

  const renderObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const wrapper = entry.target;
        if (wrapper.dataset.rendered === 'false') { wrapper.dataset.rendered = 'rendering'; renderSinglePage(pdf, parseInt(wrapper.dataset.page), wrapper, effectiveScale, dpr); }
      }
    });
  }, { rootMargin: '300px 0px', threshold: 0 });
  window._renderObserver = renderObserver; wrappers.forEach(w => renderObserver.observe(w));
  pdfCurrentPage = wasPage || 1;
}

async function renderSinglePage(pdf, pageNum, wrapper, scale, dpr) {
  try {
    const page = await pdf.getPage(pageNum); const viewport = page.getViewport({ scale });
    const pageW = Math.floor(Math.min(viewport.width, window.innerWidth - 16));
    const actualScale = scale * (pageW / viewport.width);
    const adjustedViewport = page.getViewport({ scale: actualScale });
    const w = Math.floor(adjustedViewport.width), h = Math.floor(adjustedViewport.height);
    wrapper.innerHTML = ''; wrapper.style.cssText = wrapper.style.cssText.replace(/min-height:[^;]+;/, '');
    wrapper.style.width = w + 'px'; wrapper.style.background = '#fff'; wrapper.style.alignItems = ''; wrapper.style.justifyContent = '';
    const canvas = document.createElement('canvas'); canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; canvas.style.display = 'block'; wrapper.appendChild(canvas);
    const textLayerDiv = document.createElement('div'); textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = w + 'px'; textLayerDiv.style.height = h + 'px'; textLayerDiv.style.zIndex = '10';
    textLayerDiv.style.setProperty('--scale-factor', actualScale); wrapper.appendChild(textLayerDiv);
    const badge = document.createElement('div'); badge.style.cssText = 'position:absolute;bottom:8px;right:10px;background:rgba(0,0,0,0.45);color:rgba(255,255,255,0.5);font-size:10px;font-family:sans-serif;padding:2px 9px;border-radius:10px;pointer-events:none;z-index:5;';
    badge.textContent = `${pageNum} / ${pdf.numPages}`; wrapper.appendChild(badge);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: adjustedViewport, transform: [dpr,0,0,dpr,0,0] }).promise;
    const textContent = await page.getTextContent(); const textDivs = [];
    await pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport: adjustedViewport, textDivs }).promise;
    if (pdfViewerBook?.pdfHighlights?.[pageNum]) {
      let offset = 0; const divOffsets = textDivs.map(d => { const o = offset; offset += (d.textContent||'').length; return o; });
      pdfViewerBook.pdfHighlights[pageNum].forEach(hl => {
        const idx = divOffsets.findIndex((o,i) => o <= hl.charOffset && hl.charOffset < o + (textDivs[i]?.textContent||'').length);
        if (idx !== -1) textDivs[idx].classList.add(hl.type === 'p' ? 'highlight-p' : 'highlight-m');
      });
    }
    wrapper.dataset.rendered = 'true';
  } catch(e) { console.warn('render error p' + pageNum, e); wrapper.dataset.rendered = 'false'; }
}

function applyHighlightToPDF(color) {
  if (pdfCurrentPage === null) return;
  
  // Use saved range since mousedown clears selection
  if (!restoreSel()) {
    showToast('Select some text first'); return;
  }
  
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { showToast('Select some text first'); return; }
  
  const range = sel.getRangeAt(0).cloneRange();
  const selectedText = sel.toString().trim();
  if (!selectedText) { showToast('Select some text first'); return; }

  const pdfArea = document.getElementById('pdfCanvasArea');
  if (!pdfArea.contains(range.commonAncestorContainer)) {
    showToast('Click inside the PDF text'); return;
  }

  const hlType = color === '#ffe566' ? 'p' : 'm';
  const hlClass = hlType === 'p' ? 'highlight-p' : 'highlight-m';

  try {
    const extracted = range.extractContents();
    const hlSpan = document.createElement('span');
    hlSpan.className = hlClass;
    hlSpan.appendChild(extracted);
    range.insertNode(hlSpan);
    sel.removeAllRanges();
    _savedRange = null;
  } catch(e) {
    console.warn('Highlight error:', e);
    showToast('Could not highlight'); return;
  }

  if (!pdfViewerBook.pdfHighlights) pdfViewerBook.pdfHighlights = {};
  if (!pdfViewerBook.pdfHighlights[pdfCurrentPage]) pdfViewerBook.pdfHighlights[pdfCurrentPage] = [];
  pdfViewerBook.pdfHighlights[pdfCurrentPage].push({
    type: hlType,
    text: selectedText.substring(0, 200),
    charOffset: range.startOffset
  });

  saveBook(pdfViewerBook); saveLibrary(); updatePDFHighlightSidebar();
  showToast(`Highlighted as ${hlType.toUpperCase()}`);
}

function updatePDFHighlightSidebar() {
  if (!pdfMode || !pdfViewerBook || !pdfViewerBook.pdfHighlights) return;
  const pList = [], mList = [];
  Object.entries(pdfViewerBook.pdfHighlights).forEach(([pageNum, hls]) => {
    hls.forEach(hl => { const item = { text: hl.text, page: pageNum }; (hl.type === 'p' ? pList : mList).push(item); });
  });
  renderPDFList('hl-list-p', pList, 'p'); renderPDFList('hl-list-m', mList, 'm');
}

function renderPDFList(id, items, type) {
  const c = document.getElementById(id); if (!c) return;
  if (!items.length) { c.innerHTML = `<div class="hl-empty">No ${type.toUpperCase()} highlights yet</div>`; return; }
  c.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div'); card.className = `hl-card hl-card-${type}`; card.style.cursor = 'pointer';
    card.innerHTML = `<span class="hl-card-badge badge-${type}">✦ ${type.toUpperCase()} · Page ${item.page}</span><div class="hl-card-text">${escHtml(item.text.substring(0,120))}${item.text.length>120?'…':''}</div>`;
    card.addEventListener('click', () => scrollToPDFPage(parseInt(item.page))); c.appendChild(card);
  });
}

function capturePDFVisibleArea() {
  const docArea = document.querySelector('.doc-area'); const pdfArea = document.getElementById('pdfCanvasArea'); if (!pdfArea) return;
  const scrollTop = docArea.scrollTop; const viewH = docArea.clientHeight;
  let best = null, bestVis = 0;
  pdfArea.querySelectorAll('[data-page]').forEach(w => {
    const top = w.offsetTop - pdfArea.offsetTop; const bot = top + w.offsetHeight;
    const vis = Math.max(0, Math.min(bot, scrollTop+viewH) - Math.max(top, scrollTop));
    if (vis > bestVis) { bestVis = vis; best = w.querySelector('canvas'); }
  });
  if (!best) { showToast('No visible page'); return; }
  const a = document.createElement('a'); a.href = best.toDataURL('image/png');
  a.download = `${(pdfViewerBook&&pdfViewerBook.name)||'page'}-p${best.closest('[data-page]').dataset.page}.png`;
  a.click(); showToast(`✓ Captured page ${best.closest('[data-page]').dataset.page}`);
}

// Clean up PDF mode on home
document.getElementById('homeLink').addEventListener('click', () => {
  if (!pdfMode) return;
  if (swRunning) savePDFPageTime();
  pdfMode = false; pdfViewerDoc = null; pdfCurrentPage = null;
  setPDFTopbarVisible(false);
  const pageCard = document.getElementById('pageCard'); pageCard.removeAttribute('style');
  const pdfArea = document.getElementById('pdfCanvasArea'); if (pdfArea) pdfArea.remove();
  document.getElementById('editor').style.display = '';
}, true);

window.openPDFViewer = openPDFViewer;
window.applyHighlightToPDF = applyHighlightToPDF;
window.updatePDFHighlightSidebar = updatePDFHighlightSidebar;
window.scrollToPDFPage = scrollToPDFPage;
