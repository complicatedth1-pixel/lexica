// highlight-categories.js
// Defines all highlight categories. Load BEFORE highlights.js and editor.js.
// Also exposes a Category Manager UI for adding/editing/deleting categories at runtime.

'use strict';

// ── Default categories ────────────────────────────────
const _DEFAULT_HL_CATEGORIES = [
  { key: 'per',     label: 'Person',       color: '#fb923c', spanClass: 'hl-span-per'     },
  { key: 'org',     label: 'Organisation', color: '#22d3ee', spanClass: 'hl-span-org'     },
  { key: 'place',   label: 'Place',        color: '#4ade80', spanClass: 'hl-span-place'   },
  { key: 'date',    label: 'Date',         color: '#ffe566', spanClass: 'hl-span-date'    },
  { key: 'event',   label: 'Event',        color: '#c084fc', spanClass: 'hl-span-event'   },
  { key: 'why',     label: 'Cause',        color: '#f87171', spanClass: 'hl-span-why'     },
  { key: 'effect',  label: 'Effect',       color: '#f9a8d4', spanClass: 'hl-span-effect'  },
  { key: 'concept', label: 'Concept',      color: '#60a5fa', spanClass: 'hl-span-concept' },
  { key: 'law',     label: 'Law/Policy',   color: '#fbbf24', spanClass: 'hl-span-law'     },
  { key: 'data',    label: 'Data/Stat',    color: '#a3e635', spanClass: 'hl-span-data'    },
  { key: 'note',    label: 'Note',         color: '#e879f9', spanClass: 'hl-span-note'    },
];

// ── Load from localStorage (user customisations) ──────
function _loadCategories() {
  try {
    const stored = localStorage.getItem('lexica-hl-categories');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(_DEFAULT_HL_CATEGORIES));
}

function _saveCategories(cats) {
  try { localStorage.setItem('lexica-hl-categories', JSON.stringify(cats)); } catch(e) {}
}

// ── Expose globals ────────────────────────────────────
window.HL_CATEGORIES = _loadCategories();

// Rebuild map whenever categories change
function _rebuildMap() {
  window.HL_CAT_MAP = {};
  window.HL_CATEGORIES.forEach(c => { window.HL_CAT_MAP[c.key] = c; });
}
_rebuildMap();

// ── Inject dynamic CSS for custom span classes ────────
function _injectCategoryCSS() {
  let existing = document.getElementById('hl-dynamic-css');
  if (!existing) {
    existing = document.createElement('style');
    existing.id = 'hl-dynamic-css';
    document.head.appendChild(existing);
  }
  const rules = window.HL_CATEGORIES.map(c => {
    const rgb = _hexToRgba(c.color, 0.55);
    return `.${c.spanClass} { background: ${rgb}; border-radius: 2px; }`;
  }).join('\n');
  existing.textContent = rules;
}

