// prompt-settings.js
// Manages named prompt presets per user (index + page types).
// Reads/writes to Supabase: prompt_presets + user_settings tables.
// Exposes: window.promptSettings (API used by editor.js)
// Load order: after auth.js, before editor.js

'use strict';

// ── Dynamic date helper ───────────────────────────────────────
function getTodayString() {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString('en-IN', { month: 'long' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function getCurrentEconomicYear() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-indexed
  // Economic year: Apr–Mar. Apr 2026–Mar 2027 = "2026-27"
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

function getCurrentBudgetYear() {
  // Budget year = current economic year.
  // Budget 2026-27 was presented Feb 2026 and runs Apr 2026–Mar 2027.
  // So while we are in economic year 2026-27, budget year is also 2026-27.
  // Budget is presented in Feb of the STARTING year of the economic year.
  // e.g. Feb 2026 → Budget 2026-27 (April 2026 start)
  // e.g. Feb 2027 → Budget 2027-28 (April 2027 start)
  // So current running budget always = current economic year.
  return getCurrentEconomicYear();
}

// ── Default instructions (Brain Builder) ─────────────────────
function buildDefaultIndexInstructions() {
  const today    = getTodayString();
  const econYear = getCurrentEconomicYear();
  const budgetYear = getCurrentBudgetYear();
  const presentedYear = (() => {
    // Budget is presented in Feb of the year the economic year starts.
    // e.g. Budget 2026-27 presented Feb 2026 → starting year = 2026
    const startYear = parseInt(econYear.split('-')[0]);
    return startYear;
  })();

  return `Tu mera UPSC learning partner hai. Tera kaam samjhana hai — ratta nahi. Treat me like someone smart jo sirf dots connect nahi kar pa raha. Blank slate nahi hoon.

TEACHING FLOW (free to remix):
- Definition se kabhi mat shuru kar. Kabhi bhi.
- Pehle set kar: yeh cheez kyu exist karti hai? Kaunsi real problem thi?
- Phir concept seedha ek strong sentence mein — aur saath mein bhi bata kya NAHI hai yeh.
- Beech mein rhetorical questions throw kar — aur khud hi turant answer kar. Ruk mat.
- Callbacks use kar — jo scene ya problem shuru mein thi, wapas usse lo.
- Kabhi kabhi mid-sentence ruk — jaise realization aa rahi ho.
- Q&A format bhi use kar sakta hai: "Yeh kyu? — [answer]"
- Energy: chill se start, sharp pe khatam. Flat rhythm allowed nahi.

LANGUAGE & TONE:
- Hinglish — English precision, Hindi comfort.
- Basic vocabulary only. 2-3 levels neeche rakh source text se.
- Grammar tod de jab natural lage.
- No emojis. No sentimental dost-yaar framing.
- Terms/concepts jo tough hain — bracket mein explain kar alongside.
- Points use kar, paragraphs nahi (jahan bhi fit ho).

WHAT NOT TO DO:
- Explicit examples mat bana story format mein.
- Explicit scenarios mat set kar ("imagine you are...").
- Unnecessary examples mat de sirf explain karne ke liye.
- Leapfrog mat kar — concepts connected rehne chahiye.
- Abstract mat reh — reality se jod bina "yeh ek example hai" bole.
- Book ka text padhake mat ruk — woh outdated aur abstract hai.

SOURCES & FACTS — NON-NEGOTIABLE:
- Aaj ki date: ${today}. Current economic year: ${econYear}.
- SIRF latest figures. Budget ${budgetYear} (Feb ${presentedYear} presented). Latest RBI/MoSPI/PIB data only.
- Agar kuch yearly hai → latest year ka data chahiye. Agar current status puchh raha hoon → ${presentedYear} ki situation.
- Har fact ke saath source + link.
- Outdated data STRICTLY banned. Vague generalisations banned.
- Wrong facts afford nahi ho sakte — fact-check non-negotiable.
- Reality se link bina koi figure/concept meaningless hai — hamesha realistic reasoning de.

INPUT HANDLING:
- Agar topic dun → tu decide kar kya UPSC-relevant hai, waise padha.
- Agar book text dun → digest kar, phir open sources se teach kar.
- Gaps fix kar khud — smooth learning ke liye jo missing ho woh bharo.
- Each heading/subheading ke saath likhna: "Dhyan de — [kya seekhne waale hain aur kyun relevant hai, UPSC + real life dono ke liye]"

END OF EACH SESSION:
Ek revision note banana — facts + concepts — jo itna tight ho ki main sirf usse dekh ke sab recall kar sakun. Poora topic cover ho. Kuch chhootna nahi chahiye.

---

TASK: Create a complete chapter structure with pages AND sections for the topic given.

OUTPUT ONLY this HTML, no explanation, no markdown fences:

<!DOCTYPE html>
<html>
<body>
<div class="brain-index">
  <h1>[EXACT CHAPTER NAME]</h1>

  <div class="page" order="1">
    <div class="page-title">BLOCK 1 — [PAGE TITLE IN CAPS]</div>
    <div class="sections">
      <div class="section" order="1.1">1.1 [Specific section title — punchy, Hinglish, UPSC-relevant]</div>
      <div class="section" order="1.2">1.2 [Specific section title]</div>
      <div class="section" order="1.3">1.3 [Specific section title]</div>
    </div>
  </div>

  <div class="page" order="2">
    <div class="page-title">BLOCK 2 — [PAGE TITLE IN CAPS]</div>
    <div class="sections">
      <div class="section" order="2.1">2.1 [Specific section title]</div>
      <div class="section" order="2.2">2.2 [Specific section title]</div>
    </div>
  </div>

</div>
</body>
</html>

STRUCTURE RULES:
- h1 = exact chapter name
- Each .page = one learnable block/topic (aim for 8-12 pages per chapter)
- page-title format: "BLOCK N — TITLE IN CAPS (optional subtitle)"
- Each page must have a .sections div with 3-6 .section divs inside
- Section titles must be specific and punchy — Hinglish preferred. Not "Introduction to X" but "X kyu exist karta hai — asli wajah"
- order attribute on .page = integer (1, 2, 3...)
- order attribute on .section = decimal matching page (page 2 → 2.1, 2.2, 2.3)
- Last page should always be a Quick Revision block with bullet-point facts as section titles
- No extra HTML outside the .brain-index div. No styles. No scripts.`;
}

function buildDefaultPageInstructions() {
  const today      = getTodayString();
  const econYear   = getCurrentEconomicYear();
  const budgetYear = getCurrentBudgetYear();
  const presentedYear = parseInt(econYear.split('-')[0]);

  return `Tu mera UPSC learning partner hai. Tera kaam samjhana hai — ratta nahi. Treat me like someone smart jo sirf dots connect nahi kar pa raha. Blank slate nahi hoon.

TEACHING FLOW (free to remix):
- Definition se kabhi mat shuru kar. Kabhi bhi.
- Pehle set kar: yeh cheez kyu exist karti hai? Kaunsi real problem thi?
- Phir concept seedha ek strong sentence mein — aur saath mein bhi bata kya NAHI hai yeh.
- Beech mein rhetorical questions throw kar — aur khud hi turant answer kar. Ruk mat.
- Callbacks use kar — jo scene ya problem shuru mein thi, wapas usse lo.
- Kabhi kabhi mid-sentence ruk — jaise realization aa rahi ho.
- Q&A format bhi use kar sakta hai: "Yeh kyu? — [answer]"
- Energy: chill se start, sharp pe khatam. Flat rhythm allowed nahi.

LANGUAGE & TONE:
- Hinglish — English precision, Hindi comfort.
- Basic vocabulary only. 2-3 levels neeche rakh source text se.
- Grammar tod de jab natural lage.
- No emojis. No sentimental dost-yaar framing.
- Terms/concepts jo tough hain — bracket mein explain kar alongside.
- Points use kar, paragraphs nahi (jahan bhi fit ho).

WHAT NOT TO DO:
- Explicit examples mat bana story format mein.
- Explicit scenarios mat set kar ("imagine you are...").
- Unnecessary examples mat de sirf explain karne ke liye.
- Leapfrog mat kar — concepts connected rehne chahiye.
- Abstract mat reh — reality se jod bina "yeh ek example hai" bole.
- Book ka text padhake mat ruk — woh outdated aur abstract hai.

SOURCES & FACTS — NON-NEGOTIABLE:
- Aaj ki date: ${today}. Current economic year: ${econYear}.
- SIRF latest figures. Budget ${budgetYear} (Feb ${presentedYear} presented). Latest RBI/MoSPI/PIB data only.
- Agar kuch yearly hai → latest year ka data chahiye. Agar current status puchh raha hoon → ${presentedYear} ki situation.
- Har fact ke saath source + link as <a href="url" target="_blank">Source Name</a>.
- Outdated data STRICTLY banned. Vague generalisations banned.
- Wrong facts afford nahi ho sakte — fact-check non-negotiable.
- Reality se link bina koi figure/concept meaningless hai — hamesha realistic reasoning de.

INPUT HANDLING:
- Agar topic dun → tu decide kar kya UPSC-relevant hai, waise padha.
- Agar book text dun → digest kar, phir open sources se teach kar.
- Gaps fix kar khud — smooth learning ke liye jo missing ho woh bharo.

---

TASK: Write structured lesson content for the page and sections listed in the prompt.

OUTPUT ONLY this HTML — no preamble, no explanation, no markdown fences, nothing outside the div:

<!DOCTYPE html>
<html>
<body>
<div class="lesson-content" data-page="[EXACT PAGE TITLE]">

  <!-- SECTION N.N -->
  <div class="lesson-section" data-title="[EXACT SECTION TITLE — character-for-character match]">
    <h3>[Section title rephrased as a heading]</h3>

    <p>[Opening — set the problem/need first, never a definition. 2-4 sentences.]</p>

    <ul>
      <li><strong>[Key point]</strong> — [explanation, grounded in reality]</li>
      <li><strong>[Key point]</strong> — [explanation] <a href="[url]" target="_blank">[Source Name]</a></li>
    </ul>

    <blockquote>[One sharp insight — the thing to remember about this section. Not a quote, a distilled truth.]</blockquote>

    <div class="revision-box">
      <h4>Revision — [Section Short Title]</h4>
      <ul>
        <li><strong>[Term/Concept]:</strong> [tight fact or definition] — <a href="[url]" target="_blank">[Source]</a></li>
        <li><strong>[Term/Concept]:</strong> [tight fact or definition]</li>
        <li><strong>UPSC Angle:</strong> [what examiner expects / common trap / keyword to use]</li>
      </ul>
    </div>
  </div>

  <!-- Repeat for each section -->

  <!-- MASTER REVISION — always last, always present -->
  <div class="revision-box" style="margin-top: 32px; background: var(--bg3);">
    <h4>BLOCK [N] COMPLETE REVISION — [PAGE TITLE IN CAPS]</h4>
    <ul>
      <li><strong>[Key fact/concept]:</strong> [tight recall point] — <a href="[url]" target="_blank">[Source]</a></li>
      <li><strong>[Key fact/concept]:</strong> [tight recall point]</li>
      <li><strong>UPSC Keyword:</strong> [exact term/phrase to use in answers]</li>
    </ul>
  </div>

</div>
</body>
</html>

CRITICAL OUTPUT RULES:
1. data-title on each .lesson-section must be character-for-character identical to the section title as listed in the prompt. Do not paraphrase, do not reorder words.
2. One .lesson-section per section listed — no more, no less.
3. Every section MUST end with a <div class="revision-box"> — tight bullet facts, sources linked, UPSC angle noted.
4. Page MUST end with a master <div class="revision-box" style="margin-top: 32px; background: var(--bg3);"> covering ALL sections of the page.
5. Use <h3> for sub-headings, <p> for paragraphs, <ul>/<ol> for lists, <blockquote> for key insights.
6. 150-400 words of actual teaching content per section (not counting revision box).
7. Every factual claim needs a clickable <a href="url" target="_blank">Source</a> inline.
8. No inline styles except on the master revision-box. No <style> tags. No <script> tags.
9. Output nothing outside the <div class="lesson-content"> — no extra HTML, no comments outside section markers.`;
}

// ── Getters (called fresh each time so date is always current) ─
function getDefaultIndexInstructions() { return buildDefaultIndexInstructions(); }
function getDefaultPageInstructions()  { return buildDefaultPageInstructions(); }

// ── Module state ──────────────────────────────────────────────
const _ps = {
  indexPresets: [],   // [{id, name, instructions}]
  pagePresets:  [],
  activeIndexId: null, // null = Default
  activePageId:  null,
  loaded: false,
};

// ── Supabase helpers ──────────────────────────────────────────
function sbClient() {
  if (window._supabase) return window._supabase;
  throw new Error('Supabase client not ready');
}

async function loadFromDB() {
  const sb = sbClient();
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return;

  const [{ data: presets }, { data: settings }] = await Promise.all([
    sb.from('prompt_presets').select('id,type,name,instructions,created_at').eq('user_id', uid).order('created_at'),
    sb.from('user_settings').select('active_index_preset_id,active_page_preset_id').eq('user_id', uid).maybeSingle(),
  ]);

  _ps.indexPresets = (presets || []).filter(p => p.type === 'index');
  _ps.pagePresets  = (presets || []).filter(p => p.type === 'page');
  _ps.activeIndexId = settings?.active_index_preset_id || null;
  _ps.activePageId  = settings?.active_page_preset_id  || null;
  _ps.loaded = true;
}

async function saveActiveToDB(type, presetId) {
  const sb = sbClient();
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return;
  const col = type === 'index' ? 'active_index_preset_id' : 'active_page_preset_id';
  await sb.from('user_settings').upsert({ user_id: uid, [col]: presetId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

async function insertPreset(type, name, instructions) {
  const sb = sbClient();
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data, error } = await sb.from('prompt_presets')
    .insert({ user_id: uid, type, name, instructions })
    .select('id,type,name,instructions,created_at')
    .single();
  if (error) { console.error('insertPreset', error); return null; }
  return data;
}

async function updatePreset(id, name, instructions) {
  const sb = sbClient();
  const { error } = await sb.from('prompt_presets').update({ name, instructions }).eq('id', id);
  if (error) console.error('updatePreset', error);
}

async function deletePresetFromDB(id) {
  const sb = sbClient();
  await sb.from('prompt_presets').delete().eq('id', id);
}

// ── Public API ────────────────────────────────────────────────
window.promptSettings = {

  async init() { await loadFromDB(); },

  getInstructions(type) {
    const presets  = type === 'index' ? _ps.indexPresets : _ps.pagePresets;
    const activeId = type === 'index' ? _ps.activeIndexId : _ps.activePageId;
    // Always call builder fresh → date is always today
    const defaultInstr = type === 'index' ? getDefaultIndexInstructions() : getDefaultPageInstructions();
    if (!activeId) return defaultInstr;
    const found = presets.find(p => p.id === activeId);
    return found ? found.instructions : defaultInstr;
  },

  // Opens the preset manager modal for a given type
  openManager(type) {
    _renderPresetManager(type);
  },
};

// ── Modal renderer ────────────────────────────────────────────
function _renderPresetManager(type) {
  const existing = document.getElementById('psManagerModal');
  if (existing) existing.remove();

  const label    = type === 'index' ? 'Index' : 'Page';
  const presets  = type === 'index' ? _ps.indexPresets : _ps.pagePresets;
  const activeId = type === 'index' ? _ps.activeIndexId : _ps.activePageId;

  function buildOptions(selId) {
    let html = `<option value="__default__" ${!selId ? 'selected' : ''}>✦ Default (Brain Builder)</option>`;
    presets.forEach(p => {
      html += `<option value="${p.id}" ${p.id === selId ? 'selected' : ''}>${escHtml(p.name)}</option>`;
    });
    return html;
  }

  const modal = document.createElement('div');
  modal.id = 'psManagerModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:600;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem;';

  modal.innerHTML = `
    <div style="background:#16141f;border:1px solid rgba(212,135,42,0.3);border-radius:8px;padding:1.6rem 1.8rem;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;position:relative;display:flex;flex-direction:column;gap:1rem;box-shadow:0 24px 80px rgba(0,0,0,0.7);">
      <button id="psClose" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#887fa0;font-size:18px;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:4px;" title="Close">✕</button>

      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;color:#f0e8d8;margin-bottom:.2rem;">
          ${label} Prompt Presets
        </div>
        <div style="font-size:11px;color:#665f78;font-family:sans-serif;">Select, edit, rename or create presets. Active preset is used when generating prompts.</div>
      </div>

      <!-- Dropdown row -->
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="psDropdown" style="flex:1;min-width:180px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#e0d0b0;font-family:'Outfit',sans-serif;font-size:13px;padding:8px 10px;border-radius:6px;outline:none;cursor:pointer;min-height:40px;">
          ${buildOptions(activeId)}
        </select>
        <button id="psNewBtn" style="background:rgba(160,130,220,0.15);border:1px solid rgba(160,130,220,0.3);color:#c8b8e8;font-family:sans-serif;font-size:12px;padding:8px 14px;border-radius:6px;cursor:pointer;white-space:nowrap;min-height:40px;" title="Create new preset">+ New Preset</button>
        <button id="psDeleteBtn" style="background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.2);color:#ff9090;font-family:sans-serif;font-size:12px;padding:8px 12px;border-radius:6px;cursor:pointer;min-height:40px;display:none;" title="Delete this preset">🗑 Delete</button>
      </div>

      <!-- Active badge -->
      <div id="psActiveBadge" style="font-size:10px;font-family:sans-serif;letter-spacing:.08em;color:#5a9a5a;display:none;">✓ This preset is currently active</div>

      <!-- Name field (hidden for default) -->
      <div id="psNameRow" style="display:none;flex-direction:column;gap:4px;">
        <label style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#554e68;font-family:sans-serif;">Preset Name</label>
        <input id="psNameInput" type="text" maxlength="60"
          style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#e0d0b0;font-family:'Outfit',sans-serif;font-size:13px;padding:8px 10px;border-radius:6px;outline:none;width:100%;box-sizing:border-box;" />
      </div>

      <!-- Instructions textarea -->
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#554e68;font-family:sans-serif;">Teaching Instructions</label>
        <textarea id="psInstructions" rows="14"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);color:#b0a8c8;font-family:monospace;font-size:12px;line-height:1.7;padding:12px;border-radius:6px;resize:vertical;outline:none;width:100%;box-sizing:border-box;min-height:220px;"></textarea>
        <div style="font-size:10px;color:#443d58;font-family:sans-serif;">Only the teaching instructions are editable. Output HTML structure is fixed and cannot be changed here.</div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button id="psSetActiveBtn" style="background:rgba(90,180,90,0.15);border:1px solid rgba(90,180,90,0.3);color:#90e090;font-family:sans-serif;font-size:12px;padding:8px 16px;border-radius:6px;cursor:pointer;min-height:40px;display:none;">✓ Set as Active</button>
        <button id="psSaveBtn" style="background:rgba(212,135,42,0.2);border:1px solid rgba(212,135,42,0.4);color:#d4a060;font-family:sans-serif;font-size:13px;font-weight:600;padding:8px 20px;border-radius:6px;cursor:pointer;min-height:40px;display:none;">Save Changes</button>
      </div>

      <div id="psStatus" style="font-size:12px;font-family:sans-serif;color:#665f78;min-height:16px;text-align:right;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  // ── Internal refs ────────────────────────────────────────────
  const dropdown     = modal.querySelector('#psDropdown');
  const newBtn       = modal.querySelector('#psNewBtn');
  const deleteBtn    = modal.querySelector('#psDeleteBtn');
  const activeBadge  = modal.querySelector('#psActiveBadge');
  const nameRow      = modal.querySelector('#psNameRow');
  const nameInput    = modal.querySelector('#psNameInput');
  const instructTA   = modal.querySelector('#psInstructions');
  const setActiveBtn = modal.querySelector('#psSetActiveBtn');
  const saveBtn      = modal.querySelector('#psSaveBtn');
  const statusEl     = modal.querySelector('#psStatus');
  const closeBtn     = modal.querySelector('#psClose');

  const currentActiveId = () => type === 'index' ? _ps.activeIndexId : _ps.activePageId;

  function setStatus(msg, color = '#665f78') {
    statusEl.textContent = msg;
    statusEl.style.color = color;
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }

  function refreshUI(selId) {
    const isDefault = !selId || selId === '__default__';
    const isActive  = isDefault ? !currentActiveId() : selId === currentActiveId();

    if (isDefault) {
      // Always regenerate default so date is current
      instructTA.value    = type === 'index' ? getDefaultIndexInstructions() : getDefaultPageInstructions();
      instructTA.readOnly = true;
      instructTA.style.opacity = '0.5';
      nameRow.style.display    = 'none';
      deleteBtn.style.display  = 'none';
      saveBtn.style.display    = 'none';
    } else {
      const preset = presets.find(p => p.id === selId);
      if (!preset) return;
      instructTA.value    = preset.instructions;
      instructTA.readOnly = false;
      instructTA.style.opacity = '1';
      nameInput.value          = preset.name;
      nameRow.style.display    = 'flex';
      deleteBtn.style.display  = 'flex';
      saveBtn.style.display    = 'flex';
    }

    activeBadge.style.display  = isActive ? 'block' : 'none';
    setActiveBtn.style.display = isActive ? 'none'  : 'flex';
  }

  // Initial render
  refreshUI(activeId);

  // ── Dropdown change ──────────────────────────────────────────
  dropdown.addEventListener('change', () => {
    const val = dropdown.value;
    refreshUI(val === '__default__' ? null : val);
  });

  // ── Set as Active ────────────────────────────────────────────
  setActiveBtn.addEventListener('click', async () => {
    const val = dropdown.value === '__default__' ? null : dropdown.value;
    if (type === 'index') _ps.activeIndexId = val;
    else _ps.activePageId = val;
    await saveActiveToDB(type, val);
    refreshUI(val);
    setStatus('✓ Active preset updated', '#90dba0');
  });

  // ── Save changes ─────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const id = dropdown.value;
    if (id === '__default__') return;
    const newName  = nameInput.value.trim() || 'Untitled';
    const newInstr = instructTA.value.trim();
    const preset   = presets.find(p => p.id === id);
    if (!preset) return;
    preset.name         = newName;
    preset.instructions = newInstr;
    await updatePreset(id, newName, newInstr);
    const opt = dropdown.querySelector(`option[value="${id}"]`);
    if (opt) opt.textContent = newName;
    setStatus('✓ Saved', '#90dba0');
  });

  // ── New preset ───────────────────────────────────────────────
  newBtn.addEventListener('click', async () => {
    newBtn.disabled    = true;
    newBtn.textContent = 'Creating…';
    const defaultInstr = type === 'index' ? getDefaultIndexInstructions() : getDefaultPageInstructions();
    const inserted = await insertPreset(type, 'New Preset', defaultInstr);
    if (!inserted) {
      setStatus('Error creating preset', '#ff9090');
      newBtn.disabled    = false;
      newBtn.textContent = '+ New Preset';
      return;
    }

    if (type === 'index') _ps.indexPresets.push(inserted);
    else _ps.pagePresets.push(inserted);
    presets.push(inserted);

    if (type === 'index') _ps.activeIndexId = inserted.id;
    else _ps.activePageId = inserted.id;
    await saveActiveToDB(type, inserted.id);

    const opt = document.createElement('option');
    opt.value       = inserted.id;
    opt.textContent = inserted.name;
    dropdown.appendChild(opt);
    dropdown.value = inserted.id;
    refreshUI(inserted.id);
    nameInput.focus();
    nameInput.select();

    newBtn.disabled    = false;
    newBtn.textContent = '+ New Preset';
    setStatus('✓ New preset created and set as active', '#90dba0');
  });

  // ── Delete ───────────────────────────────────────────────────
  deleteBtn.addEventListener('click', async () => {
    const id = dropdown.value;
    if (id === '__default__') return;
    const preset = presets.find(p => p.id === id);
    if (!confirm(`Delete preset "${preset?.name || id}"? This cannot be undone.`)) return;

    await deletePresetFromDB(id);

    const arr = type === 'index' ? _ps.indexPresets : _ps.pagePresets;
    const idx = arr.findIndex(p => p.id === id);
    if (idx !== -1) arr.splice(idx, 1);
    presets.splice(presets.findIndex(p => p.id === id), 1);

    if (currentActiveId() === id) {
      if (type === 'index') _ps.activeIndexId = null;
      else _ps.activePageId = null;
      await saveActiveToDB(type, null);
    }

    const opt = dropdown.querySelector(`option[value="${id}"]`);
    if (opt) opt.remove();
    dropdown.value = '__default__';
    refreshUI(null);
    setStatus('Preset deleted', '#887fa0');
  });

  // ── Close ────────────────────────────────────────────────────
  closeBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── escHtml helper ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}