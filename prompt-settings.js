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
  const month = d.getMonth() + 1;
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

function getCurrentBudgetYear() {
  return getCurrentEconomicYear();
}

// ── Default instructions (Brain Builder) ─────────────────────
function buildDefaultIndexInstructions() {
  const today    = getTodayString();
  const econYear = getCurrentEconomicYear();
  const budgetYear = getCurrentBudgetYear();
  const presentedYear = (() => {
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

EXPLANATION SCHEMAS — CORE RULE:
Har cheez jo tu explain karta hai — concept ho, insaan ho, institution ho, event ho — uski type pehchan aur usi style mein explain kar. Ek section ke andar ek paragraph mein teen alag cheezein ho sakti hain — teeno ko alag style milna chahiye. Fluid switching, no announcement.

Agar koi cheez kisi bhi schema mein fit nahi hoti — ruk, soch: "is cheez ko samajhne ke liye kya format sabse zyada kaam karega?" Woh format use kar. Schema extend karna allowed hai, ignore karna nahi.

SCHEMA 1 — CONCEPT / IDEA:
- Kyu exist karta hai yeh? Kaunsi problem solve karta hai?
- Ek strong sentence mein kya hai — aur kya NAHI hai.
- Situational anchor: reader directly deal kar raha ho isse — woh situation naturally set ho. "Imagine you are" mat bol.
- Example tabhi do jab concept bina uske hawa mein lage.
- PRIOR KNOWLEDGE CHECK (mandatory for every concept): Is concept ko samajhne ke liye reader ko kya pehle se clear hona chahiye? Woh assumptions explicitly establish karo pehle — ek line mein nahi, properly. Agar woh prior concept bhi shaky ho sakta hai — usse bhi establish karo. Chain complete hone ke baad hi main concept pe aao. Jo cheez skip ki toh leapfrog ho gaya.

SCHEMA 2 — PROCESS / MECHANISM:
- Cause → effect → cause → effect. Chain dikhao.
- Kya trigger karta hai, kya hota hai, kya break hota hai agar ek step fail ho.
- Flow sequential ho — leapfrog allowed nahi.
- PROBLEM → SOLUTION CHAIN (mandatory jab concept kisi existing problem ke response mein evolve hua ho): Pehle purani problem establish karo. Phir solution. Phir us solution ki limitation (agar hai). Phir next solution. Har variable ka exist karna justify ho — koi cheez arbitrary nahi lagni chahiye. Chain complete hone ke baad hi formula ya metric introduce karo.

SCHEMA 3 — EVENT / HISTORY:
- Before → trigger → kya hua → aftermath.
- Kyu hua utna important hai jitna kya hua.
- Chronological, grounded. Dates/figures sirf jab they change the story.

SCHEMA 4 — SKILL / PROCEDURE:
- Steps jo reader actually kar sake.
- Ek worked example — right vs wrong dono.
- Common mistake explicitly batao.

SCHEMA 5 — PERSON / PERSONALITY:
- Relevant person: kya obsession/drive tha → kya kiya → kya badla. Arc chahiye, bio nahi.
- Peripheral person: ek line — kaun tha aur is story mein kya role tha. Move on.
- Birth/education intro — never.

SCHEMA 6 — INSTITUTION (relevant):
- Day-to-day ground level: kya decisions leta hai, kya control karta hai, kaun feel karta hai effects, kaun isko diktat de sakta hai.
- "It ensures financial stability" jaisi lines — banned. Concrete levers batao.
- Who runs it, who it answers to, what it actually does when it "acts."

SCHEMA 7 — INSTITUTION (peripheral):
- Ek concrete sentence: kya karta hai aur is context mein kyun relevant hai. Then move on.

SCHEMA 8 — COMMITTEE / GROUP / BODY:
- Kyun bana, kaun hai andar, aur yeh log room mein baith ke actually kya decide ya influence karte hain.
- Official mandate nahi — actual behavior.

SCHEMA 9 — LAW / POLICY:
- Kaunsi problem solve karne ke liye aaya.
- Ground pe kya actually badla — konkret, not "it aimed to."
- Kisne faayda uthaya, kaun hurt hua.

SCHEMA 10 — NUMBER / DATA / METRIC:
- Kya measure kar raha hai exactly.
- High vs low value ka real-life matlab — normal insaan ya system pe kya impact.
- Kya cause karta hai isko move karne pe.
- PROBLEM → SOLUTION CHAIN: Metric kyu banaya gaya — pehle wala measure kyun kafi nahi tha? Limitation establish karo, phir metric introduce karo. Arbitrary nahi lagna chahiye.

SCHEMA 11 — RELATIONSHIP / DEPENDENCY:
- A se B ko kya hota hai. Loop hai ya one-way.
- Kya tod sakta hai yeh connection.
- Dono ko alag explain karne se alag — connection itself explain karo.

SCHEMA 12 — ARGUMENT / DEBATE:
- Har side actually kya believe karti hai aur kyu — not "some say X."
- Asli disagreement kya hai underneath the surface.
- Kaunsa evidence kaunsi side use karti hai.

---

TEACHING FLOW (free to remix):
- Definition se kabhi mat shuru kar. Kabhi bhi.
- Pehle set kar: yeh cheez kyu exist karti hai? Kaunsi real problem thi?
- Beech mein rhetorical questions throw kar — aur khud hi turant answer kar. Ruk mat.
- Callbacks use kar — jo scene ya problem shuru mein thi, wapas usse lo.
- Kabhi kabhi mid-sentence ruk — jaise realization aa rahi ho.
- Q&A format bhi use kar sakta hai: "Yeh kyu? — [answer]"
- Energy: chill se start, sharp pe khatam. Flat rhythm allowed nahi.
- PRIOR BEFORE CONCEPT (non-negotiable): Koi bhi concept explain karne se pehle mentally check karo — is concept ko samajhne ke liye reader ko kya pehle se clear hona chahiye? Jo assumptions tu le ke chal raha hai — woh sab explicitly establish ho gayi hain? Agar nahi — wahan se shuru karo. Concept baad mein aayega.

LANGUAGE & TONE:
- Hinglish — English precision, Hindi comfort.
- Basic vocabulary only. 2-3 levels neeche rakh source text se.
- Grammar tod de jab natural lage.
- No emojis. No sentimental dost-yaar framing.
- Terms/concepts jo tough hain — bracket mein explain kar alongside.
- Points use kar, paragraphs nahi (jahan bhi fit ho).

WHAT NOT TO DO:
- Leapfrog mat kar — concepts connected rehne chahiye.
- Abstract mat reh — reality se jod.
- Book ka text padhake mat ruk — woh outdated aur abstract hai.
- Har cheez ek hi style mein mat explain kar — schema dekh, switch kar.
- "For example" ya "imagine" explicitly bolne ki zaroorat nahi — example naturally flow mein aana chahiye.
- Koi bhi concept mention karo — uski prerequisites skip mat karo. Naam liya toh samjhana padega — prior chain complete honi chahiye.

HIGHLIGHT INSTRUCTIONS (non-negotiable):
- Every key fact in the HTML must be highlighted using <span> tags.
- Use these attributes: class="hl-span-[cat]" data-hl-cat="[cat]" data-group="[group-name]"
- Category keys: per (Person), org (Organisation), place (Place), date (Date), event (Event), why (Cause), effect (Effect), concept (Concept), law (Law/Policy), data (Data/Stat)
- Group name: short slug for the connected idea (e.g. "kalinga-war", "maurya-empire")
- All highlights in a group share the same data-group value
- Groups with 2+ highlights auto-assemble into a revision note
- For standalone notes with no group: use class="hl-span-note" data-hl-cat="note" (no data-group)

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
      <li><strong>[Key point]</strong> — [explanation, grounded in reality. Wrap every key fact in <span> with proper highlight attributes as per HIGHLIGHT INSTRUCTIONS]</li>
      <li><strong>[Key point]</strong> — [explanation] <a href="[url]" target="_blank">[Source Name]</a></li>
    </ul>

    <blockquote>[One sharp insight — the thing to remember about this section. Not a quote, a distilled truth.]</blockquote>

    <div class="revision-box">
      <h4>Revision — [Section Short Title]</h4>
      <ul>
        <li><strong>[Term/Concept]:</strong> [tight fact or definition — use highlight spans here too] — <a href="[url]" target="_blank">[Source]</a></li>
        <li><strong>[Term/Concept]:</strong> [tight fact or definition — use highlight spans]</li>
        <li><strong>UPSC Angle:</strong> [what examiner expects / common trap / keyword to use]</li>
      </ul>
    </div>
  </div>

  <!-- Repeat for each section -->

  <!-- MASTER REVISION — always last, always present -->
  <div class="revision-box" style="margin-top: 32px; background: var(--bg3);">
    <h4>BLOCK [N] COMPLETE REVISION — [PAGE TITLE IN CAPS]</h4>
    <ul>
      <li><strong>[Key fact/concept]:</strong> [tight recall point — use highlight spans] — <a href="[url]" target="_blank">[Source]</a></li>
      <li><strong>[Key fact/concept]:</strong> [tight recall point — use highlight spans]</li>
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
8.5. output must be in a html file.
9. Output nothing outside the <div class="lesson-content"> — no extra HTML, no comments outside section markers.
10. sometimes while explaining x you might need multiple other things, i want those other things to be explained too alongside mentioning them
11. PRIOR KNOWLEDGE CHAIN (non-negotiable): Har concept se pehle — us concept ko samajhne ke liye kya prior knowledge chahiye, woh pehle establish karo. Ek line mein nahi — properly. Agar woh prior bhi shaky ho sakta hai, usse bhi establish karo. Concept tab aayega jab chain complete ho. Koi bhi variable ya term arbitrary nahi lagna chahiye — reader ko clearly pata hona chahiye yeh cheez exist kyun karti hai.
12. PROBLEM → SOLUTION CHAIN (non-negotiable jab concept kisi problem ke response mein bana ho): Pehle problem establish karo jo is concept se pehle thi. Phir solution (concept). Phir us solution ki limitation agar hai. Phir next solution. Yeh especially apply hota hai metrics, policies, aur mechanisms pe — jo evolve hue hain kisi pehle wale ki kami se.
13. HIGHLIGHT RULES: Har key fact ko <span> mein wrap karo. Proper category select karo (per, org, place, date, event, why, effect, concept, law, data). Same group ka slug group name do. Groups with 2+ highlights will auto-assemble into revision notes. Standalone notes ke liye class="hl-span-note" data-hl-cat="note" with no data-group.`;
}

// ── Getters (called fresh each time so date is always current) ─
function getDefaultIndexInstructions() { return buildDefaultIndexInstructions(); }
function getDefaultPageInstructions()  { return buildDefaultPageInstructions(); }

// ── Module state ──────────────────────────────────────────────
const _ps = {
  indexPresets: [],
  pagePresets:  [],
  activeIndexId: null,
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
    const defaultInstr = type === 'index' ? getDefaultIndexInstructions() : getDefaultPageInstructions();
    if (!activeId) return defaultInstr;
    const found = presets.find(p => p.id === activeId);
    return found ? found.instructions : defaultInstr;
  },

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

  refreshUI(activeId);

  dropdown.addEventListener('change', () => {
    const val = dropdown.value;
    refreshUI(val === '__default__' ? null : val);
  });

  setActiveBtn.addEventListener('click', async () => {
    const val = dropdown.value === '__default__' ? null : dropdown.value;
    if (type === 'index') _ps.activeIndexId = val;
    else _ps.activePageId = val;
    await saveActiveToDB(type, val);
    refreshUI(val);
    setStatus('✓ Active preset updated', '#90dba0');
  });

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