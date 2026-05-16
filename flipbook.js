// flipbook.js — Inline flipbook viewer (embedded in doc-area, not fullscreen)
// Works for both PDFs and created books.
// Exposes: window._openFlipbookViewer, window._openBookFlipbookViewer,
//          window._closeFlipbookViewer, window._fbSetPageFlip, window._fbUpdateFlipLock

'use strict';

(function () {

// ── Layout preference ──────────────────────────────────────────────────────
let _pdfLayout = 'double'; // 'single' | 'double'

async function loadLayoutPref() {
  try {
    const sb = window._supabase; if (!sb) return;
    const uid = (await sb.auth.getUser()).data.user?.id; if (!uid) return;
    const { data } = await sb.from('user_settings')
      .select('pdf_layout').eq('user_id', uid).maybeSingle();
    if (data?.pdf_layout) _pdfLayout = data.pdf_layout;
  } catch (e) {}
}

async function saveLayoutPref(val) {
  _pdfLayout = val;
  try {
    const sb = window._supabase; if (!sb) return;
    const uid = (await sb.auth.getUser()).data.user?.id; if (!uid) return;
    await sb.from('user_settings').upsert(
      { user_id: uid, pdf_layout: val, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch (e) {}
}

// ── Constants ──────────────────────────────────────────────────────────────
// A4 at 96dpi = 794 × 1123px. We use these as the StPageFlip "logical" page size.
// The actual display is scaled to fit the available doc-area via CSS transform.
const PG_W = 794, PG_H = 1123;
const ZOOM_MIN = 1.0, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;

// ── State ──────────────────────────────────────────────────────────────────
let _pageFlip   = null;
let _scale      = 1.0;
let _autoScale  = 1.0;
let _total      = 0;
let _doc        = null;   // pdfjs doc
let _book       = null;   // book object
let _mode       = null;   // 'pdf' | 'book'
let _allPages   = [];     // book pages array
let _dragging   = false;
let _dragStart  = { x: 0, y: 0 };
let _scrollStart = { l: 0, t: 0 };

// ── DOM refs ──────────────────────────────────────────────────────────────
const getVp  = () => document.getElementById('fbZoomViewport');
const getCvs = () => document.getElementById('fbZoomCanvas');
const getBk  = () => document.getElementById('fbBook');

// ── Build inline shell (runs once) ────────────────────────────────────────
// The shell is injected into #pageCard, replacing page content while visible.
function ensureShell() {
  if (document.getElementById('fbInlineShell')) return;

  // Container inside doc-area/pageCard
  const shell = document.createElement('div');
  shell.id = 'fbInlineShell';
  shell.style.display = 'none';
  shell.innerHTML = `
    <div id="fbInlineBar">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <span id="fbModeLabel" style="font-size:10px;font-family:sans-serif;
          letter-spacing:.1em;text-transform:uppercase;color:#665f78;white-space:nowrap;"></span>
        <div class="topbar-sep" style="height:14px;"></div>
        <button class="fb-layout-btn" id="fbSinglePgBtn" title="Single page">☰</button>
        <button class="fb-layout-btn" id="fbDoublePgBtn" title="Double page">⬜⬜</button>
        <div class="topbar-sep" style="height:14px;"></div>
        <button class="fb-zoom-btn" id="fbZoomOutBtn">−</button>
        <span class="fb-zoom-ind" id="fbZoomInd">100%</span>
        <button class="fb-zoom-btn" id="fbZoomInBtn">+</button>
        <button class="fb-inline-btn" id="fbZoomResetBtn">Reset</button>
        <div class="topbar-sep" style="height:14px;"></div>
        <span id="fbPageInfoInline" style="font-size:10px;font-family:sans-serif;
          color:#9a8a6a;white-space:nowrap;"></span>
      </div>
      <button class="fb-inline-btn fb-close-btn" id="fbCloseInline" title="Close flipbook view">✕ Close</button>
    </div>
    <div id="fbViewport">
      <div id="fbZoomViewport">
        <div id="fbZoomCanvas">
          <div id="fbBook"></div>
        </div>
      </div>
    </div>
    <div id="fbNavBar">
      <button class="fb-ctrl-btn" id="fbPrevBtn">‹ Prev</button>
      <span class="fb-page-ind" id="fbPageInd">1 / 1</span>
      <button class="fb-ctrl-btn" id="fbNextBtn">Next ›</button>
    </div>`;
  // Insert into pageCard
  const pageCard = document.getElementById('pageCard');
  pageCard.appendChild(shell);

  // ── Events ────────────────────────────────────────────────────────────
  document.getElementById('fbCloseInline').addEventListener('click', () => window._closeFlipbookViewer && window._closeFlipbookViewer());
  document.getElementById('fbPrevBtn').addEventListener('click', () => _pageFlip && _pageFlip.flipPrev());
  document.getElementById('fbNextBtn').addEventListener('click', () => _pageFlip && _pageFlip.flipNext());
  document.getElementById('fbZoomInBtn').addEventListener('click',  () => zoomTo(_scale + ZOOM_STEP, true));
  document.getElementById('fbZoomOutBtn').addEventListener('click', () => zoomTo(_scale - ZOOM_STEP, true));
  document.getElementById('fbZoomResetBtn').addEventListener('click', () => zoomTo(1.0, true));
  document.getElementById('fbSinglePgBtn').addEventListener('click', () => setLayout('single'));
  document.getElementById('fbDoublePgBtn').addEventListener('click', () => setLayout('double'));

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (!document.getElementById('fbInlineShell') ||
        document.getElementById('fbInlineShell').style.display === 'none') return;
    if (isZoomed()) {
      const step = 80, vpEl = getVp();
      if (e.key === 'ArrowRight') { vpEl.scrollLeft += step; e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { vpEl.scrollLeft -= step; e.preventDefault(); }
      if (e.key === 'ArrowDown')  { vpEl.scrollTop  += step; e.preventDefault(); }
      if (e.key === 'ArrowUp')    { vpEl.scrollTop  -= step; e.preventDefault(); }
      if (e.key === 'Escape')     zoomTo(1.0, true);
    } else {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') _pageFlip && _pageFlip.flipNext();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   _pageFlip && _pageFlip.flipPrev();
    }
  });

  // Drag-to-pan
  const vpEl = getVp();
  vpEl.addEventListener('mousedown', e => {
    if (!isZoomed()) return;
    _dragging = true;
    _dragStart  = { x: e.clientX, y: e.clientY };
    _scrollStart = { l: vpEl.scrollLeft, t: vpEl.scrollTop };
    vpEl.style.cursor = 'grabbing';
    e.preventDefault(); e.stopPropagation();
  });
  window.addEventListener('mousemove', e => {
    if (!_dragging) return;
    vpEl.scrollLeft = _scrollStart.l - (e.clientX - _dragStart.x);
    vpEl.scrollTop  = _scrollStart.t - (e.clientY - _dragStart.y);
  });
  window.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = false;
    vpEl.style.cursor = isZoomed() ? 'grab' : 'default';
  });

  // Wheel-to-zoom
  vpEl.addEventListener('wheel', e => {
    e.preventDefault();
    if (window.activeHlType || document.body.classList.contains('hl-active-mode')) return;
    zoomTo(_scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), false);
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (document.getElementById('fbInlineShell')?.style.display === 'none') return;
    sizeViewport(); applyZoom(false);
  });
}

// ── Show / hide the inline shell ──────────────────────────────────────────
function showShell() {
  ensureShell();
  // Hide normal editor content
  const sectionsContainer = document.getElementById('sectionsContainer');
  const editor            = document.getElementById('editor');
  const pageTitleBar      = document.getElementById('pageTitleBar');
  if (sectionsContainer) sectionsContainer.style.display = 'none';
  if (editor)            editor.style.display = 'none';
  if (pageTitleBar)      pageTitleBar.style.display = 'none';

  document.getElementById('fbInlineShell').style.display = 'flex';
  // Move pageConfirmBtn above footer (80px from bottom instead of 28px)
  const confirmBtn = document.getElementById('pageConfirmBtn') || document.getElementById('pdfConfirmBtn');
  if (confirmBtn) confirmBtn.style.bottom = '80px';
}

function hideShell() {
  const shell = document.getElementById('fbInlineShell');
  if (shell) shell.style.display = 'none';
  // Restore confirm btn position
  const confirmBtn = document.getElementById('pageConfirmBtn') || document.getElementById('pdfConfirmBtn');
  if (confirmBtn) confirmBtn.style.bottom = '28px';
}

// ── Viewport sizing ───────────────────────────────────────────────────────
// Fits the flipbook spread inside the available doc-area width/height.
function sizeViewport() {
  const vpEl = getVp();
  if (!vpEl) return;

  const isDouble = _pdfLayout === 'double';
  const spreadW  = isDouble ? PG_W * 2 : PG_W;
  const spreadH  = PG_H;

  // Available area = fbViewport container (flex:1 inside fbInlineShell)
  const container = document.getElementById('fbViewport');
  if (!container) return;
  const availW = container.clientWidth  - 4;
  const availH = container.clientHeight - 4;

  const scaleW = availW / spreadW;
  const scaleH = availH / spreadH;
  _autoScale   = Math.min(scaleW, scaleH, 1.5); // allow slight upscale for small screens

  const displayW = Math.round(spreadW * _autoScale);
  const displayH = Math.round(spreadH * _autoScale);

  vpEl.style.width  = displayW + 'px';
  vpEl.style.height = displayH + 'px';

  const cvsEl = getCvs();
  if (cvsEl) {
    cvsEl.style.width  = displayW + 'px';
    cvsEl.style.height = displayH + 'px';
  }
}

// ── Zoom ──────────────────────────────────────────────────────────────────
const isZoomed = () => _scale > 1.005;

function applyZoom(animated) {
  const vpEl  = getVp(),  cvsEl = getCvs(), bkEl = getBk();
  if (!vpEl || !cvsEl || !bkEl) return;

  const isDouble = _pdfLayout === 'double';
  const spreadW  = isDouble ? PG_W * 2 : PG_W;
  const spreadH  = PG_H;
  const total    = _autoScale * _scale;

  const cw = Math.round(spreadW * total);
  const ch = Math.round(spreadH * total);

  const prevCW = cvsEl.offsetWidth  || spreadW;
  const prevCH = cvsEl.offsetHeight || spreadH;
  const cx = vpEl.scrollLeft + vpEl.clientWidth  / 2;
  const cy = vpEl.scrollTop  + vpEl.clientHeight / 2;
  const rx = cx / prevCW, ry = cy / prevCH;

  const dur = animated ? '0.2s' : '0s';
  cvsEl.style.transition = `width ${dur}, height ${dur}`;
  bkEl.style.transition  = `transform ${dur}`;
  cvsEl.style.width  = cw + 'px';
  cvsEl.style.height = ch + 'px';
  bkEl.style.transformOrigin = 'top left';
  bkEl.style.transform = `scale(${total})`;

  requestAnimationFrame(() => {
    if (isZoomed()) {
      vpEl.scrollLeft = rx * cw - vpEl.clientWidth  / 2;
      vpEl.scrollTop  = ry * ch - vpEl.clientHeight / 2;
    } else {
      vpEl.scrollLeft = 0; vpEl.scrollTop = 0;
    }
  });

  updateFlipLock();
  vpEl.style.cursor = isZoomed() ? 'grab' : 'default';
  const indEl = document.getElementById('fbZoomInd');
  if (indEl) indEl.textContent = Math.round(_scale * 100) + '%';
  const outBtn = document.getElementById('fbZoomOutBtn');
  const inBtn  = document.getElementById('fbZoomInBtn');
  if (outBtn) outBtn.disabled = _scale <= ZOOM_MIN;
  if (inBtn)  inBtn.disabled  = _scale >= ZOOM_MAX;

  // Re-render PDF pages at new quality when zoomed
  if (_mode === 'pdf' && _doc && isZoomed()) rerenderVisiblePdfPages();
}

function zoomTo(s, animated) {
  _scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));
  applyZoom(animated !== false);
}

