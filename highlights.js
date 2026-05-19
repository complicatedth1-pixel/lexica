// highlights.js
// Highlight logic — categories driven by window.HL_CATEGORIES (from highlight-categories.js)
// Exposes: window.activeHlType, window.setActiveHighlighter, window.updateHL, window.initGroupHighlightsFromHTML
 
'use strict';
 
// ── Active highlighter state (window-scoped so editor.js can read it) ────────
window.activeHlType = null;
 
// ── Set active highlighter ────────────────────────────────────────────────────
window.setActiveHighlighter = function(catKey) {
  // Toggle off if same button clicked again
  if (window.activeHlType === catKey) {
    window.activeHlType = null;
    _updateAllButtonStates();
    return;
  }
  window.activeHlType = catKey;
  _updateAllButtonStates();
};
 
function _updateAllButtonStates() {
  (window.HL_CATEGORIES || []).forEach(cat => {
    const btn = document.getElementById('hl-btn-' + cat.key);
    if (!btn) return;
    if (window.activeHlType === cat.key) {
      btn.classList.add('hl-active');
      btn.style.outline = '2px solid #fff';
      btn.style.outlineOffset = '2px';
    } else {
      btn.classList.remove('hl-active');
      btn.style.outline = '';
      btn.style.outlineOffset = '';
    }
  });
  document.body.style.cursor = window.activeHlType ? 'crosshair' : '';
}
 
// ── Apply highlight on mouseup ────────────────────────────────────────────────
document.addEventListener('mouseup', function(e) {
  if (!window.activeHlType) return;
  // Don't trigger inside the toolbar itself
  if (e.target.closest('.topbar') || e.target.closest('#custom-sel-menu')) return;
 
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
 
  const range = sel.getRangeAt(0);
  // Ensure selection is inside an editor
  const editorEl = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer.closest('.section-editor, #editor')
    : range.commonAncestorContainer.parentElement && range.commonAncestorContainer.parentElement.closest('.section-editor, #editor');
  if (!editorEl) return;
 
  applyPreciseHighlight(range, window.activeHlType);
  sel.removeAllRanges();
 
  // Deactivate after one use
  window.activeHlType = null;
  _updateAllButtonStates();
 
  // Save
  _syncEditorContent(editorEl);
  if (typeof triggerAutosave === 'function') triggerAutosave();
  setTimeout(updateHL, 80);
  setTimeout(initGroupHighlightsFromHTML, 100);
});
 
// ── Apply precise highlight span ──────────────────────────────────────────────
function applyPreciseHighlight(range, catKey) {
  const cat = (window.HL_CAT_MAP || {})[catKey];
  if (!cat) return;
 
  const span = document.createElement('span');
  span.className = cat.spanClass;
  span.setAttribute('data-hl-cat', catKey);
 
  try {
    range.surroundContents(span);
  } catch(e) {
    // Range spans multiple elements — extract and wrap
    try {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    } catch(e2) {
      console.warn('highlights.js: could not apply highlight', e2);
      return;
    }
  }
}
 