function _hexToRgba(hex, alpha) {
  let h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(x=>x+x).join('');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Apply changes and re-render everything ────────────
function applyCategories(cats) {
  window.HL_CATEGORIES = cats;
  _saveCategories(cats);
  _rebuildMap();
  _injectCategoryCSS();
  // Re-inject toolbar buttons and right panel if editor is open
  if (typeof window._injectHLButtons === 'function') window._injectHLButtons();
  if (typeof window._injectRightPanelCategories === 'function') window._injectRightPanelCategories();
  if (typeof updateHL === 'function') updateHL();
}

// ── Reset to defaults ─────────────────────────────────
function resetCategoriesToDefault() {
  applyCategories(JSON.parse(JSON.stringify(_DEFAULT_HL_CATEGORIES)));
}

// ── Category Manager Modal ────────────────────────────
function openCategoryManager() {
  const existing = document.getElementById('hlCatManagerModal');
  if (existing) existing.remove();

  const cats = JSON.parse(JSON.stringify(window.HL_CATEGORIES)); // working copy

  const modal = document.createElement('div');
  modal.id = 'hlCatManagerModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';

  function renderModal() {
    modal.innerHTML = `
      <div style="background:#16141f;border:1px solid rgba(212,135,42,0.3);border-radius:8px;padding:1.6rem 1.8rem;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.7);">
        <button id="hlCatClose" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#887fa0;font-size:18px;cursor:pointer;width:32px;height:32px;border-radius:4px;">✕</button>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#f0e8d8;margin-bottom:.3rem;">Highlight Categories</div>
        <div style="font-size:11px;color:#665f78;font-family:sans-serif;margin-bottom:1.2rem;">Add, rename, recolor, or remove categories. Changes apply immediately.</div>

        <div id="hlCatList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:1rem;">
          ${cats.map((cat, i) => `
            <div class="hlcat-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:7px 10px;">
              <input type="color" class="hlcat-color" value="${cat.color}" data-idx="${i}" style="width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;background:none;padding:0;flex-shrink:0;" title="Color">
              <input type="text" class="hlcat-label" value="${escHtml(cat.label)}" data-idx="${i}" placeholder="Label" maxlength="20" style="flex:1;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.1);color:#c0b8d0;font-family:sans-serif;font-size:13px;outline:none;padding:2px 4px;" />
              <input type="text" class="hlcat-key" value="${escHtml(cat.key)}" data-idx="${i}" placeholder="key" maxlength="12" style="width:80px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);color:#887fa0;font-family:monospace;font-size:11px;outline:none;padding:3px 6px;border-radius:4px;" title="Unique key (no spaces)" />
              <button class="hlcat-del" data-idx="${i}" style="background:none;border:none;color:#554e68;cursor:pointer;font-size:14px;width:26px;height:26px;border-radius:3px;flex-shrink:0;" title="Delete">✕</button>
            </div>
          `).join('')}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;">
          <button id="hlCatAdd" style="background:rgba(160,130,220,0.15);border:1px solid rgba(160,130,220,0.3);color:#c8b8e8;font-family:sans-serif;font-size:12px;padding:7px 14px;border-radius:6px;cursor:pointer;min-height:38px;">+ Add Category</button>
          <div style="display:flex;gap:8px;">
            <button id="hlCatReset" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#665f78;font-family:sans-serif;font-size:12px;padding:7px 12px;border-radius:6px;cursor:pointer;min-height:38px;">Reset Defaults</button>
            <button id="hlCatSave" style="background:rgba(212,135,42,0.2);border:1px solid rgba(212,135,42,0.4);color:#d4a060;font-family:sans-serif;font-size:13px;font-weight:600;padding:7px 20px;border-radius:6px;cursor:pointer;min-height:38px;">Save</button>
          </div>
        </div>
        <div id="hlCatStatus" style="font-size:11px;font-family:sans-serif;color:#665f78;margin-top:8px;min-height:16px;"></div>
      </div>
    `;

    // Wire events
    modal.querySelector('#hlCatClose').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('.hlcat-color').forEach(el => {
      el.addEventListener('input', function() { cats[+this.dataset.idx].color = this.value; });
    });
    modal.querySelectorAll('.hlcat-label').forEach(el => {
      el.addEventListener('input', function() { cats[+this.dataset.idx].label = this.value.trim(); });
    });
    modal.querySelectorAll('.hlcat-key').forEach(el => {
      el.addEventListener('input', function() {
        const clean = this.value.replace(/\s+/g,'').toLowerCase();
        this.value = clean;
        cats[+this.dataset.idx].key = clean;
        cats[+this.dataset.idx].spanClass = 'hl-span-' + clean;
      });
    });
    modal.querySelectorAll('.hlcat-del').forEach(el => {
      el.addEventListener('click', function() {
        const i = +this.dataset.idx;
        cats.splice(i, 1);
        renderModal();
      });
    });

    modal.querySelector('#hlCatAdd').onclick = () => {
      cats.push({ key: 'cat' + Date.now().toString(36), label: 'New', color: '#aaaaaa', spanClass: 'hl-span-custom' });
      renderModal();
      // Scroll to bottom
      setTimeout(() => {
        const list = modal.querySelector('#hlCatList');
        if (list) list.scrollTop = list.scrollHeight;
      }, 50);
    };

    modal.querySelector('#hlCatReset').onclick = () => {
      if (!confirm('Reset all categories to defaults? Custom categories will be lost.')) return;
      modal.remove();
      resetCategoriesToDefault();
      openCategoryManager();
    };

    modal.querySelector('#hlCatSave').onclick = () => {
      // Validate: all keys unique and non-empty
      const keys = cats.map(c => c.key);
      const hasEmpty = keys.some(k => !k);
      const hasDupe = keys.length !== new Set(keys).size;
      const statusEl = modal.querySelector('#hlCatStatus');
      if (hasEmpty) { statusEl.textContent = '❌ All categories need a key'; statusEl.style.color = '#ff9090'; return; }
      if (hasDupe) { statusEl.textContent = '❌ Keys must be unique'; statusEl.style.color = '#ff9090'; return; }
      // Ensure spanClass is set
      cats.forEach(c => { c.spanClass = 'hl-span-' + c.key; });
      applyCategories(cats);
      statusEl.textContent = '✓ Saved'; statusEl.style.color = '#90dba0';
      setTimeout(() => modal.remove(), 800);
    };
  }

  renderModal();
  document.body.appendChild(modal);
}

// Helper (may not be defined yet when this file loads — safe fallback)
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Run CSS injection on load
_injectCategoryCSS();

// Expose
window.openCategoryManager = openCategoryManager;
window.applyCategories = applyCategories;
window.resetCategoriesToDefault = resetCategoriesToDefault;