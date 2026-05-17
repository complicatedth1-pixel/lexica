// ── Lexica Search Modal ───────────────────────────────────────────────────────
// Standalone module. Depends on globals from editor.js:
//   activeHlType, triggerAutosave, showToast, escHtml
// Exposes: window.LexicaSearch.open(queryText), window.LexicaSearch.setAnchor(range)
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let _anchorRange       = null;   // selection range in editor (set by editor.js)
  let _currentQuery      = '';
  let _iframeSelText     = '';     // text selected inside iframe (via postMessage)
  let _actionBarVisible  = false;

  // ── Build Modal DOM ────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id    = 'srm-overlay';
  overlay.innerHTML = `
    <div id="srm-box">

      <!-- Header -->
      <div id="srm-header">
        <div id="srm-header-left">
          <span id="srm-icon">⬡</span>
          <span id="srm-query-label"></span>
        </div>
        <div id="srm-header-right">
          <button id="srm-btn-newtab" title="Open in new tab">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            New Tab
          </button>
          <button id="srm-btn-close" title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      <div id="srm-tabs">
        <div id="srm-tab-active">
          <span id="srm-tab-favicon"></span>
          <span id="srm-tab-title">Bing Search</span>
        </div>
        <div id="srm-tab-trail"></div>
      </div>

      <!-- Iframe area -->
      <div id="srm-iframe-wrap">
        <div id="srm-loading-bar"><div id="srm-loading-fill"></div></div>
        <iframe id="srm-iframe" src="" frameborder="0" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>

        <!-- In-modal floating action bar (appears on text selection inside iframe) -->
        <div id="srm-action-bar" aria-hidden="true">
          <span id="srm-action-preview"></span>
          <div id="srm-action-buttons">
            <button class="srm-action-btn" data-action="insert" title="Add after your selection in editor">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              Add to note
            </button>
            <button class="srm-action-btn" data-action="search-tab" title="Search this text in new Bing tab">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </button>
            <button class="srm-action-btn" data-action="copy" title="Copy text">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div id="srm-footer">
        <span id="srm-footer-hint">Select text inside the search results to get options</span>
        <span id="srm-footer-status"></span>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  const iframe      = document.getElementById('srm-iframe');
  const queryLabel  = document.getElementById('srm-query-label');
  const tabTitle    = document.getElementById('srm-tab-title');
  const actionBar   = document.getElementById('srm-action-bar');
  const actionPrev  = document.getElementById('srm-action-preview');
  const loadingFill = document.getElementById('srm-loading-fill');
  const footerHint  = document.getElementById('srm-footer-hint');
  const footerStat  = document.getElementById('srm-footer-status');

  // ── Loading bar ────────────────────────────────────────
  let _loadTimer = null;
  function startLoadBar() {
    loadingFill.style.transition = 'none';
    loadingFill.style.width = '0%';
    loadingFill.parentElement.classList.add('active');
    requestAnimationFrame(() => {
      loadingFill.style.transition = 'width 2.8s cubic-bezier(0.1,0.6,0.4,1)';
      loadingFill.style.width = '75%';
    });
  }
  function finishLoadBar() {
    loadingFill.style.transition = 'width 0.3s ease';
    loadingFill.style.width = '100%';
    _loadTimer = setTimeout(() => {
      loadingFill.parentElement.classList.remove('active');
    }, 350);
  }
  iframe.addEventListener('load', finishLoadBar);

  // ── Open / Close ───────────────────────────────────────
  function open(queryText) {
    _currentQuery = queryText;
    queryLabel.textContent = queryText;
    tabTitle.textContent   = queryText + ' — Bing';
    hideActionBar();
    startLoadBar();
    iframe.src = 'https://www.bing.com/search?q=' + encodeURIComponent(queryText);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    hideActionBar();
    // Blank iframe after transition to stop background loading
    setTimeout(() => { iframe.src = ''; }, 220);
  }

  // ── Action bar ─────────────────────────────────────────
  function showActionBar(text) {
    _iframeSelText   = text;
    _actionBarVisible = true;
    // Truncate preview
    const preview = text.length > 60 ? text.slice(0, 58) + '…' : text;
    actionPrev.textContent = '"' + preview + '"';
    actionBar.classList.add('visible');
    actionBar.setAttribute('aria-hidden', 'false');
    footerHint.style.display = 'none';
    footerStat.textContent   = '';
  }

  function hideActionBar() {
    _actionBarVisible  = false;
    _iframeSelText     = '';
    actionBar.classList.remove('visible');
    actionBar.setAttribute('aria-hidden', 'true');
    footerHint.style.display = '';
    footerStat.textContent   = '';
  }

  // ── Detect selection changes inside iframe via postMessage ──
  // We inject a tiny script into the iframe through the sandbox's
  // allow-scripts. Because Bing is cross-origin, direct DOM access is
  // blocked — so we rely on the user's own selections on THIS document
  // side (the overlay area) as a fallback, plus a polling trick.
  //
  // Primary approach: listen for mouseup on the overlay's iframe area.
  // When the user selects text inside the iframe and then the mouse
  // comes back up on the overlay (even on the thin chrome around the
  // iframe), we can't read iframe selection directly. Instead we
  // provide a visible hint: "Select text → right-click → Copy, then
  // use the action bar below". But we CAN detect if something is on
  // the clipboard via the Clipboard API after a copy event fires from
  // the iframe contentWindow — but that also requires same-origin.
  //
  // Best achievable approach for cross-origin iframes:
  // Listen to 'copy' events that bubble to window (they do bubble from
  // cross-origin iframes in some browsers), or watch for focus events
  // from the iframe + a short polling window after mouseup.

  let _pollInterval = null;

  function startIframeSelectionPolling() {
    clearInterval(_pollInterval);
    _pollInterval = setInterval(() => {
      // Try to read selection from the page document (works if user
      // clicks outside iframe, e.g. on action bar itself)
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const t = sel.toString().trim();
        if (t.length > 1) { showActionBar(t); return; }
      }
    }, 400);
  }

  function stopIframeSelectionPolling() {
    clearInterval(_pollInterval);
  }

  overlay.classList.add('open');
  overlay.classList.remove('open'); // init closed

  // On iframe mouseup (mouse released over iframe area) — start polling
  document.getElementById('srm-iframe-wrap').addEventListener('mouseup', () => {
    if (!overlay.classList.contains('open')) return;
    // Give browser time to update selection
    setTimeout(() => {
      const sel = window.getSelection();
      const t   = sel && !sel.isCollapsed ? sel.toString().trim() : '';
      if (t.length > 1) {
        showActionBar(t);
      }
    }, 80);
    startIframeSelectionPolling();
  });

  // Also listen for mousedown on the wrap to hide bar if clicking away
  document.getElementById('srm-iframe-wrap').addEventListener('mousedown', (e) => {
    if (e.target !== actionBar && !actionBar.contains(e.target)) {
      // Don't immediately hide — user might be starting a new selection
    }
  });

  // Hide bar when clicking elsewhere inside overlay chrome
  document.getElementById('srm-header').addEventListener('mousedown', hideActionBar);
  document.getElementById('srm-tabs').addEventListener('mousedown', hideActionBar);
  document.getElementById('srm-footer').addEventListener('mousedown', hideActionBar);

  // ── Action bar button handlers ─────────────────────────
  actionBar.addEventListener('click', e => {
    const btn = e.target.closest('.srm-action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const text   = _iframeSelText;
    if (!text) return;

    if (action === 'insert') {
      insertAfterAnchor(text);
      hideActionBar();
      setStatus('✓ Added to note');
    } else if (action === 'search-tab') {
      // Navigate current iframe to new query, and push to history
      navigateIframe(text);
      hideActionBar();
    } else if (action === 'copy') {
      navigator.clipboard.writeText(text).then(() => {
        setStatus('✓ Copied');
        hideActionBar();
      });
    }
  });

  function navigateIframe(queryText) {
    _currentQuery        = queryText;
    queryLabel.textContent = queryText;
    tabTitle.textContent   = queryText + ' — Bing';
    startLoadBar();
    iframe.src = 'https://www.bing.com/search?q=' + encodeURIComponent(queryText);
    // Push to breadcrumb trail
    const trail = document.getElementById('srm-tab-trail');
    const crumb = document.createElement('span');
    crumb.className   = 'srm-crumb';
    crumb.textContent = queryText;
    crumb.title       = 'Search: ' + queryText;
    trail.appendChild(crumb);
  }

  function setStatus(msg) {
    footerStat.textContent = msg;
    setTimeout(() => { footerStat.textContent = ''; }, 2500);
  }

  // ── insertAfterAnchor ──────────────────────────────────
  function insertAfterAnchor(text) {
    // _anchorRange is set by editor.js via LexicaSearch.setAnchor()
    if (!_anchorRange) {
      showToast('⚠ Lost selection anchor — re-select text in editor first');
      return;
    }
    try {
      if (!document.contains(_anchorRange.startContainer)) {
        showToast('⚠ Selection is no longer valid');
        return;
      }
      const insertRange = _anchorRange.cloneRange();
      insertRange.collapse(false);

      const span = document.createElement('span');
      span.className              = 'inserted-text-span';
      span.setAttribute('data-inserted', 'true');
      span.textContent = ' [' + text + ']';

      insertRange.insertNode(span);
      const afterRange = document.createRange();
      afterRange.setStartAfter(span);
      afterRange.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(afterRange);
      triggerAutosave();
    } catch (err) {
      showToast('⚠ Could not insert text');
    }
  }

  // ── Header button handlers ─────────────────────────────
  document.getElementById('srm-btn-close').addEventListener('click', close);
  document.getElementById('srm-btn-newtab').addEventListener('click', () => {
    if (_currentQuery) {
      window.open('https://www.bing.com/search?q=' + encodeURIComponent(_currentQuery), '_blank', 'noopener');
    }
  });

  // Click on backdrop closes
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  // ── Public API ─────────────────────────────────────────
  window.LexicaSearch = {
    open,
    close,
    setAnchor(range) { _anchorRange = range; }
  };

})();