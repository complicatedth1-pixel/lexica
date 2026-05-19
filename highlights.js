// highlights.js
// Highlight logic — categories driven by window.HL_CATEGORIES (from highlight-categories.js)
// Exposes: window.activeHlType, window.setActiveHighlighter, window.updateHL, window.initGroupHighlightsFromHTML

'use strict';

// ── Active highlighter state ──────────────────────────────────
window.activeHlType = null;

// ── Set / toggle active highlighter ──────────────────────────
window.setActiveHighlighter = function(catKey) {
  if (window.activeHlType === catKey) {
    window.activeHlType = null;
  } else {
    window.activeHlType = catKey;
  }
  _updateButtonStates();
  document.body.style.cursor = window.activeHlType ? 'text' : '';
};

function _updateButtonStates() {
  (window.HL_CATEGORIES || []).forEach(function(cat) {
    var btn = document.getElementById('hl-btn-' + cat.key);
    if (!btn) return;
    if (window.activeHlType === cat.key) {
      btn.style.outline      = '3px solid #fff';
      btn.style.outlineOffset = '2px';
      btn.style.opacity      = '1';
    } else {
      btn.style.outline      = '';
      btn.style.outlineOffset = '';
      btn.style.opacity      = window.activeHlType ? '0.45' : '';
    }
  });
}

// ── Apply highlight on mouseup ────────────────────────────────
// We listen on document so it fires regardless of which editor has focus.
// We check window.activeHlType at mouseup time — if set, apply and clear.
document.addEventListener('mouseup', function(e) {
  if (!window.activeHlType) return;

  // Ignore clicks on the toolbar itself
  if (e.target.closest && (
    e.target.closest('.topbar') ||
    e.target.closest('#custom-sel-menu') ||
    e.target.closest('#hl-remove-btn') ||
    e.target.closest('[id$="Modal"]')
  )) return;

  // Small delay so browser finalises the selection
  setTimeout(function() {
    if (!window.activeHlType) return;

    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    var range = sel.getRangeAt(0);

    // Must be inside an editor area
    var anchor = range.commonAncestorContainer;
    var node   = anchor.nodeType === 1 ? anchor : anchor.parentElement;
    var editorEl = node ? node.closest('.section-editor, #editor') : null;
    if (!editorEl) return;

    _applyHighlight(range, window.activeHlType);

    // Sync content back
    editorEl.dispatchEvent(new Event('input', { bubbles: true }));

    // Clear selection
    sel.removeAllRanges();

    // Deactivate highlighter
    window.activeHlType = null;
    _updateButtonStates();
    document.body.style.cursor = '';

    if (typeof triggerAutosave === 'function') triggerAutosave();
    setTimeout(function() { updateHL(); initGroupHighlightsFromHTML(); }, 80);
  }, 10);
});

// ── Core span wrapper ─────────────────────────────────────────
function _applyHighlight(range, catKey) {
  var cat = (window.HL_CAT_MAP || {})[catKey];
  if (!cat) return;

  var span = document.createElement('span');
  span.className = cat.spanClass;
  span.setAttribute('data-hl-cat', catKey);

  try {
    range.surroundContents(span);
  } catch(e) {
    try {
      var frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    } catch(e2) {
      console.warn('highlights.js: could not apply highlight', e2);
    }
  }
}

// ── Right-click remove ────────────────────────────────────────
(function() {
  var removeBtn = document.createElement('button');
  removeBtn.id = 'hl-remove-btn';
  removeBtn.textContent = '✕ Remove Highlight';
  removeBtn.style.cssText = [
    'display:none',
    'position:fixed',
    'z-index:9500',
    'background:#2a1f2e',
    'border:1px solid rgba(255,100,100,0.45)',
    'color:#ff9090',
    'font-size:11px',
    'font-family:sans-serif',
    'padding:5px 12px',
    'border-radius:6px',
    'cursor:pointer',
    'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    'white-space:nowrap'
  ].join(';');
  document.body.appendChild(removeBtn);

  var _hlTarget = null;

  document.addEventListener('contextmenu', function(e) {
    var span = e.target.closest && e.target.closest('[data-hl-cat]');
    if (!span) { removeBtn.style.display = 'none'; return; }
    e.preventDefault();
    _hlTarget = span;
    removeBtn.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    removeBtn.style.top  = Math.max(0, e.clientY - 40) + 'px';
    removeBtn.style.display = 'block';
  });

  removeBtn.addEventListener('click', function() {
    if (!_hlTarget) return;
    var p = _hlTarget.parentNode;
    while (_hlTarget.firstChild) p.insertBefore(_hlTarget.firstChild, _hlTarget);
    p.removeChild(_hlTarget);
    _hlTarget = null;
    removeBtn.style.display = 'none';
    if (typeof triggerAutosave === 'function') triggerAutosave();
    setTimeout(function() { updateHL(); initGroupHighlightsFromHTML(); }, 80);
  });

  document.addEventListener('mousedown', function(e) {
    if (e.target !== removeBtn) removeBtn.style.display = 'none';
  });
})();