// Flip-lock overlay (blocks page-flip clicks when zoomed or highlighting)
function updateFlipLock() {
  let ov = document.getElementById('fbFlipLockOverlay');
  if (!ov && getCvs()) {
    ov = document.createElement('div');
    ov.id = 'fbFlipLockOverlay';
    ov.style.cssText = 'position:absolute;inset:0;z-index:9999;display:none;';
    getCvs().appendChild(ov);
  }
  if (!ov) return;
  const locked = isZoomed() || document.body.classList.contains('hl-active-mode');
  ov.style.display = locked ? 'block' : 'none';
}
window._fbUpdateFlipLock = updateFlipLock;

// ── Layout toggle ─────────────────────────────────────────────────────────
function updateLayoutBtns() {
  const s = document.getElementById('fbSinglePgBtn');
  const d = document.getElementById('fbDoublePgBtn');
  if (!s || !d) return;
  s.classList.toggle('active', _pdfLayout === 'single');
  d.classList.toggle('active', _pdfLayout === 'double');
}

async function setLayout(val) {
  await saveLayoutPref(val);
  updateLayoutBtns();
  if (_mode === 'pdf'  && _doc  && _book)  await initPdfFlipbook(_doc,  _book);
  if (_mode === 'book' && _allPages.length) await reinitBookFlipbook();
}

