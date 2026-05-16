// flipbook.js — StPageFlip dual-page PDF viewer
// Loaded after pdf.js. Exposes: window._openFlipbookViewer, window._closeFlipbookViewer
// Requires: StPageFlip CDN loaded in index.html

'use strict';

(function () {

// ── Layout preference (persisted in Supabase user_settings.pdf_layout) ────
let _pdfLayout = 'double'; // 'single' | 'double'  — default is double-page spread

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
const ZOOM_MIN = 1.0, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;
// Dimensions for each page leaf inside the spread
const PG_W = 550, PG_H = 700;

// ── State ──────────────────────────────────────────────────────────────────
let _pageFlip  = null;
let _scale     = 1.0;
let _total     = 0;
let _doc       = null;
let _book      = null;
let _dragging  = false;
let _dragStart = { x: 0, y: 0 };
let _scrollStart = { l: 0, t: 0 };

// ── DOM shortcuts ──────────────────────────────────────────────────────────
const vp     = () => document.getElementById('fbZoomViewport');
const cvs    = () => document.getElementById('fbZoomCanvas');
const bookEl = () => document.getElementById('fbBook');
const isZoomed = () => _scale > 1.005;

// ── Build shell (runs once) ────────────────────────────────────────────────
function ensureShell() {
  if (document.getElementById('flipbookShell')) return;

  const shell = document.createElement('div');
  shell.id = 'flipbookShell';
  shell.innerHTML = `
    <div id="fbTopbar">
      <button class="topbar-home-link" id="fbHomeLink">
        <span class="home-arrow">←</span> Home
      </button>
      <div class="topbar-sep"></div>
      <span id="fbBookTitle" style="font-family:sans-serif;font-size:11px;color:#9a8a6a;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;"></span>
      <div class="topbar-sep"></div>
      <span style="font-size:10px;font-family:sans-serif;color:#665f78;white-space:nowrap;">Zoom</span>
      <select id="fbZoomSelect" class="eo-select">
        <option value="0.75">75%</option>
        <option value="1" selected>100%</option>
        <option value="1.25">125%</option>
        <option value="1.5">150%</option>
        <option value="2">200%</option>
      </select>
      <div class="topbar-sep"></div>
      <button class="eo-btn" id="fbCaptureBtn" title="Capture spread">📷</button>
      <div class="topbar-sep"></div>
      <span id="fbPageInfoTop"
            style="font-size:10px;font-family:sans-serif;color:#9a8a6a;white-space:nowrap;flex-shrink:0;"></span>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;
                overflow:hidden;padding-bottom:52px;width:100%;">
      <div id="fbZoomViewport">
        <div id="fbZoomCanvas">
          <div id="fbBook"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(shell);

  // Footer
  const footer = document.createElement('div');
  footer.id = 'fbFooter';
  footer.innerHTML = `
    <div class="fb-footer-sec">
      <button class="fb-ctrl-btn" id="fbPrevBtn">‹ Prev</button>
    </div>
    <div class="fb-footer-div"></div>
    <div class="fb-footer-sec">
      <button class="fb-zoom-btn" id="fbZoomOutBtn">−</button>
      <span class="fb-zoom-ind" id="fbZoomInd">100%</span>
      <button class="fb-zoom-btn" id="fbZoomInBtn">+</button>
      <button class="fb-ctrl-btn" id="fbZoomResetBtn"
              style="padding:6px 10px;font-size:0.7rem;">Reset</button>
    </div>
    <div class="fb-footer-div"></div>
    <div class="fb-footer-sec">
      <span class="fb-page-ind" id="fbPageInd">1 / 1</span>
    </div>
    <div class="fb-footer-div"></div>
    <div class="fb-footer-sec">
      <button class="fb-ctrl-btn" id="fbNextBtn">Next ›</button>
    </div>`;
  document.body.appendChild(footer);

  // ── Wire up events ──────────────────────────────────────────────────
  document.getElementById('fbHomeLink').addEventListener('click', closeFlipbook);
  document.getElementById('fbZoomSelect').addEventListener('change', function () {
    zoomTo(parseFloat(this.value), true);
  });
  document.getElementById('fbCaptureBtn').addEventListener('click', capture);
  document.getElementById('fbPrevBtn').addEventListener('click', () => { if (_pageFlip) _pageFlip.flipPrev(); });
  document.getElementById('fbNextBtn').addEventListener('click', () => { if (_pageFlip) _pageFlip.flipNext(); });
  document.getElementById('fbZoomInBtn').addEventListener('click',  () => zoomTo(_scale + ZOOM_STEP, true));
  document.getElementById('fbZoomOutBtn').addEventListener('click', () => zoomTo(_scale - ZOOM_STEP, true));
  document.getElementById('fbZoomResetBtn').addEventListener('click', () => zoomTo(1.0, true));

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!document.getElementById('flipbookShell').classList.contains('fb-visible')) return;
    if (isZoomed()) {
      const step = 80;
      if (e.key === 'ArrowRight') { vp().scrollLeft += step; e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { vp().scrollLeft -= step; e.preventDefault(); }
      if (e.key === 'ArrowDown')  { vp().scrollTop  += step; e.preventDefault(); }
      if (e.key === 'ArrowUp')    { vp().scrollTop  -= step; e.preventDefault(); }
      if (e.key === 'Escape')     zoomTo(1.0, true);
    } else {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { if (_pageFlip) _pageFlip.flipNext(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { if (_pageFlip) _pageFlip.flipPrev(); }
    }
  });

  // Mouse drag to pan (only when zoomed)
  const vpEl = vp();
  vpEl.addEventListener('mousedown', e => {
    if (!isZoomed()) return;
    _dragging   = true;
    _dragStart  = { x: e.clientX, y: e.clientY };
    _scrollStart = { l: vpEl.scrollLeft, t: vpEl.scrollTop };
    vpEl.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopPropagation();
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

  // Wheel → zoom (suppressed when highlighter active)
  vpEl.addEventListener('wheel', e => {
    e.preventDefault();
    if (window.activeHlType || document.body.classList.contains('hl-active-mode')) return;
    zoomTo(_scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), false);
  }, { passive: false });
}

// ── Zoom ───────────────────────────────────────────────────────────────────
function applyZoom(animated) {
  const bookW = _pdfLayout === 'double' ? PG_W * 2 : PG_W;
  const bookH = PG_H;
  const cw    = Math.round(bookW * _scale);
  const ch    = Math.round(bookH * _scale);
  const vpEl  = vp(), cvsEl = cvs();

  const prevCW  = cvsEl.offsetWidth  || bookW;
  const prevCH  = cvsEl.offsetHeight || bookH;
  const cx      = vpEl.scrollLeft + vpEl.clientWidth  / 2;
  const cy      = vpEl.scrollTop  + vpEl.clientHeight / 2;
  const ratioX  = cx / prevCW;
  const ratioY  = cy / prevCH;

  const dur = animated ? '0.22s' : '0s';
  cvsEl.style.transition = `width ${dur} ease, height ${dur} ease`;
  bookEl().style.transition = `transform ${dur} ease`;
  cvsEl.style.width  = cw + 'px';
  cvsEl.style.height = ch + 'px';
  bookEl().style.transformOrigin = 'top left';
  bookEl().style.transform = `scale(${_scale})`;

  requestAnimationFrame(() => {
    if (isZoomed()) {
      vpEl.scrollLeft = ratioX * cw - vpEl.clientWidth  / 2;
      vpEl.scrollTop  = ratioY * ch - vpEl.clientHeight / 2;
    } else {
      vpEl.scrollLeft = 0; vpEl.scrollTop = 0;
    }
  });

  updateFlipLock();
  vpEl.style.cursor = isZoomed() ? 'grab' : 'default';
  document.getElementById('fbZoomInd').textContent = Math.round(_scale * 100) + '%';
  document.getElementById('fbZoomOutBtn').disabled = _scale <= ZOOM_MIN;
  document.getElementById('fbZoomInBtn').disabled  = _scale >= ZOOM_MAX;
}

function zoomTo(s, animated) {
  _scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));
  applyZoom(animated !== false);
}

// Overlay that blocks StPageFlip mouse events when zoomed or highlighting
function updateFlipLock() {
  let ov = document.getElementById('fbFlipLockOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fbFlipLockOverlay';
    ov.style.cssText = 'position:absolute;inset:0;z-index:9999;display:none;';
    cvs().appendChild(ov);
  }
  const locked = isZoomed() || document.body.classList.contains('hl-active-mode');
  ov.style.display = locked ? 'block' : 'none';
}

window._fbUpdateFlipLock = updateFlipLock; // called from editor.js setActiveHighlighter

// ── Size viewport to window ────────────────────────────────────────────────
function sizeViewport() {
  const vpEl  = vp();
  const bookW = _pdfLayout === 'double' ? PG_W * 2 : PG_W;
  const maxW  = Math.min(window.innerWidth - 32, bookW);
  const maxH  = window.innerHeight - 48 - 52; // topbar 48 + footer 52
  vpEl.style.width  = maxW + 'px';
  vpEl.style.height = maxH + 'px';
}

// ── Render a PDF page onto a <canvas> ─────────────────────────────────────
async function renderPdfPage(pdf, pageNum, canvasEl) {
  try {
    const page   = await pdf.getPage(pageNum);
    const dpr    = Math.min(window.devicePixelRatio || 1, 2);
    const rawVp  = page.getViewport({ scale: 1 });
    const scale  = Math.min(PG_W / rawVp.width, PG_H / rawVp.height);
    const vport  = page.getViewport({ scale });
    const w = Math.round(vport.width), h = Math.round(vport.height);

    canvasEl.width  = w * dpr;
    canvasEl.height = h * dpr;
    canvasEl.style.width  = w + 'px';
    canvasEl.style.height = h + 'px';

    const ctx = canvasEl.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vport, transform: [dpr,0,0,dpr,0,0] }).promise;

    // Text layer (enables text selection / copy for highlights)
    const wrapper = canvasEl.parentElement;
    let textDiv = wrapper.querySelector('.textLayer');
    if (!textDiv) {
      textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      wrapper.appendChild(textDiv);
    }
    textDiv.innerHTML = '';
    textDiv.style.width  = w + 'px';
    textDiv.style.height = h + 'px';
    textDiv.style.setProperty('--scale-factor', scale);
    const tc = await page.getTextContent();
    await pdfjsLib.renderTextLayer({ textContentSource: tc, container: textDiv, viewport: vport, textDivs: [] }).promise;

    // Repaint any saved highlights for this page
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
  } catch (e) { console.warn('renderPdfPage error p' + pageNum, e); }
}

// ── Initialise StPageFlip ──────────────────────────────────────────────────
async function initFlipbook(pdf, book) {
  _doc   = pdf;
  _book  = book;
  _total = pdf.numPages;
  _scale = 1.0;

  const bkEl = bookEl();
  bkEl.innerHTML = '';

  const isDouble = _pdfLayout === 'double';

  // Build page divs
  const pageItems = [];
  for (let i = 1; i <= _total; i++) {
    const div = document.createElement('div');
    div.className = 'fb-page';
    div.dataset.pageNum = i;
    div.dataset.rendered = 'false';
    div.style.cssText = `width:${PG_W}px;height:${PG_H}px;position:relative;overflow:hidden;`;
    const c = document.createElement('canvas');
    c.style.cssText = 'display:block;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);';
    div.appendChild(c);
    bkEl.appendChild(div);
    pageItems.push({ el: div, canvas: c, pageNum: i });
  }

  sizeViewport();

  // Destroy previous instance if any
  if (_pageFlip) { try { _pageFlip.destroy(); } catch (e) {} _pageFlip = null; }

  _pageFlip = new St.PageFlip(bkEl, {
    width:  PG_W,
    height: PG_H,
    size:   'fixed',
    showCover:           false,
    drawShadow:          true,
    maxShadowOpacity:    0.65,
    flippingTime:        600,
    usePortrait:         !isDouble,  // portrait = single page
    startPage:           0,
    swipeDistance:       40,
    useMouseEvents:      true,
    showPageCorners:     true,
    disableFlipByClick:  false,
  });
  _pageFlip.loadFromHTML(Array.from(bkEl.querySelectorAll('.fb-page')));

  _pageFlip.on('flip',        () => { updateFbUI(); updateFlipLock(); });
  _pageFlip.on('changeState', () => updateFlipLock());

  updateFbUI();
  applyZoom(false);

  // Lazy-render pages as they scroll into view
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.dataset.rendered === 'true') return;
      el.dataset.rendered = 'true';
      const item = pageItems.find(p => p.el === el);
      if (item) renderPdfPage(pdf, item.pageNum, item.canvas);
    });
  }, { rootMargin: '500px 0px', threshold: 0 });
  pageItems.forEach(({ el }) => obs.observe(el));
}

// ── UI update ──────────────────────────────────────────────────────────────
function updateFbUI() {
  if (!_pageFlip) return;
  const cur     = _pageFlip.getCurrentPageIndex();
  const spreads = _pdfLayout === 'double' ? Math.ceil(_total / 2) : _total;
  const spread  = _pdfLayout === 'double' ? Math.floor(cur / 2) + 1 : cur + 1;

  document.getElementById('fbPageInd').textContent     = spread + ' / ' + spreads;
  document.getElementById('fbPageInfoTop').textContent = `Page ${cur + 1} of ${_total}`;
  document.getElementById('fbPrevBtn').disabled = cur <= 0;
  document.getElementById('fbNextBtn').disabled = cur >= _total - 1;

  // Keep globals in sync for highlight / stopwatch / confirm-btn
  window.pdfCurrentPage = cur + 1;
  if (window.renderPDFConfirmBtn) window.renderPDFConfirmBtn();
}

// ── Layout toggle in right panel ───────────────────────────────────────────
function injectLayoutToggle() {
  const rpBody = document.querySelector('#rightPanel .rp-body');
  if (!rpBody) return;
  let tog = document.getElementById('pdfLayoutToggle');
  if (!tog) {
    tog = document.createElement('div');
    tog.id = 'pdfLayoutToggle';
    tog.className = 'pdf-layout-toggle';
    rpBody.prepend(tog);
  }
  tog.innerHTML = `
    <button class="pdf-layout-btn${_pdfLayout === 'single' ? ' active' : ''}" id="fbSingleBtn">☰ Single</button>
    <button class="pdf-layout-btn${_pdfLayout === 'double' ? ' active' : ''}" id="fbDoubleBtn">⬜ Double</button>`;
  document.getElementById('fbSingleBtn').addEventListener('click', () => setLayout('single'));
  document.getElementById('fbDoubleBtn').addEventListener('click', () => setLayout('double'));
}

async function setLayout(val) {
  await saveLayoutPref(val);
  injectLayoutToggle();
  if (_doc && _book) await initFlipbook(_doc, _book);
}

// ── Capture spread ─────────────────────────────────────────────────────────
function capture() {
  const canvases = bookEl().querySelectorAll('canvas');
  if (!canvases.length) { showToast('Nothing to capture'); return; }
  const a = document.createElement('a');
  a.href = canvases[0].toDataURL('image/png');
  a.download = ((_book && _book.name) || 'spread') + '-spread.png';
  a.click();
  showToast('✓ Spread captured');
}

// ── Open ───────────────────────────────────────────────────────────────────
window._openFlipbookViewer = async function (book, pdf) {
  await loadLayoutPref();
  ensureShell();
  document.getElementById('flipbookShell').classList.add('fb-visible');
  document.getElementById('fbFooter').classList.add('fb-visible');
  document.getElementById('fbBookTitle').textContent = book.name || '';
  document.getElementById('fbZoomSelect').value = '1';
  injectLayoutToggle();

  if (!window.St || !window.St.PageFlip) {
    // StPageFlip not loaded yet (edge case if CDN is slow)
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js';
    s.onload = async () => { await initFlipbook(pdf, book); };
    document.head.appendChild(s);
    return;
  }
  await initFlipbook(pdf, book);
};

// ── Close ──────────────────────────────────────────────────────────────────
window._closeFlipbookViewer = function (skipHomeClick) {
  document.getElementById('flipbookShell').classList.remove('fb-visible');
  document.getElementById('fbFooter').classList.remove('fb-visible');
  if (_pageFlip) { try { _pageFlip.destroy(); } catch (e) {} _pageFlip = null; }
  const tog = document.getElementById('pdfLayoutToggle');
  if (tog) tog.remove();
  if (!skipHomeClick) {
    const hl = document.getElementById('homeLink');
    if (hl) hl.click();
  }
};
// ═══════════════════════════════════════════════════════════════════════
// BOOK FLIPBOOK VIEWER  — paginated reader for created books
// Paginates section HTML into fixed page-sized divs, then opens them
// in the same StPageFlip shell used by the PDF flipbook viewer.
// ═══════════════════════════════════════════════════════════════════════

(function () {
'use strict';

// Page dimensions (must match StPageFlip init in the PDF viewer above)
const BK_PG_W = 550;
const BK_PG_H = 700;
// Usable content area inside page padding (px, approximate)
const CONTENT_W = BK_PG_W - 104; // 52px padding each side
const CONTENT_H = BK_PG_H - 96;  // 52px top + 44px bottom

// ── Pagination engine ──────────────────────────────────────────────────────
// Renders content into an offscreen page, measures actual height used,
// splits at overflow boundaries. Returns array of HTML strings (one per page).
function paginateHTML(htmlString, chapterLabel, sectionTitle) {
  const pages = [];

  // Offscreen measurement container
  const ruler = document.createElement('div');
  ruler.style.cssText = `
    position: absolute; top: -9999px; left: -9999px;
    width: ${CONTENT_W}px;
    font-family: var(--font, 'Merriweather', Georgia, serif);
    font-size: 14px; line-height: 1.85; color: #1e1808;
    visibility: hidden; pointer-events: none;
  `;
  document.body.appendChild(ruler);

  // Parse the HTML into block-level elements (p, h3, ul, ol, blockquote, div)
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlString;

  // Flatten into top-level child nodes
  const nodes = Array.from(tmp.childNodes).filter(n =>
    n.nodeType === Node.ELEMENT_NODE ||
    (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
  );

  let currentPageHTML = '';
  let currentHeight   = 0;
  let isFirstPage     = true;

  // Reserve height for the header labels on first page
  const headerReserve = isFirstPage ? 52 : 0; // chapter label + section title

  function flushPage() {
    pages.push({ html: currentPageHTML, isFirst: isFirstPage });
    currentPageHTML = '';
    currentHeight   = 0;
    isFirstPage     = false;
  }

  for (const node of nodes) {
    ruler.innerHTML = node.outerHTML || node.textContent;
    const nodeH = ruler.getBoundingClientRect().height || ruler.offsetHeight;
    const reserve = isFirstPage ? headerReserve : 0;
    const available = CONTENT_H - reserve;

    if (currentHeight + nodeH > available && currentPageHTML) {
      // Doesn't fit — flush current page first
      flushPage();
    }

    currentPageHTML += (node.outerHTML || node.textContent);
    currentHeight   += nodeH;
  }

  if (currentPageHTML) flushPage();
  document.body.removeChild(ruler);

  // Build final page HTML strings with decorations
  return pages.map((pg, i) => {
    const header = pg.isFirst ? `
      <div class="fb-page-chapter-label">${escHtml(chapterLabel)}</div>
      <div class="fb-section-title">${escHtml(sectionTitle)}</div>
    ` : '';
    return header + pg.html;
  });
}

// ── Build all pages from all topics ───────────────────────────────────────
function buildBookPages(topics, bookName) {
  // Returns array of { html, topicId, topicName }
  const allPages = [];

  // Cover page
  allPages.push({
    html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:12px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:300;color:#3a2c1a;line-height:1.2;">${escHtml(bookName)}</div>
      <div style="width:40px;height:1px;background:rgba(120,80,30,0.3);"></div>
      <div style="font-family:sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(120,80,30,0.45);">Lexica</div>
    </div>`,
    topicId: '__cover__', topicName: ''
  });

  for (const tp of topics) {
    for (const sec of (tp.sections || [])) {
      if (!sec.content || !sec.content.trim()) continue;
      const label = tp.chapterName ? `${tp.chapterName} — ${tp.name}` : tp.name;
      const pageHTMLs = paginateHTML(sec.content, label, sec.title || '');
      pageHTMLs.forEach(html => {
        allPages.push({ html, topicId: tp.id, topicName: tp.name });
      });
    }
  }

  // Back cover
  allPages.push({
    html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:8px;">
      <div style="font-family:sans-serif;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(120,80,30,0.35);">End</div>
    </div>`,
    topicId: '__back__', topicName: ''
  });

  return allPages;
}

// ── Open the book in the flipbook shell ───────────────────────────────────
window._openBookFlipbookViewer = async function (topics, startTopicIndex, bookName) {
  // Ensure the shell exists (built by the PDF flipbook code above)
  ensureShell();

  const shell  = document.getElementById('flipbookShell');
  const footer = document.getElementById('fbFooter');
  shell.classList.add('fb-visible');
  footer.classList.add('fb-visible');
  document.getElementById('fbBookTitle').textContent = bookName || '';
  document.getElementById('fbZoomSelect').value = '1';

  // Layout pref (reuse same preference as PDF viewer)
  await loadLayoutPref();

  // Remove PDF layout toggle (books always use loaded pref, toggle still works)
  const togEl = document.getElementById('pdfLayoutToggle');
  if (togEl) togEl.remove();
  injectLayoutToggle();

  // Build paginated content
  const allPages = buildBookPages(topics, bookName);

  // Destroy any previous pageFlip instance
  const bkEl = bookEl();
  bkEl.innerHTML = '';
  if (typeof _pageFlip !== 'undefined' && _pageFlip) {
    try { _pageFlip.destroy(); } catch (e) {} 
  }

  const isDouble = _pdfLayout === 'double';

  // Create page divs
  allPages.forEach((pg, i) => {
    const div = document.createElement('div');
    div.className = 'fb-page fb-book-page';
    div.style.cssText = `width:${BK_PG_W}px;height:${BK_PG_H}px;`;
    div.innerHTML = pg.html;
    // Page number (skip cover / back)
    if (pg.topicId !== '__cover__' && pg.topicId !== '__back__') {
      const pn = document.createElement('div');
      pn.className = 'fb-page-number';
      pn.textContent = i; // page number (cover = 0)
      div.appendChild(pn);
    }
    bkEl.appendChild(div);
  });

  sizeViewport();

  // Re-init StPageFlip for book mode
  const pf = new St.PageFlip(bkEl, {
    width:  BK_PG_W,
    height: BK_PG_H,
    size:   'fixed',
    showCover:          true,
    drawShadow:         true,
    maxShadowOpacity:   0.65,
    flippingTime:       650,
    usePortrait:        !isDouble,
    startPage:          0,
    swipeDistance:      40,
    useMouseEvents:     true,
    showPageCorners:    true,
    disableFlipByClick: false,
  });

  // Store reference in the outer closure variable so zoom/lock controls work
  // We overwrite the module-level _pageFlip via the exposed setter
  if (window._fbSetPageFlip) window._fbSetPageFlip(pf);

  pf.loadFromHTML(Array.from(bkEl.querySelectorAll('.fb-page')));

  // Jump to the first page of the requested topic
  const startTopicId = topics[startTopicIndex]?.id;
  let startPageIdx = 0;
  if (startTopicId) {
    const idx = allPages.findIndex(p => p.topicId === startTopicId);
    if (idx > 0) startPageIdx = idx;
  }
  if (startPageIdx > 0) {
    setTimeout(() => { try { pf.turnToPage(startPageIdx); } catch(e){} }, 120);
  }

  pf.on('flip',        () => updateBkUI(pf, allPages));
  pf.on('changeState', () => updateFlipLock());

  updateBkUI(pf, allPages);
  applyZoom(false);
};

function updateBkUI(pf, allPages) {
  if (!pf) return;
  const cur  = pf.getCurrentPageIndex();
  const tot  = allPages.length;
  const pg   = allPages[cur];
  document.getElementById('fbPageInfoTop').textContent =
    pg && pg.topicName ? pg.topicName : (cur === 0 ? bookNameLabel() : '');
  const spreads = _pdfLayout === 'double' ? Math.ceil(tot / 2) : tot;
  const spread  = _pdfLayout === 'double' ? Math.floor(cur / 2) + 1 : cur + 1;
  document.getElementById('fbPageInd').textContent = spread + ' / ' + spreads;
  document.getElementById('fbPrevBtn').disabled = cur <= 0;
  document.getElementById('fbNextBtn').disabled = cur >= tot - 1;
}

function bookNameLabel() {
  return document.getElementById('fbBookTitle')?.textContent || '';
}

// ── Expose a setter so the book viewer can update the module-level _pageFlip
// that the zoom / lock controls reference. Add this at module level in flipbook.js.
// (We expose it here since it's in the same file — the IIFE closure shares scope.)
window._fbSetPageFlip = function(pf) {
  // This reaches into the outer IIFE's _pageFlip variable via the global setter
  // We re-bind the footer buttons to the new instance
  const prev = document.getElementById('fbPrevBtn');
  const next = document.getElementById('fbNextBtn');
  if (prev) prev.onclick = () => pf.flipPrev();
  if (next) next.onclick = () => pf.flipNext();
};

})();
})();