// ── Update right-panel highlight cards ───────────────────────
window.updateHL = function updateHL() {
  if (!window.HL_CATEGORIES) return;

  window.HL_CATEGORIES.forEach(function(cat) {
    var listEl = document.getElementById('hl-list-' + cat.key);
    if (!listEl) return;

    var spans = Array.from(document.querySelectorAll(
      '.section-editor [data-hl-cat="' + cat.key + '"], #editor [data-hl-cat="' + cat.key + '"]'
    ));

    if (spans.length === 0) {
      listEl.innerHTML = '<div class="hl-empty">No ' + _esc(cat.label) + ' highlights yet</div>';
      return;
    }

    listEl.innerHTML = '';
    spans.forEach(function(span) {
      var card = document.createElement('div');
      card.className = 'hl-card hl-card-clickable';
      card.style.borderLeft = '3px solid ' + cat.color;
      card.style.background = 'rgba(' + _hexRgb(cat.color) + ',0.08)';

      var badge = document.createElement('div');
      badge.className = 'hl-card-badge';
      badge.style.background = cat.color;
      badge.style.color = '#000';
      badge.textContent = cat.label;

      var text = document.createElement('div');
      text.className = 'hl-card-text';
      text.textContent = span.textContent;

      card.appendChild(badge);
      card.appendChild(text);
      card.addEventListener('click', function() {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        span.classList.add('hl-pulse');
        setTimeout(function() { span.classList.remove('hl-pulse'); }, 1000);
      });
      listEl.appendChild(card);
    });
  });

  _renderNotes();
};

// ── Group hover glow ──────────────────────────────────────────
document.addEventListener('mouseover', function(e) {
  var span = e.target.closest && e.target.closest('[data-group]');
  if (!span) return;
  var g = span.getAttribute('data-group');
  if (!g) return;
  try {
    document.querySelectorAll('[data-group="' + CSS.escape(g) + '"]').forEach(function(el) { el.classList.add('hl-group-glow'); });
  } catch(_) {}
});

document.addEventListener('mouseout', function(e) {
  var span = e.target.closest && e.target.closest('[data-group]');
  if (!span) return;
  var g = span.getAttribute('data-group');
  if (!g) return;
  try {
    document.querySelectorAll('[data-group="' + CSS.escape(g) + '"]').forEach(function(el) { el.classList.remove('hl-group-glow'); });
  } catch(_) {}
});

// Shift+click pulses whole group
document.addEventListener('click', function(e) {
  if (!e.shiftKey) return;
  var span = e.target.closest && e.target.closest('[data-group]');
  if (!span) return;
  var g = span.getAttribute('data-group');
  if (!g) return;
  try {
    document.querySelectorAll('[data-group="' + CSS.escape(g) + '"]').forEach(function(el) {
      el.classList.add('hl-pulse');
      setTimeout(function() { el.classList.remove('hl-pulse'); }, 1000);
    });
  } catch(_) {}
  e.preventDefault();
});

// ── Init from pre-loaded HTML ─────────────────────────────────
window.initGroupHighlightsFromHTML = function() {
  // Re-stamp span classes from data-hl-cat
  document.querySelectorAll('[data-hl-cat]').forEach(function(span) {
    var catKey = span.getAttribute('data-hl-cat');
    var cat    = (window.HL_CAT_MAP || {})[catKey];
    if (!cat) return;
    if (!span.classList.contains(cat.spanClass)) {
      Array.from(span.classList).forEach(function(c) { if (c.startsWith('hl-span-')) span.classList.remove(c); });
      span.classList.add(cat.spanClass);
    }
  });
  updateHL();
  _renderNotes();
};