// ── PDF page rendering ────────────────────────────────────────────────────
// Render at DPR × zoomScale for crisp quality when zoomed.
async function renderPdfPage(pdf, pageNum, canvasEl) {
  try {
    const page  = await pdf.getPage(pageNum);
    const dpr   = Math.min(window.devicePixelRatio || 1, 3);
    const extra = Math.min(_scale, 2);  // extra quality factor when zoomed
    const rawVp = page.getViewport({ scale: 1 });
    const base  = Math.min(PG_W / rawVp.width, PG_H / rawVp.height);
    const vport = page.getViewport({ scale: base * extra });
    const w = Math.round(vport.width), h = Math.round(vport.height);

    canvasEl.width  = w * dpr;
    canvasEl.height = h * dpr;
    canvasEl.style.width  = PG_W + 'px';   // always fill the page div at logical size
    canvasEl.style.height = PG_H + 'px';
    canvasEl.style.objectFit = 'contain';

    await page.render({
      canvasContext: canvasEl.getContext('2d'),
      viewport: vport,
      transform: [dpr, 0, 0, dpr, 0, 0]
    }).promise;

    // Text layer
    const wrapper = canvasEl.parentElement;
    let textDiv = wrapper.querySelector('.textLayer');
    if (!textDiv) {
      textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      textDiv.style.cssText = `position:absolute;inset:0;overflow:hidden;opacity:1;
        user-select:text;-webkit-user-select:text;pointer-events:auto;`;
      wrapper.appendChild(textDiv);
    }
    textDiv.innerHTML = '';
    textDiv.style.setProperty('--scale-factor', base);
    const tc = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
      textContentSource: tc,
      container: textDiv,
      viewport: page.getViewport({ scale: base }),
      textDivs: []
    }).promise;

    // Repaint saved highlights
    if (window.pdfViewerBook?.pdfHighlights?.[pageNum]) {
      let hlContainer = wrapper.querySelector('.pdf-hl-container');
      if (!hlContainer) {
        hlContainer = document.createElement('div');
        hlContainer.className = 'pdf-hl-container';
        hlContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:25;';
        wrapper.appendChild(hlContainer);
      }
      window.pdfViewerBook.pdfHighlights[pageNum].forEach(hl => {
        if (!hl.rects) return;
        const color = hl.type === 'p' ? '#ffe566' : '#7ddb7d';
        hl.rects.forEach(r => {
          const d = document.createElement('div');
          d.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:${color};opacity:0.45;pointer-events:none;mix-blend-mode:multiply;border-radius:2px;`;
          hlContainer.appendChild(d);
        });
      });
    }
  } catch (e) { console.warn('renderPdfPage p' + pageNum, e); }
}

// Re-render visible pages at current zoom quality
function rerenderVisiblePdfPages() {
  if (!_doc) return;
  getBk()?.querySelectorAll('.fb-page[data-rendered="true"]').forEach(el => {
    const pn = parseInt(el.dataset.pageNum);
    if (!pn) return;
    const c = el.querySelector('canvas');
    if (c) renderPdfPage(_doc, pn, c);
  });
}

// ── Init PDF flipbook ─────────────────────────────────────────────────────
async function initPdfFlipbook(pdf, book) {
  _doc  = pdf; _book = book; _mode = 'pdf';
  _total = pdf.numPages; _scale = 1.0;

  const bkEl = getBk();
  bkEl.innerHTML = '';
  if (_pageFlip) { try { _pageFlip.destroy(); } catch (e) {} _pageFlip = null; }

  const isDouble = _pdfLayout === 'double';
  const pageItems = [];

  for (let i = 1; i <= _total; i++) {
    const div = document.createElement('div');
    div.className = 'fb-page';
    div.dataset.pageNum = i;
    div.dataset.rendered = 'false';
    // Each page div is EXACTLY PG_W × PG_H — StPageFlip needs exact sizes
    div.style.cssText = `width:${PG_W}px;height:${PG_H}px;position:relative;overflow:hidden;background:#fff;`;
    const c = document.createElement('canvas');
    c.style.cssText = `display:block;position:absolute;top:0;left:0;width:${PG_W}px;height:${PG_H}px;`;
    div.appendChild(c);
    bkEl.appendChild(div);
    pageItems.push({ el: div, canvas: c, pageNum: i });
  }

  sizeViewport();

  _pageFlip = new St.PageFlip(bkEl, {
    width:               PG_W,
    height:              PG_H,
    size:                'fixed',
    showCover:           false,
    drawShadow:          true,
    maxShadowOpacity:    0.5,
    flippingTime:        500,
    usePortrait:         !isDouble,
    startPage:           0,
    swipeDistance:       30,
    useMouseEvents:      true,
    showPageCorners:     true,
    disableFlipByClick:  false,
    // Pre-render both faces so backwards-flip shows the correct page, not a blank
    autoSize:            false,
  });
  _pageFlip.loadFromHTML(Array.from(bkEl.querySelectorAll('.fb-page')));

  _pageFlip.on('flip',        () => { updateFbUI(); updateFlipLock(); });
  _pageFlip.on('changeState', () => updateFlipLock());

  updateFbUI();
  applyZoom(false);

  // Lazy render — use larger rootMargin so adjacent pages pre-render (fixes blank on flip)
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.dataset.rendered === 'true') return;
      el.dataset.rendered = 'true';
      const item = pageItems.find(p => p.el === el);
      if (item) renderPdfPage(pdf, item.pageNum, item.canvas);
    });
  }, { root: null, rootMargin: '1200px 0px', threshold: 0 });
  // Pre-render first 4 pages immediately so flip works from page 1
  for (let i = 0; i < Math.min(4, pageItems.length); i++) {
    pageItems[i].el.dataset.rendered = 'true';
    renderPdfPage(pdf, pageItems[i].pageNum, pageItems[i].canvas);
  }
  pageItems.slice(4).forEach(({ el }) => obs.observe(el));
}