// ── Sync editor content back to section data ──────────────────────────────────
function _syncEditorContent(editorEl) {
  // For section editors, fire an input event so editor.js picks it up
  if (editorEl && editorEl.classList.contains('section-editor')) {
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
 
// ── Remove highlight button ───────────────────────────────────────────────────
(function() {
  const removeBtn = document.createElement('button');
  removeBtn.id = 'hl-remove-btn';
  removeBtn.textContent = '✕ Remove Highlight';
  removeBtn.style.cssText = 'display:none;position:fixed;z-index:9000;background:#2a1f2e;border:1px solid rgba(255,100,100,0.4);color:#ff9090;font-size:11px;font-family:sans-serif;padding:5px 11px;border-radius:6px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
  document.body.appendChild(removeBtn);
 
  let _hlTarget = null;
 
  document.addEventListener('contextmenu', function(e) {
    const span = e.target.closest('[data-hl-cat]');
    if (!span) { removeBtn.style.display = 'none'; return; }
    e.preventDefault();
    _hlTarget = span;
    removeBtn.style.left = e.clientX + 'px';
    removeBtn.style.top  = (e.clientY - 36) + 'px';
    removeBtn.style.display = 'block';
  });
 
  removeBtn.addEventListener('click', function() {
    if (!_hlTarget) return;
    const parent = _hlTarget.parentNode;
    while (_hlTarget.firstChild) parent.insertBefore(_hlTarget.firstChild, _hlTarget);
    parent.removeChild(_hlTarget);
    _hlTarget = null;
    removeBtn.style.display = 'none';
    if (typeof triggerAutosave === 'function') triggerAutosave();
    setTimeout(updateHL, 80);
    setTimeout(initGroupHighlightsFromHTML, 100);
  });
 
  document.addEventListener('mousedown', function(e) {
    if (e.target !== removeBtn) removeBtn.style.display = 'none';
  });
})();
 
// ── Update right-panel highlight lists ───────────────────────────────────────
window.updateHL = function updateHL() {
  if (!window.HL_CATEGORIES) return;
 
  window.HL_CATEGORIES.forEach(cat => {
    const listEl = document.getElementById('hl-list-' + cat.key);
    if (!listEl) return;
 
    const spans = Array.from(document.querySelectorAll(
      `.section-editor [data-hl-cat="${cat.key}"], #editor [data-hl-cat="${cat.key}"]`
    ));
 
    if (spans.length === 0) {
      listEl.innerHTML = `<div class="hl-empty">No ${escHtml(cat.label)} highlights yet</div>`;
      return;
    }
 
    listEl.innerHTML = '';
    spans.forEach(span => {
      const card = document.createElement('div');
      card.className = 'hl-card hl-card-clickable';
      card.style.borderLeft = `3px solid ${cat.color}`;
      card.style.background = `rgba(${_hexToRgbParts(cat.color)},0.08)`;
 
      const badge = document.createElement('div');
      badge.className = 'hl-card-badge';
      badge.style.background = cat.color;
      badge.style.color = '#000';
      badge.textContent = cat.label;
 
      const text = document.createElement('div');
      text.className = 'hl-card-text';
      text.textContent = span.textContent;
 
      card.appendChild(badge);
      card.appendChild(text);
      card.addEventListener('click', () => {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        span.classList.add('hl-pulse');
        setTimeout(() => span.classList.remove('hl-pulse'), 1000);
      });
      listEl.appendChild(card);
    });
  });
 
  // Update notes panel
  _renderNotes();
};
 
// ── Group hover glow ──────────────────────────────────────────────────────────
document.addEventListener('mouseover', function(e) {
  const span = e.target.closest('[data-group]');
  if (!span) return;
  const group = span.getAttribute('data-group');
  if (!group) return;
  document.querySelectorAll(`[data-group="${CSS.escape(group)}"]`).forEach(el => el.classList.add('hl-group-glow'));
});
 
document.addEventListener('mouseout', function(e) {
  const span = e.target.closest('[data-group]');
  if (!span) return;
  const group = span.getAttribute('data-group');
  if (!group) return;
  document.querySelectorAll(`[data-group="${CSS.escape(group)}"]`).forEach(el => el.classList.remove('hl-group-glow'));
});
 
// Shift+click to select all spans in the same group
document.addEventListener('click', function(e) {
  if (!e.shiftKey) return;
  const span = e.target.closest('[data-group]');
  if (!span) return;
  const group = span.getAttribute('data-group');
  if (!group) return;
  const all = document.querySelectorAll(`[data-group="${CSS.escape(group)}"]`);
  all.forEach(el => {
    el.classList.add('hl-pulse');
    setTimeout(() => el.classList.remove('hl-pulse'), 1000);
  });
  e.preventDefault();
});
 
// ── Auto-assemble groups into Notes panel ────────────────────────────────────
window.initGroupHighlightsFromHTML = function() {
  // Re-stamp span classes from data-hl-cat (in case HTML was loaded without live CSS)
  document.querySelectorAll('[data-hl-cat]').forEach(span => {
    const catKey = span.getAttribute('data-hl-cat');
    const cat = (window.HL_CAT_MAP || {})[catKey];
    if (cat && !span.classList.contains(cat.spanClass)) {
      // Remove old hl classes
      Array.from(span.classList).forEach(c => { if (c.startsWith('hl-span-')) span.classList.remove(c); });
      span.classList.add(cat.spanClass);
    }
  });
 
  updateHL();
  _renderNotes();
};
 
// ── Render notes from groups ──────────────────────────────────────────────────
function _renderNotes() {
  const notesList = document.getElementById('notes-list');
  if (!notesList) return;
 
  // Collect all spans with data-group (where data-make-note is not "false")
  const groupMap = {};
  document.querySelectorAll('[data-group]').forEach(span => {
    if (span.getAttribute('data-make-note') === 'false') return;
    const group = span.getAttribute('data-group');
    if (!group) return;
    if (!groupMap[group]) groupMap[group] = [];
    groupMap[group].push(span);
  });
 
  // Only groups with 2+ highlights become notes
  const noteGroups = Object.entries(groupMap).filter(([, spans]) => spans.length >= 2);
 
  // Collect standalone hl-span-note spans (no data-group)
  const standaloneNotes = Array.from(document.querySelectorAll('[data-hl-cat="note"]:not([data-group])'));
 
  if (noteGroups.length === 0 && standaloneNotes.length === 0) {
    notesList.innerHTML = '<div class="hl-empty">No notes yet — groups with 2+ highlights auto-appear here</div>';
    return;
  }
 
  notesList.innerHTML = '';
 
  noteGroups.forEach(([groupName, spans]) => {
    const card = document.createElement('div');
    card.className = 'note-card';
 
    const title = document.createElement('div');
    title.className = 'note-tag';
    title.textContent = '✦ ' + groupName.replace(/-/g, ' ');
    card.appendChild(title);
 
    spans.forEach(span => {
      const catKey = span.getAttribute('data-hl-cat');
      const cat = (window.HL_CAT_MAP || {})[catKey];
      const line = document.createElement('p');
      if (cat) {
        line.innerHTML = `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700;background:${cat.color};color:#000;margin-right:4px;">${escHtml(cat.label)}</span> ${escHtml(span.textContent)}`;
      } else {
        line.textContent = span.textContent;
      }
      card.appendChild(line);
    });
 
    // Click to scroll to first span
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      spans[0].classList.add('hl-pulse');
      setTimeout(() => spans[0].classList.remove('hl-pulse'), 1000);
    });
 
    notesList.appendChild(card);
  });
 
  standaloneNotes.forEach(span => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.cursor = 'pointer';
    const p = document.createElement('p');
    p.textContent = span.textContent;
    card.appendChild(p);
    card.addEventListener('click', () => {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.classList.add('hl-pulse');
      setTimeout(() => span.classList.remove('hl-pulse'), 1000);
    });
    notesList.appendChild(card);
  });
}
 