// ── Notes panel ───────────────────────────────────────────────
function _renderNotes() {
  var notesList = document.getElementById('notes-list');
  if (!notesList) return;

  var groupMap = {};
  document.querySelectorAll('[data-group]').forEach(function(span) {
    if (span.getAttribute('data-make-note') === 'false') return;
    var g = span.getAttribute('data-group');
    if (!g) return;
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(span);
  });

  var noteGroups    = Object.entries(groupMap).filter(function(e) { return e[1].length >= 2; });
  var standaloneNotes = Array.from(document.querySelectorAll('[data-hl-cat="note"]:not([data-group])'));

  if (noteGroups.length === 0 && standaloneNotes.length === 0) {
    notesList.innerHTML = '<div class="hl-empty">No notes yet — groups with 2+ highlights auto-appear here</div>';
    return;
  }

  notesList.innerHTML = '';

  noteGroups.forEach(function(entry) {
    var groupName = entry[0], spans = entry[1];
    var card = document.createElement('div');
    card.className = 'note-card';
    card.style.cursor = 'pointer';

    var title = document.createElement('div');
    title.className = 'note-tag';
    title.textContent = '✦ ' + groupName.replace(/-/g, ' ');
    card.appendChild(title);

    spans.forEach(function(span) {
      var catKey = span.getAttribute('data-hl-cat');
      var cat    = (window.HL_CAT_MAP || {})[catKey];
      var line   = document.createElement('p');
      if (cat) {
        line.innerHTML = '<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700;background:' + cat.color + ';color:#000;margin-right:4px;">' + _esc(cat.label) + '</span> ' + _esc(span.textContent);
      } else {
        line.textContent = span.textContent;
      }
      card.appendChild(line);
    });

    card.addEventListener('click', function() {
      spans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      spans[0].classList.add('hl-pulse');
      setTimeout(function() { spans[0].classList.remove('hl-pulse'); }, 1000);
    });
    notesList.appendChild(card);
  });

  standaloneNotes.forEach(function(span) {
    var card = document.createElement('div');
    card.className = 'note-card';
    card.style.cursor = 'pointer';
    var p = document.createElement('p');
    p.textContent = span.textContent;
    card.appendChild(p);
    card.addEventListener('click', function() {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.classList.add('hl-pulse');
      setTimeout(function() { span.classList.remove('hl-pulse'); }, 1000);
    });
    notesList.appendChild(card);
  });
}

// ── Highlights full page ──────────────────────────────────────
window.openHighlightsPage = function() {
  var page = document.getElementById('highlightsPage');
  if (!page) return;
  page.style.display = 'block';
  _populateBookSelect();
  renderHighlightsPage();
};

window.closeHighlightsPage = function() {
  var page = document.getElementById('highlightsPage');
  if (page) page.style.display = 'none';
};

function _populateBookSelect() {
  var sel = document.getElementById('hlPageBookSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="__all__">All Books</option>';
  if (window.allBooks) {
    window.allBooks.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      sel.appendChild(opt);
    });
  }
}

window.renderHighlightsPage = function() {
  var container = document.getElementById('hlPageAllContent');
  if (!container || !window.HL_CATEGORIES) return;
  container.innerHTML = '';

  window.HL_CATEGORIES.forEach(function(cat) {
    var spans = Array.from(document.querySelectorAll(
      '.section-editor [data-hl-cat="' + cat.key + '"], #editor [data-hl-cat="' + cat.key + '"]'
    ));
    if (spans.length === 0) return;

    var section = document.createElement('div');
    section.style.marginBottom = '2rem';

    var heading = document.createElement('div');
    heading.style.cssText = 'font-family:sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:' + cat.color + ';margin-bottom:8px;';
    heading.textContent = '✦ ' + cat.label;
    section.appendChild(heading);

    spans.forEach(function(span) {
      var card = document.createElement('div');
      card.className = 'hl-card hl-card-clickable';
      card.style.cssText = 'border-left:3px solid ' + cat.color + ';margin-bottom:6px;';
      var t = document.createElement('div');
      t.className = 'hl-card-text'; t.textContent = span.textContent;
      card.appendChild(t);
      card.addEventListener('click', function() {
        window.closeHighlightsPage();
        setTimeout(function() {
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          span.classList.add('hl-pulse');
          setTimeout(function() { span.classList.remove('hl-pulse'); }, 1000);
        }, 300);
      });
      section.appendChild(card);
    });

    container.appendChild(section);
  });

  if (!container.children.length) {
    container.innerHTML = '<div style="font-size:13px;color:#887fa0;font-style:italic;padding:2rem 0;">No highlights yet.</div>';
  }
};

// ── Helpers ───────────────────────────────────────────────────
function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _hexRgb(hex) {
  var h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(function(x){return x+x;}).join('');
  return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
}