// ── UI update (PDF mode) ──────────────────────────────────────────────────
function updateFbUI() {
  if (!_pageFlip) return;
  const cur     = _pageFlip.getCurrentPageIndex();
  const spreads = _pdfLayout === 'double' ? Math.ceil(_total / 2) : _total;
  const spread  = _pdfLayout === 'double' ? Math.floor(cur / 2) + 1 : cur + 1;

  const pageInd  = document.getElementById('fbPageInd');
  const pageInfo = document.getElementById('fbPageInfoInline');
  if (pageInd)  pageInd.textContent  = spread + ' / ' + spreads;
  if (pageInfo) pageInfo.textContent = `Page ${cur + 1} of ${_total}`;

  const prevBtn = document.getElementById('fbPrevBtn');
  const nextBtn = document.getElementById('fbNextBtn');
  if (prevBtn) prevBtn.disabled = cur <= 0;
  if (nextBtn) nextBtn.disabled = cur >= _total - 1;

  window.pdfCurrentPage = cur + 1;
  if (window.renderPDFConfirmBtn) window.renderPDFConfirmBtn();
}

// ── Open PDF flipbook ─────────────────────────────────────────────────────
window._openFlipbookViewer = async function (book, pdf) {
  await loadLayoutPref();
  ensureShell();
  showShell();

  const lbl = document.getElementById('fbModeLabel');
  if (lbl) lbl.textContent = book.name || 'PDF';
  updateLayoutBtns();

  if (!window.St || !window.St.PageFlip) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js';
    s.onload = async () => { await initPdfFlipbook(pdf, book); };
    document.head.appendChild(s);
    return;
  }
  await initPdfFlipbook(pdf, book);
};

