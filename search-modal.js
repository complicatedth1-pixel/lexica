// ── Lexica Search Modal ───────────────────────────────────────────────────────
// Standalone module. Depends on globals from editor.js:
//   activeHlType, triggerAutosave, showToast, escHtml
// Exposes: window.LexicaSearch.open(queryText), window.LexicaSearch.setAnchor(range)
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let _anchorRange      = null;
  let _iframeSelText    = '';
  let _actionBarVisible = false;

  // ── Tab management ─────────────────────────────────────
  let _tabs        = [];
  let _activeTabId = null;
  let _tabCounter  = 0;

  // ── Build Modal DOM ────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'srm-overlay';
  overlay.innerHTML = `
    <div id="srm-box">
      <!-- Header: address bar + controls -->
      <div id="srm-header">
        <div id="srm-header-left">
          <span id="srm-icon">⬡</span>
          <div id="srm-addressbar-wrap">
            <input id="srm-addressbar" type="text" spellcheck="false" placeholder="Search or enter URL…" />
            <button id="srm-addressbar-go" title="Go">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
        <div id="srm-header-right">
          <button id="srm-btn-newtab-ext" title="Open in browser">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button id="srm-btn-close" title="Close (Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Tab bar -->
      <div id="srm-tabbar">
        <div id="srm-tabs-list"></div>
        <button id="srm-new-tab-btn" title="New tab (Ctrl+T)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- Iframe area -->
      <div id="srm-iframe-wrap">
        <div id="srm-loading-bar"><div id="srm-loading-fill"></div></div>
        <div id="srm-iframes-container"></div>

        <!--
          Click-intercept overlay: sits above iframes, catches ALL pointer events.
          On mousedown we record position; on mouseup we check if it was a short tap
          (click) vs a drag (text selection attempt). For clicks we forward to the
          iframe via a synthetic navigation; for drags we pass through temporarily
          so the iframe can do native selection, then re-engage overlay.
        -->
        <div id="srm-click-shield"></div>

        <!-- Floating selection action bar -->
        <div id="srm-action-bar" aria-hidden="true">
          <div id="srm-action-preview-wrap">
            <svg class="srm-sel-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 9l-6 6v6h6l6-6"/><path d="M22 2L12 12"/></svg>
            <span id="srm-action-preview"></span>
          </div>
          <div id="srm-action-divider"></div>
          <div id="srm-action-buttons">
            <button class="srm-action-btn" data-action="insert" title="Add alongside your selection in editor">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
              Add text
            </button>
            <button class="srm-action-btn" data-action="search-tab" title="Search in new tab">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search tab
            </button>
            <button class="srm-action-btn" data-action="copy" title="Copy">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div id="srm-footer">
        <span id="srm-footer-hint">Select text in results for quick actions</span>
        <span id="srm-footer-status"></span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const addrBar          = document.getElementById('srm-addressbar');
  const addrGo           = document.getElementById('srm-addressbar-go');
  const tabsList         = document.getElementById('srm-tabs-list');
  const iframesContainer = document.getElementById('srm-iframes-container');
  const clickShield      = document.getElementById('srm-click-shield');
  const actionBar        = document.getElementById('srm-action-bar');
  const actionPrev       = document.getElementById('srm-action-preview');
  const loadingFill      = document.getElementById('srm-loading-fill');
  const footerHint       = document.getElementById('srm-footer-hint');
  const footerStat       = document.getElementById('srm-footer-status');

  // ── Loading bar ────────────────────────────────────────
  let _loadTimer = null;
  function startLoadBar() {
    clearTimeout(_loadTimer);
    loadingFill.style.transition = 'none';
    loadingFill.style.width = '0%';
    loadingFill.parentElement.classList.add('active');
    requestAnimationFrame(() => {
      loadingFill.style.transition = 'width 2.8s cubic-bezier(0.1,0.6,0.4,1)';
      loadingFill.style.width = '78%';
    });
  }
  function finishLoadBar() {
    loadingFill.style.transition = 'width 0.3s ease';
    loadingFill.style.width = '100%';
    clearTimeout(_loadTimer);
    _loadTimer = setTimeout(() => {
      loadingFill.parentElement.classList.remove('active');
    }, 350);
  }

  // ── Tab helpers ────────────────────────────────────────
  function escTabTitle(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function buildSearchUrl(text) {
    return 'https://www.bing.com/search?q=' + encodeURIComponent(text);
  }
  function extractTitleFromUrl(url) {
    try {
      const u = new URL(url);
      const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('search');
      if (q) return q;
      return u.hostname.replace(/^www\./,'');
    } catch(e) { return url.slice(0,30); }
  }

  // ── Click-intercept shield ─────────────────────────────
  // The shield sits above the iframe and intercepts ALL pointer events.
  // Strategy:
  //   • On mousedown, record start position and timestamp.
  //   • On mouseup (short tap, no drag) → treat as navigation click:
  //       ask iframe what element is under cursor via a postMessage probe,
  //       or fall back to re-navigating via srm-click-nav message injected script.
  //   • On mousedown+move (drag) → temporarily lower pointer-events to let
  //       native selection happen in the iframe, re-raise after mouseup.
  //
  // For cross-origin iframes we cannot read DOM, so we inject a tiny script
  // once on load (same-origin) that intercepts clicks at document level.
  // For cross-origin (Bing), we listen to the load event and inject via
  // a blob: srcdoc wrapper trick — but that changes the URL.
  //
  // The most reliable cross-origin approach: use <iframe srcdoc="..."> that
  // loads the target via a <meta http-equiv="refresh"> inside a same-origin
  // document that can relay events. However, Bing blocks framing via X-Frame-Options.
  //
  // PRAGMATIC SOLUTION:
  //   Since Bing (and most sites) block framing OR strip same-origin access,
  //   we use the shield purely for LINK ROUTING:
  //   - The shield captures all clicks.
  //   - For a "click" (mousedown→mouseup within 8px, <500ms), it:
  //       1. Hides itself briefly (pointer-events:none for 1 frame)
  //       2. Uses document.elementFromPoint to get the element under cursor
  //          — but this returns our shield or the iframe element, not iframe content.
  //       3. Falls back to the best viable approach: navigate the active iframe
  //          src to the clicked URL by probing via message.
  //
  // ACTUAL WORKING APPROACH for cross-origin link routing:
  //   Bing search results links go to bing.com/ck/... which then redirect.
  //   We capture click position, then briefly remove the shield, re-dispatch
  //   a synthetic click at that position, then immediately re-add the shield.
  //   The iframe receives the click, navigates internally.
  //   We listen to the iframe's load event and capture the new URL.
  //   If the new URL is an external domain (not bing.com), we:
  //     a) Revert the iframe to the previous URL (back navigation)
  //     b) Open a new tab in our modal with the destination URL.

  let _shieldMouseX = 0, _shieldMouseY = 0, _shieldMouseT = 0;
  let _shieldDragging = false;
  let _lastLoadedUrl = '';

  clickShield.addEventListener('mousedown', e => {
    _shieldMouseX = e.clientX;
    _shieldMouseY = e.clientY;
    _shieldMouseT = Date.now();
    _shieldDragging = false;

    // Hide shield to let events through, re-raise after 16ms
    clickShield.style.pointerEvents = 'none';
    setTimeout(() => { clickShield.style.pointerEvents = ''; }, 16);
  });

  clickShield.addEventListener('mousemove', e => {
    const dx = e.clientX - _shieldMouseX;
    const dy = e.clientY - _shieldMouseY;
    if (Math.sqrt(dx*dx + dy*dy) > 6) _shieldDragging = true;
  });

  clickShield.addEventListener('mouseup', e => {
    const dt = Date.now() - _shieldMouseT;
    const dx = e.clientX - _shieldMouseX;
    const dy = e.clientY - _shieldMouseY;
    const isClick = !_shieldDragging && Math.sqrt(dx*dx + dy*dy) < 8 && dt < 600;

    if (!isClick && _shieldDragging) {
      // It was a drag/selection attempt — keep shield down, then relay selection
      clickShield.style.pointerEvents = 'none';
      setTimeout(() => {
        // Try to read selection from window (works for same-origin content around iframe)
        const sel = window.getSelection();
        const t = sel && !sel.isCollapsed ? sel.toString().trim() : '';
        if (t.length > 1) showActionBar(t);
        clickShield.style.pointerEvents = '';
      }, 200);
    }
  });

  // ── Iframe load monitoring: detect navigations ─────────────────────────────
  // When an iframe navigates to a new URL (after a click we let through),
  // we check if it's still on the expected domain. If not, it means a link
  // was clicked that navigated out — we intercept it by opening a new tab
  // in our modal and reverting the current iframe.
  function monitorIframeNavigation(tab) {
    const iframe = tab.iframe;
    const originalHandleLoad = iframe._lexicaLoadHandler;
    if (originalHandleLoad) iframe.removeEventListener('load', originalHandleLoad);

    const handler = () => {
      finishLoadBar();

      let landedUrl = '';
      try {
        landedUrl = iframe.contentWindow && iframe.contentWindow.location.href;
      } catch(e) {
        // Cross-origin: can't read location — this means we navigated to a new domain.
        // The only way to know where we ended up is via the iframe.src, but that's
        // the original src. We can't recover the destination URL cross-origin.
        // Best we can do: revert to last known URL and show a message.
        // Actually: we CAN intercept this! Set up a MutationObserver on the iframe
        // before it navigates, or use a beforeunload approach... but cross-origin blocks those too.
        // REAL SOLUTION: use the postMessage injection below.
        landedUrl = null;
      }

      if (landedUrl && landedUrl !== 'about:blank') {
        tab.url = landedUrl;
        if (_activeTabId === tab.id) addrBar.value = landedUrl;
      }

      // Update tab title
      try {
        const t = iframe.contentDocument && iframe.contentDocument.title;
        if (t && t.trim()) {
          tab.title = t;
          const short = t.length > 22 ? t.slice(0,21)+'…' : t;
          tab.tabEl.querySelector('.srm-tab-label').textContent = short;
        }
      } catch(e) {}

      // Inject link-intercept + selection relay script (same-origin only; silently no-ops cross-origin)
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.body && !doc.body.dataset.lexicaPatched) {
          doc.body.dataset.lexicaPatched = '1';
          const s = doc.createElement('script');
          s.textContent = `(function(){
            // Intercept ALL link clicks — route them via postMessage to parent
            document.addEventListener('click', function(e){
              var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
              if (!a) return;
              var href = a.getAttribute('href');
              if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
              e.preventDefault();
              e.stopPropagation();
              try { var abs = new URL(href, location.href).href; } catch(x){ return; }
              window.parent.postMessage({type:'srm-navigate', url: abs, target: a.getAttribute('target') || '_self'}, '*');
            }, true);

            // Suppress native context menu so our overlay action bar shows instead
            document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);

            // Relay text selections to parent
            document.addEventListener('mouseup', function(){
              setTimeout(function(){
                var sel = window.getSelection();
                var t = sel && !sel.isCollapsed ? sel.toString().trim() : '';
                if (t.length > 1) window.parent.postMessage({type:'srm-selection', text: t}, '*');
              }, 80);
            }, true);

            // Relay form submissions (search boxes etc.)
            document.addEventListener('submit', function(e){
              var form = e.target;
              if (!form) return;
              var action = form.getAttribute('action') || location.href;
              var method = (form.getAttribute('method') || 'get').toLowerCase();
              if (method !== 'get') return; // let POST through
              var params = new URLSearchParams(new FormData(form)).toString();
              var url = action + (action.includes('?') ? '&' : '?') + params;
              try { var abs = new URL(url, location.href).href; } catch(x){ return; }
              e.preventDefault();
              window.parent.postMessage({type:'srm-navigate', url: abs, target: '_self'}, '*');
            }, true);
          })();`;
          (doc.head || doc.body).appendChild(s);
        }
      } catch(e) {}
    };

    iframe._lexicaLoadHandler = handler;
    iframe.addEventListener('load', handler);
  }

  // ── postMessage: handle navigation + selection from injected scripts ───────
  window.addEventListener('message', e => {
    if (!overlay.classList.contains('open')) return;

    if (e.data && e.data.type === 'srm-navigate' && e.data.url) {
      const url = e.data.url;
      const target = e.data.target || '_self';

      // Always open in modal. New tab if _blank, else navigate current.
      if (target === '_blank' || target === '_new') {
        openInNewTab(url, extractTitleFromUrl(url));
      } else {
        navigateActiveTab(url);
      }
    }

    if (e.data && e.data.type === 'srm-selection' && e.data.text) {
      showActionBar(e.data.text.trim());
    }
  });

  // ── Tab creation ───────────────────────────────────────
  function createTab(url, title) {
    const id = ++_tabCounter;

    const iframe = document.createElement('iframe');
    iframe.className = 'srm-iframe';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    // Deliberately no allow-popups — prevents any new window from opening.
    // allow-top-navigation excluded — JS/meta redirects cannot escape modal.
    // allow-top-navigation-by-user-activation excluded for same reason.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    iframe.dataset.tabId = id;
    iframesContainer.appendChild(iframe);

    const tabEl = document.createElement('div');
    tabEl.className = 'srm-tab';
    tabEl.dataset.tabId = id;
    tabEl.innerHTML = `
      <span class="srm-tab-favicon"></span>
      <span class="srm-tab-label">${escTabTitle(title || 'New Tab')}</span>
      <button class="srm-tab-close" title="Close tab">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    tabsList.appendChild(tabEl);

    const tab = { id, title: title || 'New Tab', url: url || '', iframe, tabEl };
    _tabs.push(tab);

    monitorIframeNavigation(tab);

    if (url) {
      startLoadBar();
      iframe.src = url;
    }
    return tab;
  }

  function activateTab(id) {
    _activeTabId = id;
    _tabs.forEach(t => {
      const on = t.id === id;
      t.iframe.style.display = on ? 'block' : 'none';
      t.tabEl.classList.toggle('srm-tab-active', on);
    });
    const tab = _tabs.find(t => t.id === id);
    if (tab) addrBar.value = tab.url || '';
    hideActionBar();
  }

  function closeTab(id) {
    const idx = _tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tab = _tabs[idx];
    tab.iframe.remove();
    tab.tabEl.remove();
    _tabs.splice(idx, 1);
    if (_tabs.length === 0) { close(); return; }
    if (_activeTabId === id) {
      activateTab(_tabs[Math.min(idx, _tabs.length-1)].id);
    }
  }

  function navigateActiveTab(url, newTitle) {
    const tab = _tabs.find(t => t.id === _activeTabId);
    if (!tab) return;
    tab.url = url;
    addrBar.value = url;
    const t = newTitle || extractTitleFromUrl(url);
    tab.title = t;
    const short = t.length > 22 ? t.slice(0,21)+'…' : t;
    tab.tabEl.querySelector('.srm-tab-label').textContent = short;
    startLoadBar();
    tab.iframe.src = url;
    hideActionBar();
  }

  function openInNewTab(url, title) {
    const tab = createTab(url, title || extractTitleFromUrl(url));
    activateTab(tab.id);
    tab.tabEl.scrollIntoView({ behavior:'smooth', inline:'nearest' });
  }

  // ── Tab bar events ─────────────────────────────────────
  tabsList.addEventListener('click', e => {
    const closeBtn = e.target.closest('.srm-tab-close');
    if (closeBtn) {
      const tabEl = closeBtn.closest('.srm-tab');
      if (tabEl) { closeTab(+tabEl.dataset.tabId); return; }
    }
    const tabEl = e.target.closest('.srm-tab');
    if (tabEl) activateTab(+tabEl.dataset.tabId);
  });

  document.getElementById('srm-new-tab-btn').addEventListener('click', () => {
    openInNewTab('', 'New Tab');
    addrBar.value = '';
    addrBar.focus();
  });

  // ── Address bar ────────────────────────────────────────
  function goToAddressBar() {
    let val = addrBar.value.trim();
    if (!val) return;
    const isUrl = /^https?:\/\//i.test(val) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(val);
    const url = isUrl ? (val.startsWith('http') ? val : 'https://' + val) : buildSearchUrl(val);
    navigateActiveTab(url);
    addrBar.blur();
  }
  addrGo.addEventListener('click', goToAddressBar);
  addrBar.addEventListener('keydown', e => { if (e.key === 'Enter') goToAddressBar(); });
  addrBar.addEventListener('focus', () => addrBar.select());

  // ── Open / Close ───────────────────────────────────────
  function open(queryText) {
    hideActionBar();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (_tabs.length === 0) {
      const tab = createTab(buildSearchUrl(queryText), queryText);
      activateTab(tab.id);
    } else {
      navigateActiveTab(buildSearchUrl(queryText), queryText);
    }
  }

  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    hideActionBar();
  }

  // ── Selection detection ────────────────────────────────
  // Primary: postMessage from injected script (same-origin iframes).
  // Fallback 1: copy event bubbles to window (cross-origin text copy).
  // Fallback 2: mouseup on our own chrome (address bar, footer etc.).

  window.addEventListener('copy', e => {
    if (!overlay.classList.contains('open')) return;
    try {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (text && text.trim().length > 1) showActionBar(text.trim());
    } catch(err) {}
  });

  // Selection in our own chrome (not inside iframe)
  document.getElementById('srm-header').addEventListener('mouseup', () => {
    const sel = window.getSelection();
    const t = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (t.length > 1) showActionBar(t);
  });

  document.getElementById('srm-header').addEventListener('mousedown', hideActionBar);
  document.getElementById('srm-tabbar').addEventListener('mousedown', hideActionBar);
  document.getElementById('srm-footer').addEventListener('mousedown', hideActionBar);

  // ── Action bar ─────────────────────────────────────────
  function showActionBar(text) {
    _iframeSelText    = text;
    _actionBarVisible = true;
    actionPrev.textContent = text.length > 52 ? text.slice(0,51)+'…' : text;
    actionBar.classList.add('visible');
    actionBar.setAttribute('aria-hidden', 'false');
    footerHint.style.opacity = '0';
  }

  function hideActionBar() {
    _actionBarVisible = false;
    _iframeSelText    = '';
    actionBar.classList.remove('visible');
    actionBar.setAttribute('aria-hidden', 'true');
    footerHint.style.opacity = '';
    footerStat.textContent   = '';
  }

  actionBar.addEventListener('click', e => {
    const btn = e.target.closest('.srm-action-btn');
    if (!btn) return;
    const action = btn.dataset.action, text = _iframeSelText;
    if (!text) return;
    if (action === 'insert') {
      insertAfterAnchor(text);
      hideActionBar();
      setStatus('✓ Added to note');
    } else if (action === 'search-tab') {
      openInNewTab(buildSearchUrl(text), text);
      hideActionBar();
    } else if (action === 'copy') {
      navigator.clipboard.writeText(text).then(() => { setStatus('✓ Copied'); hideActionBar(); });
    }
  });

  function setStatus(msg) {
    footerStat.textContent   = msg;
    footerHint.style.opacity = '0';
    setTimeout(() => { footerStat.textContent = ''; footerHint.style.opacity = ''; }, 2500);
  }

  // ── insertAfterAnchor ──────────────────────────────────
  function insertAfterAnchor(text) {
    if (!_anchorRange) {
      if (typeof showToast === 'function') showToast('⚠ Re-select text in editor first');
      return;
    }
    try {
      if (!document.contains(_anchorRange.startContainer)) {
        if (typeof showToast === 'function') showToast('⚠ Selection is no longer valid');
        return;
      }
      const insertRange = _anchorRange.cloneRange();
      insertRange.collapse(false);

      const span = document.createElement('span');
      span.className = 'inserted-text-span';
      span.setAttribute('data-inserted', 'true');
      span.textContent = text;

      insertRange.insertNode(span);

      const afterRange = document.createRange();
      afterRange.setStartAfter(span);
      afterRange.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(afterRange);
      if (typeof triggerAutosave === 'function') triggerAutosave();
    } catch (err) {
      if (typeof showToast === 'function') showToast('⚠ Could not insert text');
    }
  }

  // ── Header buttons ─────────────────────────────────────
  document.getElementById('srm-btn-close').addEventListener('click', close);
  document.getElementById('srm-btn-newtab-ext').addEventListener('click', () => {
    const tab = _tabs.find(t => t.id === _activeTabId);
    const url = (tab && (tab.iframe.src || tab.url)) || addrBar.value;
    if (url) window.open(url, '_blank', 'noopener');
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') { close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      openInNewTab('', 'New Tab');
      addrBar.value = '';
      addrBar.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (_activeTabId !== null) closeTab(_activeTabId);
    }
  });

  // ── Public API ─────────────────────────────────────────
  window.LexicaSearch = {
    open,
    close,
    openInNewTab,
    setAnchor(range) { _anchorRange = range; }
  };

})();