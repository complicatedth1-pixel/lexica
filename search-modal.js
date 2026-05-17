// ── Lexica Search Modal ───────────────────────────────────────────────────────
// Standalone module. Depends on globals from editor.js: triggerAutosave, showToast
// Exposes: window.LexicaSearch.open(queryText), window.LexicaSearch.setAnchor(range)
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  let _anchorRange  = null;
  let _iframeSelText = '';
  let _tabs         = [];
  let _activeTabId  = null;
  let _tabCounter   = 0;
  let _loadTimer    = null;

  // ── Build DOM ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'srm-overlay';
  overlay.innerHTML = `
    <div id="srm-box">
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
          <button id="srm-btn-ext" title="Open in browser">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button id="srm-btn-close" title="Close (Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div id="srm-tabbar">
        <div id="srm-tabs-list"></div>
        <button id="srm-new-tab-btn" title="New tab (Ctrl+T)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div id="srm-iframe-wrap">
        <div id="srm-loading-bar"><div id="srm-loading-fill"></div></div>
        <div id="srm-iframes-container"></div>

        <div id="srm-action-bar" aria-hidden="true">
          <div id="srm-action-preview-wrap">
            <svg class="srm-sel-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 9l-6 6v6h6l6-6"/><path d="M22 2L12 12"/></svg>
            <span id="srm-action-preview"></span>
          </div>
          <div id="srm-action-divider"></div>
          <div id="srm-action-buttons">
            <button class="srm-action-btn" data-action="insert">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
              Add text
            </button>
            <button class="srm-action-btn" data-action="search-tab">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search tab
            </button>
            <button class="srm-action-btn" data-action="copy">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        </div>
      </div>

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
  const actionBar        = document.getElementById('srm-action-bar');
  const actionPrev       = document.getElementById('srm-action-preview');
  const loadingFill      = document.getElementById('srm-loading-fill');
  const footerHint       = document.getElementById('srm-footer-hint');
  const footerStat       = document.getElementById('srm-footer-status');

  // ── Helpers ────────────────────────────────────────────
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function searchUrl(q) { return 'https://www.bing.com/search?q=' + encodeURIComponent(q); }
  function titleFromUrl(url) {
    try {
      const u = new URL(url);
      return u.searchParams.get('q') || u.searchParams.get('query') || u.hostname.replace(/^www\./,'');
    } catch(e) { return url.slice(0,30); }
  }
  function shortTitle(s) { return s.length > 22 ? s.slice(0,21)+'…' : s; }

  // ── Loading bar ────────────────────────────────────────
  function startLoad() {
    clearTimeout(_loadTimer);
    loadingFill.style.transition = 'none';
    loadingFill.style.width = '0%';
    loadingFill.parentElement.classList.add('active');
    requestAnimationFrame(() => {
      loadingFill.style.transition = 'width 2.8s cubic-bezier(0.1,0.6,0.4,1)';
      loadingFill.style.width = '78%';
    });
  }
  function finishLoad() {
    loadingFill.style.transition = 'width 0.3s ease';
    loadingFill.style.width = '100%';
    clearTimeout(_loadTimer);
    _loadTimer = setTimeout(() => loadingFill.parentElement.classList.remove('active'), 350);
  }

  // ── Script injected into same-origin iframes on load ──
  // Intercepts _blank links → routes as new modal tabs via postMessage.
  // Relays text selections → triggers action bar.
  // Silently no-ops on cross-origin frames (security exception caught).
  // Cross-origin containment is handled by sandbox attribute instead:
  //   no allow-popups  → target=_blank clicks are swallowed by the browser
  //   no allow-top-navigation → JS redirects can't escape
  const INJECT = `(function(){
    if (window.__lx) return; window.__lx = 1;
    document.addEventListener('click', function(e){
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0)==='#' || href.indexOf('javascript')===0) return;
      var tgt = (a.getAttribute('target')||'').toLowerCase();
      if (tgt==='_blank'||tgt==='_new'||tgt==='_top'||tgt==='_parent') {
        e.preventDefault(); e.stopPropagation();
        try { window.parent.postMessage({type:'srm-open-tab',url:new URL(href,location.href).href},'*'); } catch(x){}
      }
    }, true);
    document.addEventListener('mouseup', function(){
      setTimeout(function(){
        var s=window.getSelection&&window.getSelection(),t=s&&!s.isCollapsed?s.toString().trim():'';
        if(t.length>1) window.parent.postMessage({type:'srm-selection',text:t},'*');
      },60);
    }, true);
  })();`;

  function tryInject(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || doc.body.__lx) return;
      doc.body.__lx = 1;
      const s = doc.createElement('script');
      s.textContent = INJECT;
      (doc.head || doc.body).appendChild(s);
    } catch(e) { /* cross-origin — fine, sandbox handles it */ }
  }

  // ── Tab creation ───────────────────────────────────────
  function createTab(url, title) {
    const id = ++_tabCounter;

    const iframe = document.createElement('iframe');
    iframe.className = 'srm-iframe';
    iframe.setAttribute('frameborder','0');
    // allow-popups intentionally excluded → _blank links do nothing natively
    // allow-top-navigation excluded → no escaping the modal
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads');
    iframe.dataset.tabId = id;
    iframesContainer.appendChild(iframe);

    const tabEl = document.createElement('div');
    tabEl.className = 'srm-tab';
    tabEl.dataset.tabId = id;
    tabEl.innerHTML = `
      <span class="srm-tab-favicon"></span>
      <span class="srm-tab-label">${esc(title||'New Tab')}</span>
      <button class="srm-tab-close" title="Close tab">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    tabsList.appendChild(tabEl);

    const tab = { id, title: title||'New Tab', url: url||'', iframe, tabEl };
    _tabs.push(tab);

    iframe.addEventListener('load', () => {
      finishLoad();
      try {
        const landed = iframe.contentWindow && iframe.contentWindow.location.href;
        if (landed && landed !== 'about:blank') {
          tab.url = landed;
          if (_activeTabId === id) addrBar.value = landed;
        }
      } catch(e) {}
      try {
        const t = iframe.contentDocument && iframe.contentDocument.title;
        if (t && t.trim()) {
          tab.title = t;
          tabEl.querySelector('.srm-tab-label').textContent = shortTitle(t);
        }
      } catch(e) {}
      tryInject(iframe);
    });

    if (url) { startLoad(); iframe.src = url; }
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
    _tabs[idx].iframe.remove();
    _tabs[idx].tabEl.remove();
    _tabs.splice(idx, 1);
    if (_tabs.length === 0) { modalClose(); return; }
    if (_activeTabId === id) activateTab(_tabs[Math.min(idx, _tabs.length-1)].id);
  }

  function navigateTo(url, title) {
    const tab = _tabs.find(t => t.id === _activeTabId);
    if (!tab) return;
    tab.url = url;
    addrBar.value = url;
    const t = title || titleFromUrl(url);
    tab.title = t;
    tab.tabEl.querySelector('.srm-tab-label').textContent = shortTitle(t);
    startLoad();
    tab.iframe.src = url;
    hideActionBar();
  }

  function openInNewTab(url, title) {
    const tab = createTab(url, title || titleFromUrl(url||'New Tab'));
    activateTab(tab.id);
    tab.tabEl.scrollIntoView({behavior:'smooth',inline:'nearest'});
  }

  // ── postMessage from injected script ───────────────────
  window.addEventListener('message', e => {
    if (!overlay.classList.contains('open') || !e.data) return;
    if (e.data.type === 'srm-open-tab' && e.data.url)
      openInNewTab(e.data.url, titleFromUrl(e.data.url));
    if (e.data.type === 'srm-selection' && e.data.text)
      showActionBar(e.data.text.trim());
  });

  // ── Tab bar ────────────────────────────────────────────
  tabsList.addEventListener('click', e => {
    const cb = e.target.closest('.srm-tab-close');
    if (cb) { const el = cb.closest('.srm-tab'); if (el) { closeTab(+el.dataset.tabId); return; } }
    const el = e.target.closest('.srm-tab');
    if (el) activateTab(+el.dataset.tabId);
  });
  document.getElementById('srm-new-tab-btn').addEventListener('click', () => {
    openInNewTab('','New Tab'); addrBar.value=''; addrBar.focus();
  });

  // ── Address bar ────────────────────────────────────────
  function goToAddr() {
    const val = addrBar.value.trim(); if (!val) return;
    const isUrl = /^https?:\/\//i.test(val) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(val);
    navigateTo(isUrl ? (val.startsWith('http') ? val : 'https://'+val) : searchUrl(val));
    addrBar.blur();
  }
  addrGo.addEventListener('click', goToAddr);
  addrBar.addEventListener('keydown', e => { if (e.key==='Enter') goToAddr(); });
  addrBar.addEventListener('focus', () => addrBar.select());

  // ── Open / Close ───────────────────────────────────────
  function modalOpen(queryText) {
    hideActionBar();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    if (_tabs.length === 0) { const tab = createTab(searchUrl(queryText), queryText); activateTab(tab.id); }
    else navigateTo(searchUrl(queryText), queryText);
  }
  function modalClose() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    hideActionBar();
  }

  // ── Selection fallback: copy event ────────────────────
  // When user copies text inside a cross-origin iframe, the copy event
  // fires on window — we can read the clipboard data.
  window.addEventListener('copy', e => {
    if (!overlay.classList.contains('open')) return;
    try {
      const text = (e.clipboardData||window.clipboardData).getData('text');
      if (text && text.trim().length > 1) showActionBar(text.trim());
    } catch(err) {}
  });

  // Dismiss action bar on chrome clicks
  ['srm-header','srm-tabbar','srm-footer'].forEach(id => {
    document.getElementById(id).addEventListener('mousedown', hideActionBar);
  });

  // ── Action bar ─────────────────────────────────────────
  function showActionBar(text) {
    _iframeSelText = text;
    actionPrev.textContent = text.length > 52 ? text.slice(0,51)+'…' : text;
    actionBar.classList.add('visible');
    actionBar.setAttribute('aria-hidden','false');
    footerHint.style.opacity = '0';
  }
  function hideActionBar() {
    _iframeSelText = '';
    actionBar.classList.remove('visible');
    actionBar.setAttribute('aria-hidden','true');
    footerHint.style.opacity = '';
    footerStat.textContent = '';
  }

  actionBar.addEventListener('click', e => {
    const btn = e.target.closest('.srm-action-btn');
    if (!btn || !_iframeSelText) return;
    const text = _iframeSelText;
    if (btn.dataset.action === 'insert') {
      insertAfterAnchor(text); hideActionBar(); setStatus('✓ Added to note');
    } else if (btn.dataset.action === 'search-tab') {
      openInNewTab(searchUrl(text), text); hideActionBar();
    } else if (btn.dataset.action === 'copy') {
      navigator.clipboard.writeText(text).then(() => { setStatus('✓ Copied'); hideActionBar(); });
    }
  });

  function setStatus(msg) {
    footerStat.textContent = msg; footerHint.style.opacity = '0';
    setTimeout(() => { footerStat.textContent = ''; footerHint.style.opacity = ''; }, 2500);
  }

  // ── Insert after anchor ────────────────────────────────
  function insertAfterAnchor(text) {
    if (!_anchorRange) { if (typeof showToast==='function') showToast('⚠ Re-select text in editor first'); return; }
    try {
      if (!document.contains(_anchorRange.startContainer)) {
        if (typeof showToast==='function') showToast('⚠ Selection is no longer valid'); return;
      }
      const r = _anchorRange.cloneRange(); r.collapse(false);
      const span = document.createElement('span');
      span.className = 'inserted-text-span'; span.setAttribute('data-inserted','true'); span.textContent = text;
      r.insertNode(span);
      const after = document.createRange(); after.setStartAfter(span); after.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(after);
      if (typeof triggerAutosave==='function') triggerAutosave();
    } catch(err) { if (typeof showToast==='function') showToast('⚠ Could not insert text'); }
  }

  // ── Buttons & keyboard ─────────────────────────────────
  document.getElementById('srm-btn-close').addEventListener('click', modalClose);
  document.getElementById('srm-btn-ext').addEventListener('click', () => {
    const tab = _tabs.find(t => t.id === _activeTabId);
    const url = (tab && tab.url) || addrBar.value;
    if (url) window.open(url,'_blank','noopener');
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) modalClose(); });
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    if (e.key==='Escape') { modalClose(); return; }
    if ((e.ctrlKey||e.metaKey) && e.key==='t') { e.preventDefault(); openInNewTab('','New Tab'); addrBar.value=''; addrBar.focus(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='w') { e.preventDefault(); if (_activeTabId!==null) closeTab(_activeTabId); }
  });

  // ── Public API ─────────────────────────────────────────
  window.LexicaSearch = { open: modalOpen, close: modalClose, openInNewTab, setAnchor(r){ _anchorRange=r; } };

})();