// ── Close ─────────────────────────────────────────────────────────────────
window._closeFlipbookViewer = function (skipHomeClick) {
  // Save stopwatch time for current book topic before closing
  if (_mode === 'book' && window.saveStopwatchToTopic) window.saveStopwatchToTopic();

  hideShell();
  document.getElementById('pageCard')?.classList.remove('fb-active');
  if (_pageFlip) { try { _pageFlip.destroy(); } catch (e) {} _pageFlip = null; }
  _mode = null; _allPages = [];

  if (!skipHomeClick) {
    // Book mode: return to editor view
    const sectionsContainer = document.getElementById('sectionsContainer');
    const editor            = document.getElementById('editor');
    const pageTitleBar      = document.getElementById('pageTitleBar');
    if (sectionsContainer) sectionsContainer.style.display = '';
    if (editor)            editor.style.display = '';
    if (pageTitleBar && window.selectedTopicId) pageTitleBar.style.display = 'block';
  }
  // PDF mode: pdf.js homeLink handler restores everything
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOK FLIPBOOK  — paginate sections into A4 pages and show in same shell
// ═══════════════════════════════════════════════════════════════════════════

(function () {
'use strict';

// A4 usable content area (padding 56px each side, 48px top, 44px bottom)
const CONTENT_W = PG_W - 112;
const CONTENT_H = PG_H - 92;

// ── Pagination ────────────────────────────────────────────────────────────
function paginateHTML(htmlString, chapterLabel, sectionTitle) {
  const pages = [];

  const ruler = document.createElement('div');
  ruler.style.cssText = `
    position:absolute;top:-9999px;left:-9999px;
    width:${CONTENT_W}px;
    font-family:var(--font,'Merriweather',Georgia,serif);
    font-size:14px;line-height:1.85;color:#1e1808;
    visibility:hidden;pointer-events:none;box-sizing:border-box;
  `;
  document.body.appendChild(ruler);

  const tmp = document.createElement('div');
  tmp.innerHTML = htmlString;
  const nodes = Array.from(tmp.childNodes).filter(n =>
    n.nodeType === Node.ELEMENT_NODE ||
    (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
  );

  let pageHTML = '', pageH = 0, isFirst = true;
  const HEADER_H = 52;

  function flush() {
    pages.push({ html: pageHTML, isFirst });
    pageHTML = ''; pageH = 0; isFirst = false;
  }

  for (const node of nodes) {
    ruler.innerHTML = node.outerHTML || node.textContent;
    const nh = ruler.getBoundingClientRect().height || ruler.offsetHeight || 0;
    const avail = CONTENT_H - (isFirst ? HEADER_H : 0);
    if (pageH + nh > avail && pageHTML) flush();
    pageHTML += (node.outerHTML || node.textContent);
    pageH    += nh;
  }
  if (pageHTML) flush();
  document.body.removeChild(ruler);

  return pages.map(pg => {
    const hdr = pg.isFirst ? `
      <div class="fb-page-chapter-label">${escHtml(chapterLabel)}</div>
      <div class="fb-section-title">${escHtml(sectionTitle)}</div>` : '';
    return hdr + pg.html;
  });
}

function buildBookPages(topics, bookName) {
  const all = [];
  // Cover
  all.push({
    html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100%;text-align:center;gap:16px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:2.8rem;font-weight:300;
        color:#3a2c1a;line-height:1.2;">${escHtml(bookName)}</div>
      <div style="width:40px;height:1px;background:rgba(120,80,30,0.3);"></div>
      <div style="font-family:sans-serif;font-size:10px;letter-spacing:0.2em;
        text-transform:uppercase;color:rgba(120,80,30,0.45);">Lexica</div>
    </div>`,
    topicId: '__cover__', topicName: ''
  });
  for (const tp of topics) {
    for (const sec of (tp.sections || [])) {
      if (!sec.content?.trim()) continue;
      const label = tp.chapterName ? `${tp.chapterName} — ${tp.name}` : tp.name;
      paginateHTML(sec.content, label, sec.title || '').forEach(html => {
        all.push({ html, topicId: tp.id, topicName: tp.name });
      });
    }
  }
  // Back cover
  all.push({
    html: `<div style="display:flex;align-items:center;justify-content:center;height:100%;">
      <div style="font-family:sans-serif;font-size:9px;letter-spacing:.22em;
        text-transform:uppercase;color:rgba(120,80,30,0.35);">End</div>
    </div>`,
    topicId: '__back__', topicName: ''
  });
  return all;
}

// Used when re-initing after layout toggle
let _bookTopics = [], _bookName = '', _startPageIdx = 0;

window._openBookFlipbookViewer = async function (topics, startTopicIndex, bookName) {
  _bookTopics = topics; _bookName = bookName;
  await loadLayoutPref();
  ensureShell();
  showShell();
  _mode = 'book';

  const lbl = document.getElementById('fbModeLabel');
  if (lbl) lbl.textContent = bookName || 'Book';
  updateLayoutBtns();

  _allPages = buildBookPages(topics, bookName);
  _startPageIdx = 0;
  if (startTopicIndex > 0) {
    const startId = topics[startTopicIndex]?.id;
    const idx = _allPages.findIndex(p => p.topicId === startId);
    if (idx > 0) _startPageIdx = idx;
  }

  await _initBookFlip();
};

async function reinitBookFlipbook() {
  _allPages = buildBookPages(_bookTopics, _bookName);
  await _initBookFlip();
}
window._reinitBookFlipbook = reinitBookFlipbook;

async function _initBookFlip() {
  const bkEl = getBk();
  if (!bkEl) return;
  bkEl.innerHTML = '';
  if (_pageFlip) { try { _pageFlip.destroy(); } catch (e) {} _pageFlip = null; }

  const isDouble = _pdfLayout === 'double';

  _allPages.forEach((pg, i) => {
    const div = document.createElement('div');
    div.className = 'fb-page fb-book-page';
    // Exact size — critical for StPageFlip
    div.style.cssText = `width:${PG_W}px;height:${PG_H}px;box-sizing:border-box;overflow:hidden;position:relative;`;
    div.innerHTML = pg.html;
    if (pg.topicId !== '__cover__' && pg.topicId !== '__back__') {
      const pn = document.createElement('div');
      pn.className = 'fb-page-number';
      pn.textContent = i;
      div.appendChild(pn);
    }
    bkEl.appendChild(div);
  });

  sizeViewport();

  const pf = new St.PageFlip(bkEl, {
    width:              PG_W,
    height:             PG_H,
    size:               'fixed',
    showCover:          true,
    drawShadow:         true,
    maxShadowOpacity:   0.5,
    flippingTime:       550,
    usePortrait:        !isDouble,
    startPage:          0,
    swipeDistance:      30,
    useMouseEvents:     true,
    showPageCorners:    true,
    disableFlipByClick: false,
    autoSize:           false,
  });

  window._fbSetPageFlip(pf);
  pf.loadFromHTML(Array.from(bkEl.querySelectorAll('.fb-page')));

  if (_startPageIdx > 0) {
    setTimeout(() => { try { pf.turnToPage(_startPageIdx); } catch(e){} }, 150);
  }

  // Track stopwatch per topic
  pf.on('flip', () => {
    // Save time to the topic that was just left
    if (window.saveStopwatchToTopic) window.saveStopwatchToTopic();
    updateBkUI(pf);
    updateFlipLock();
  });
  pf.on('changeState', () => updateFlipLock());

  updateBkUI(pf);
  applyZoom(false);
}

function updateBkUI(pf) {
  if (!pf) return;
  const cur  = pf.getCurrentPageIndex();
  const tot  = _allPages.length;
  const pg   = _allPages[cur];

  const info = document.getElementById('fbPageInfoInline');
  if (info) info.textContent = pg?.topicName || (cur === 0 ? (_bookName || '') : '');

  const spreads = _pdfLayout === 'double' ? Math.ceil(tot / 2) : tot;
  const spread  = _pdfLayout === 'double' ? Math.floor(cur / 2) + 1 : cur + 1;
  const pageInd = document.getElementById('fbPageInd');
  if (pageInd) pageInd.textContent = spread + ' / ' + spreads;

  const prevBtn = document.getElementById('fbPrevBtn');
  const nextBtn = document.getElementById('fbNextBtn');
  if (prevBtn) prevBtn.disabled = cur <= 0;
  if (nextBtn) nextBtn.disabled = cur >= tot - 1;

  // Update stopwatch selectedTopicId so time saves to the right topic
  if (pg?.topicId && pg.topicId !== '__cover__' && pg.topicId !== '__back__') {
    const topicInTree = _bookTopics.find(t => t.id === pg.topicId);
    if (topicInTree && window.selectedTopicId !== pg.topicId) {
      // Soft-switch: don't re-render editor, just update stopwatch context
      window.selectedTopicId = pg.topicId;
    }
  }
}

})(); // end book IIFE

// ── Shared setter for _pageFlip (must be at outer scope) ──────────────────
window._fbSetPageFlip = function (pf) {
  _pageFlip = pf;
  const prev = document.getElementById('fbPrevBtn');
  const next = document.getElementById('fbNextBtn');
  if (prev) prev.onclick = () => pf.flipPrev();
  if (next) next.onclick = () => pf.flipNext();
};

})(); // end outer IIFE