// ── Highlights page (full page view) ─────────────────────────────────────────
window.openHighlightsPage = function() {
  const page = document.getElementById('highlightsPage');
  if (!page) return;
  page.style.display = 'block';
  _populateHlPageBookSelect();
  renderHighlightsPage();
};
 
window.closeHighlightsPage = function() {
  const page = document.getElementById('highlightsPage');
  if (page) page.style.display = 'none';
};
 
function _populateHlPageBookSelect() {
  const sel = document.getElementById('hlPageBookSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="__all__">All Books</option>';
  if (window.allBooks) {
    window.allBooks.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      sel.appendChild(opt);
    });
  }
}
 
window.renderHighlightsPage = function() {
  const container = document.getElementById('hlPageAllContent');
  if (!container) return;
  container.innerHTML = '';
 
  if (!window.HL_CATEGORIES) return;
 
  window.HL_CATEGORIES.forEach(cat => {
    const spans = Array.from(document.querySelectorAll(
      `.section-editor [data-hl-cat="${cat.key}"], #editor [data-hl-cat="${cat.key}"]`
    ));
    if (spans.length === 0) return;
 
    const section = document.createElement('div');
    section.style.marginBottom = '2rem';
 
    const heading = document.createElement('div');
    heading.style.cssText = 'font-family:sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:' + cat.color + ';margin-bottom:8px;';
    heading.textContent = '✦ ' + cat.label;
    section.appendChild(heading);
 
    spans.forEach(span => {
      const card = document.createElement('div');
      card.className = 'hl-card hl-card-clickable';
      card.style.borderLeft = `3px solid ${cat.color}`;
      card.style.marginBottom = '6px';
      const t = document.createElement('div');
      t.className = 'hl-card-text'; t.textContent = span.textContent;
      card.appendChild(t);
      card.addEventListener('click', () => {
        window.closeHighlightsPage();
        setTimeout(() => {
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          span.classList.add('hl-pulse');
          setTimeout(() => span.classList.remove('hl-pulse'), 1000);
        }, 300);
      });
      section.appendChild(card);
    });
 
    container.appendChild(section);
  });
 
  if (!container.children.length) {
    container.innerHTML = '<div style="font-size:13px;color:#887fa0;font-style:italic;padding:2rem 0;">No highlights yet across any book.</div>';
  }
};
 
// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
 
function _hexToRgbParts(hex) {
  let h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(x=>x+x).join('');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `${r},${g},${b}`;
}