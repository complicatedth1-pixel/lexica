// questions.js — Question management, testing modal, Supabase save
// Depends on: auth.js (sb, currentUser), library.js (saveAll, activeBookId),
//             editor.js (getSelectedTopic, selectedChapterId, selectedTopicId, treeData),
//             highlight-categories.js (HL_CATEGORIES, HL_CAT_MAP)
'use strict';

// ── State ─────────────────────────────────────────────
let _qSession = null; // active test session

// ── Supabase helpers ──────────────────────────────────
async function qSaveQuestions(topicId, questions) {
  if (!currentUser) return;
  const tp = _getTopicById(topicId);
  const ch = _getChapterForTopic(topicId);
  const book = window.library.find(b => b.id === window.activeBookId);
  if (!tp || !ch || !book) return;

  const row = {
    user_id:      currentUser.id,
    book_id:      book.id,
    chapter_id:   ch.id,
    topic_id:     tp.id,
    book_name:    book.name,
    chapter_name: ch.name,
    topic_name:   tp.name,
    questions:    questions,
    updated_at:   new Date().toISOString()
  };

  const { error } = await sb.from('lexica_questions')
    .upsert(row, { onConflict: 'user_id,topic_id' });
  if (error) console.error('[qSaveQuestions]', error);
}

async function qLoadQuestions(topicId) {
  if (!currentUser) return null;
  const { data, error } = await sb.from('lexica_questions')
    .select('questions')
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId)
    .single();
  if (error || !data) return null;
  return data.questions || [];
}

async function qSaveResults(results) {
  if (!currentUser || !results.length) return;
  const rows = results.map(r => ({ ...r, user_id: currentUser.id }));
  const { error } = await sb.from('lexica_question_results').insert(rows);
  if (error) console.error('[qSaveResults]', error);
}

async function qLoadResults(filters = {}) {
  if (!currentUser) return [];
  let q = sb.from('lexica_question_results')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (filters.book_id)    q = q.eq('book_id', filters.book_id);
  if (filters.chapter_id) q = q.eq('chapter_id', filters.chapter_id);
  if (filters.topic_id)   q = q.eq('topic_id', filters.topic_id);
  if (filters.limit)      q = q.limit(filters.limit);
  const { data, error } = await q;
  if (error) { console.error('[qLoadResults]', error); return []; }
  return data || [];
}

// ── Tree helpers ──────────────────────────────────────
function _getTopicById(topicId) {
  for (const ch of (treeData || [])) {
    for (const tp of (ch.topics || [])) {
      if (tp.id === topicId) return tp;
    }
  }
  return null;
}

function _getChapterForTopic(topicId) {
  for (const ch of (treeData || [])) {
    if ((ch.topics || []).some(t => t.id === topicId)) return ch;
  }
  return null;
}

function _getTopicContent(tp) {
  if (!tp || !tp.sections) return '';
  const tmp = document.createElement('div');
  let html = '';
  tp.sections.forEach(s => { if (s.content && s.content.trim()) html += s.content; });
  tmp.innerHTML = html;
  return tmp.textContent.trim();
}

// ── Prompt builder ────────────────────────────────────
function buildQuestionsPrompt() {
  const tp = typeof getSelectedTopic === 'function' ? getSelectedTopic() : null;
  const ch = tp ? _getChapterForTopic(selectedTopicId) : null;
  const book = window.library.find(b => b.id === window.activeBookId);
  if (!tp) return '(No topic selected)';

  const content = _getTopicContent(tp);
  const catList = (window.HL_CATEGORIES || [])
    .map(c => `  "${c.key}": "${c.label}"`)
    .join(',\n');

  return `You are a UPSC question designer. Generate MCQ questions for the passage below.

AVAILABLE CATEGORY KEYS (use these exactly):
{
${catList}
}

QUESTION TYPES:
- "direct"    : Single factual question with one clearly correct answer
- "statement" : Give 3-4 numbered statements, ask which are correct
                subtype "statement_old": options like "1 and 2 only / 2 and 3 only / 1 and 3 only / All of the above"
                subtype "statement_new": options like "Only one / Only two / Only three / All four" (harder — no elimination possible)
- "infer"     : Requires reading between the lines, not directly stated

DIFFICULTY LEVELS (assign honestly):
1 = direct fact recall
2 = statement old format (elimination possible)
3 = statement new format (need certainty on all)
4 = inference / implication

PROFILE (assign per question):
- i  (1-5): inferential demand
- wm (1-5): working memory load (high for multi-statement questions)
- xp (int): expected seconds to answer for an average student

OUTPUT: Pure JSON array only. No markdown. No explanation. No backticks.
Schema for each question:
{
  "id": "q_<random 6 char>",
  "text": "question stem",
  "type": "direct|statement|infer",
  "subtype": "statement_old|statement_new|null",
  "statements": ["stmt 1", "stmt 2", "stmt 3"] or null,
  "options": ["option A", "option B", "option C", "option D"],
  "correct": 0,
  "reason": "explanation of why the correct answer is right",
  "tags": ["key1", "key2"],
  "difficulty": 1,
  "profile": { "i": 1, "wm": 1, "xp": 45 }
}

RULES:
- Generate 5-8 questions
- Mix all three types
- tags must only use the keys listed above
- For "statement" type, put the statements in the "statements" array and reference them in "text" as "Consider the following statements:"
- correct is the 0-based index of the correct option in "options"
- reason must explain the answer clearly, citing the passage

---
BOOK: ${book ? book.name : ''}
CHAPTER: ${ch ? ch.name : ''}
TOPIC: ${tp.name}

PASSAGE:
${content}`;
}

// ── Questions Manager Modal ───────────────────────────
function openQuestionsModal() {
  const tp = typeof getSelectedTopic === 'function' ? getSelectedTopic() : null;
  if (!tp) { if (typeof showToast === 'function') showToast('Select a topic first'); return; }

  const modal = document.getElementById('questionsModal');
  modal.innerHTML = '';
  modal.classList.add('open');

  const box = document.createElement('div');
  box.className = 'qmodal-box';
  modal.appendChild(box);

  modal.addEventListener('click', e => {
    if (e.target === modal) closeQuestionsModal();
  });

  _renderQModalContent(box, tp);
}

async function _renderQModalContent(box, tp) {
  box.innerHTML = `
    <button class="qmodal-close" onclick="closeQuestionsModal()">✕</button>
    <div class="qmodal-title">Questions</div>
    <div class="qmodal-sub">Topic: <strong style="color:#c0b8d0;">${escHtml(tp.name)}</strong><br>
    Copy the prompt → paste into AI with the content → paste back the JSON.</div>

    <div class="qmodal-step-label">Step 1 — Copy prompt (already includes content)</div>
    <div class="qmodal-prompt-box" id="qPromptBox">${escHtml(buildQuestionsPrompt())}</div>
    <button class="qmodal-btn" id="qCopyPromptBtn" onclick="qCopyPrompt()" style="margin-bottom:1.4rem;">Copy Prompt + Content</button>

    <div class="qmodal-step-label">Step 2 — Paste AI's JSON response</div>
    <textarea class="qmodal-textarea" id="qJsonPaste" placeholder='Paste JSON array here: [{"id":"q_abc","text":"..."}]' rows="5"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
      <button class="qmodal-btn amber" onclick="qParseAndSave()">✓ Save Questions</button>
      <div id="qSaveStatus" class="qmodal-status"></div>
    </div>

    <div id="qExistingWrap" style="margin-top:1.6rem;"></div>
  `;

  // Load existing questions
  const existing = await qLoadQuestions(tp.id);
  _renderExistingQuestions(document.getElementById('qExistingWrap'), existing, tp);
}

function _renderExistingQuestions(wrap, questions, tp) {
  if (!questions || !questions.length) {
    wrap.innerHTML = '<div style="font-size:12px;color:#554e68;font-family:sans-serif;font-style:italic;">No questions saved yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div class="qmodal-step-label" style="margin:0;">${questions.length} questions saved</div>
      <button class="qmodal-btn danger" onclick="qDeleteAll('${tp.id}')" style="font-size:11px;padding:4px 10px;">Delete All</button>
    </div>
    <div class="qmodal-q-list">
      ${questions.map((q, i) => {
        const tags = (q.tags || []).map(k => {
          const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[k];
          return cat ? `<span class="qmodal-q-tag" style="background:${cat.color};">✦ ${escHtml(cat.label)}</span>` : '';
        }).join('');
        const typeLabel = q.type === 'direct' ? 'Direct' : q.type === 'statement' ? (q.subtype === 'statement_new' ? 'Statement (new)' : 'Statement') : 'Infer';
        return `<div class="qmodal-q-row">
          <span class="qmodal-q-index">Q${i+1}</span>
          <span class="qmodal-q-text">${escHtml((q.text||'').substring(0,100))}${(q.text||'').length > 100 ? '…' : ''}</span>
          <span class="qmodal-q-tags">${tags}</span>
          <span class="qmodal-q-type">${typeLabel} · D${q.difficulty||1}</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

function qCopyPrompt() {
  const text = document.getElementById('qPromptBox').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('qCopyPromptBtn');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.style.color = '#90dba0';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  }).catch(() => {
    const r = document.createRange();
    r.selectNode(document.getElementById('qPromptBox'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    document.execCommand('copy');
  });
}

async function qParseAndSave() {
  const raw = (document.getElementById('qJsonPaste').value || '').trim();
  const status = document.getElementById('qSaveStatus');
  if (!raw) { status.textContent = 'Paste JSON first'; status.style.color = '#ff9090'; return; }

  let parsed;
  try {
    const clean = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  } catch(e) {
    status.textContent = '❌ Invalid JSON: ' + e.message;
    status.style.color = '#ff9090';
    return;
  }

  // Validate and normalise
  const valid = parsed.filter(q => q.text && Array.isArray(q.options) && q.options.length === 4 && typeof q.correct === 'number');
  if (!valid.length) { status.textContent = '❌ No valid questions found (need text, options[4], correct)'; status.style.color = '#ff9090'; return; }

  valid.forEach(q => {
    if (!q.id) q.id = 'q_' + Math.random().toString(36).slice(2, 8);
    if (!q.tags) q.tags = [];
    if (!q.difficulty) q.difficulty = 1;
    if (!q.profile) q.profile = { i: 1, wm: 1, xp: 60 };
    if (!q.type) q.type = 'direct';
  });

  const tp = typeof getSelectedTopic === 'function' ? getSelectedTopic() : null;
  if (!tp) { status.textContent = '❌ No topic selected'; status.style.color = '#ff9090'; return; }

  status.textContent = 'Saving…'; status.style.color = '#887fa0';
  await qSaveQuestions(tp.id, valid);
  status.textContent = `✓ Saved ${valid.length} questions`;
  status.style.color = '#90dba0';

  // Re-render existing list
  const wrap = document.getElementById('qExistingWrap');
  if (wrap) _renderExistingQuestions(wrap, valid, tp);

  // Update test button
  _updateTestBtn(valid.length);

  document.getElementById('qJsonPaste').value = '';
  if (typeof showToast === 'function') showToast(`✓ ${valid.length} questions saved`);
}

async function qDeleteAll(topicId) {
  if (!confirm('Delete all questions for this topic?')) return;
  if (!currentUser) return;
  await sb.from('lexica_questions')
    .delete()
    .eq('user_id', currentUser.id)
    .eq('topic_id', topicId);
  const wrap = document.getElementById('qExistingWrap');
  if (wrap) wrap.innerHTML = '<div style="font-size:12px;color:#554e68;font-family:sans-serif;font-style:italic;">No questions saved yet.</div>';
  _updateTestBtn(0);
  if (typeof showToast === 'function') showToast('Questions deleted');
}

function closeQuestionsModal() {
  const modal = document.getElementById('questionsModal');
  if (modal) { modal.classList.remove('open'); modal.innerHTML = ''; }
}

// ── Test button injection ─────────────────────────────
function _updateTestBtn(count) {
  const btn = document.getElementById('topicTestBtn');
  if (!btn) return;
  if (count > 0) {
    btn.textContent = `▶ Test  (${count} questions)`;
    btn.classList.add('has-questions');
  } else {
    btn.textContent = '✦ Add Questions';
    btn.classList.remove('has-questions');
  }
}

// Called by renderPage in editor.js after rendering sections
// Injects the Test button at the bottom of sectionsContainer
async function injectTestButton() {
  const tp = typeof getSelectedTopic === 'function' ? getSelectedTopic() : null;
  if (!tp) return;

  // Remove old button wrap if any
  const old = document.getElementById('topicTestBtnWrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'topicTestBtnWrap';
  wrap.className = 'topic-test-btn-wrap';

  const btn = document.createElement('button');
  btn.id = 'topicTestBtn';
  btn.className = 'topic-test-btn';
  btn.textContent = '✦ Add Questions';

  btn.addEventListener('click', () => {
    // If questions exist → open test; if not → open manager
    const qs = _cachedQuestionsForTopic(tp.id);
    if (qs && qs.length > 0) {
      openTestingScreen(tp, qs);
    } else {
      openQuestionsModal();
    }
  });

  wrap.appendChild(btn);

  // Also add a small "manage" link next to it when questions exist
  const manageLink = document.createElement('button');
  manageLink.id = 'topicManageQBtn';
  manageLink.className = 'qmodal-btn';
  manageLink.textContent = '⚙ Manage';
  manageLink.style.cssText = 'margin-left:10px;font-size:11px;padding:5px 12px;display:none;color:#ddd0f5;';
  manageLink.addEventListener('click', () => openQuestionsModal());
  wrap.appendChild(manageLink);

  const container = document.getElementById('sectionsContainer');
  if (container) container.appendChild(wrap);

  // Load count from Supabase
  const existing = await qLoadQuestions(tp.id);
  if (existing && existing.length > 0) {
    _setCachedQuestions(tp.id, existing);
    _updateTestBtn(existing.length);
    manageLink.style.display = 'inline-block';
  }
}

// Simple in-memory cache so we don't re-fetch on every render
const _qCache = {};
function _setCachedQuestions(topicId, qs) { _qCache[topicId] = qs; }
function _cachedQuestionsForTopic(topicId) { return _qCache[topicId] || null; }

// ── Testing Screen ────────────────────────────────────
function openTestingScreen(tp, questions) {
  const screen = document.getElementById('testingScreen');
  if (!screen) return;

  const ch = _getChapterForTopic(tp.id);
  const book = window.library.find(b => b.id === window.activeBookId);
  const sessionId = 'ses_' + Math.random().toString(36).slice(2, 10);

  _qSession = {
    sessionId,
    topicId:       tp.id,
    chapterId:     ch ? ch.id : '',
    bookId:        book ? book.id : '',
    questions,
    current:       0,
    results:       [],
    startTime:     Date.now(),
    qStartTime:    Date.now(),
    qElapsed:      new Array(questions.length).fill(0),
    timerInterval: null
  };

  screen.innerHTML = `
    <div class="ts-topbar">
      <div class="ts-topbar-left">
        <div class="ts-title">✦ Test</div>
        <div class="ts-topic-name">${escHtml(tp.name)}${ch ? ' · ' + escHtml(ch.name) : ''}</div>
      </div>
      <div class="ts-topbar-right">
        <div class="ts-score-pill" id="tsScorePill">0 / ${questions.length} marked</div>
        <button class="ts-close-btn" onclick="closeTestingScreen()">✕ Exit</button>
      </div>
    </div>
    <div class="ts-body" id="tsBody">
      <div class="ts-content-panel">
        <div class="ts-content-heading">Reference</div>
        <div class="ts-content-inner" id="tsContentInner"></div>
      </div>
      <div class="ts-question-panel">
        <div class="ts-palette" id="tsPalette"></div>
        <div class="ts-q-view" id="tsQView"></div>
      </div>
    </div>
  `;

  const contentEl = screen.querySelector('#tsContentInner');
  if (tp.sections) {
    tp.sections.forEach(s => {
      if (s.content && s.content.trim()) {
        const div = document.createElement('div');
        div.innerHTML = s.content;
        div.querySelectorAll('[class^="hl-span-"], [data-hl-cat]').forEach(el => {
          const txt = document.createTextNode(el.textContent);
          el.replaceWith(txt);
        });
        contentEl.appendChild(div);
      }
    });
  }

  _renderPalette();
  _renderQuestion(0);
  screen.classList.add('open');
}

function closeTestingScreen() {
  const screen = document.getElementById('testingScreen');
  if (!screen) return;
  if (_qSession && _qSession.timerInterval) clearInterval(_qSession.timerInterval);
  screen.classList.remove('open');
  screen.innerHTML = '';
  _qSession = null;
}

function _renderPalette() {
  if (!_qSession) return;
  const palette = document.getElementById('tsPalette');
  if (!palette) return;
  palette.innerHTML = '';
  _qSession.questions.forEach((q, i) => {
    const btn = document.createElement('button');
    let cls = 'ts-palette-btn';
    if (i === _qSession.current) cls += ' active';
    
    if (_qSession.submitted) {
      // After submit show correct/wrong
      const r = _qSession.results[i];
      if (r !== undefined) cls += r.correct ? ' answered-correct' : ' answered-wrong';
    } else {
      // Before submit just show as attempted (amber)
      if (_qSession.results[i] !== undefined) cls += ' attempted';
    }
    
    btn.className = cls;
    btn.id = `tsPalBtn_${i}`;
    btn.textContent = i + 1;
    btn.title = (q.text || '').substring(0, 60);
    btn.addEventListener('click', () => {
      if (_qSession.timerInterval) {
        clearInterval(_qSession.timerInterval);
        _qSession.timerInterval = null;
      }
      _renderQuestion(i);
    });
    palette.appendChild(btn);
  });
}

function _updatePalette() {
  if (!_qSession) return;
  _qSession.questions.forEach((q, i) => {
    const btn = document.getElementById(`tsPalBtn_${i}`);
    if (!btn) return;
    btn.classList.remove('active', 'answered-correct', 'answered-wrong');
    if (i === _qSession.current) btn.classList.add('active');
    const res = _qSession.results[i];
    if (res !== undefined) {
      btn.classList.add(res.correct ? 'answered-correct' : 'answered-wrong');
    }
  });
}

function _renderQuestion(idx) {
  if (!_qSession) return;
  _qSession.current = idx;
  const q = _qSession.questions[idx];
  const existing = _qSession.results[idx];
  const attempted = existing !== undefined;
  const submitted = _qSession.submitted === true;

  if (_qSession.timerInterval) {
    clearInterval(_qSession.timerInterval);
    _qSession.timerInterval = null;
  }
  _qSession.qStartTime = Date.now();

  const view = document.getElementById('tsQView');
  if (!view) return;

  const labels = ['A', 'B', 'C', 'D'];
  const diffDots = [1,2,3,4].map(d =>
    `<span class="ts-q-difficulty-dot${d <= (q.difficulty||1) ? ' filled' : ''}"></span>`
  ).join('');

  const typeBadge = q.type === 'direct' ? 'direct' : q.type === 'statement' ? 'statement' : 'infer';
  const typeLabel = q.type === 'direct' ? 'Direct' : q.type === 'statement' ? (q.subtype === 'statement_new' ? 'Statement ★' : 'Statement') : 'Inference';

  const statementsHTML = (q.type === 'statement' && Array.isArray(q.statements) && q.statements.length)
    ? `<div class="ts-q-statements">${q.statements.map((s, i) =>
        `<div class="ts-q-statement-row"><span class="ts-q-statement-num">${i+1}.</span><span>${escHtml(s)}</span></div>`
      ).join('')}</div>` : '';

  const optionsHTML = (q.options || []).map((opt, i) => {
    let cls = 'ts-q-option';
    
    if (submitted && attempted) {
      // Show correct/wrong after submission
      cls += ' disabled';
      if (i === q.correct) cls += ' correct';
      else if (i === existing.chosen) cls += ' wrong';
    } else if (attempted && !submitted) {
      // Show selected before submission
      cls += (i === existing.chosen) ? ' selected' : '';
    }
    
    return `<div class="${cls}" data-idx="${i}">
      <span class="ts-q-option-label">${labels[i]}</span>
      <span>${escHtml(opt)}</span>
    </div>`;
  }).join('');

  const xp = q.profile && q.profile.xp ? q.profile.xp : 60;

  // Bottom action bar
  let actionsHTML = '';
  if (submitted) {
    // Review mode — just next/prev
    actionsHTML = `
      <div class="ts-q-actions">
        ${idx > 0 ? `<button class="ts-submit-btn" onclick="qGoTo(${idx-1})">← Prev</button>` : ''}
        ${idx < _qSession.questions.length - 1 
          ? `<button class="ts-next-btn visible" onclick="qGoTo(${idx+1})">Next →</button>`
          : `<button class="ts-next-btn visible" onclick="qShowResults()">Results →</button>`}
      </div>`;
  } else {
    const allAttempted = _qSession.questions.every((_, i) => _qSession.results[i] !== undefined);
    actionsHTML = `
      <div class="ts-q-actions">
        ${idx > 0 ? `<button class="ts-submit-btn" onclick="qGoTo(${idx-1})">← Prev</button>` : ''}
        ${idx < _qSession.questions.length - 1 
          ? `<button class="ts-next-btn visible" onclick="qGoTo(${idx+1})">Next →</button>` 
          : ''}
        ${allAttempted 
          ? `<button class="ts-submit-btn" style="background:rgba(90,200,90,0.15);border-color:rgba(90,200,90,0.4);color:#6adf6a;" onclick="qFinalSubmit()">✓ Submit Test</button>`
          : `<button class="ts-submit-btn" onclick="qFinalSubmit()" style="opacity:0.5;" title="Answer all questions to submit">Submit Test</button>`}
      </div>`;
  }

  view.innerHTML = `
    <div class="ts-q-meta">
      <span class="ts-q-num">Q${idx + 1} of ${_qSession.questions.length}</span>
      <span class="ts-q-type-badge ${typeBadge}">${typeLabel}</span>
      <span class="ts-q-difficulty">${diffDots}</span>
      ${!submitted && !attempted ? `<span class="ts-q-timer" id="tsTimer">${_qSession.qElapsed[idx]}s</span>` : ''}
      ${!submitted && attempted ? `<span style="font-size:11px;color:#e8b87a;font-family:sans-serif;">✓ Marked</span>` : ''}
    </div>

    <div class="ts-q-stem">${escHtml(q.text || '')}</div>
    ${statementsHTML}
    <div class="ts-q-options" id="tsOptions">${optionsHTML}</div>

    <div class="ts-q-reason${submitted && attempted ? ' visible' : ''}" id="tsReason">
      <div class="ts-q-reason-label">Explanation</div>
      ${escHtml(q.reason || '')}
    </div>

    ${submitted && attempted ? `
    <div class="ts-q-time-row visible" id="tsTimeRow">
      <span>Time: <strong>${existing.time_taken}s</strong></span>
      <span style="color:#554e68;">/ expected ${xp}s</span>
      <span class="${existing.time_taken < xp * 0.85 ? 'ts-q-time-fast' : 'ts-q-time-slow'}">
        ${existing.time_taken < xp * 0.85 ? '⚡ Fast' : '🐢 Slow'}
      </span>
    </div>` : ''}

    ${actionsHTML}
  `;

  // Wire option clicks — only if not submitted
  if (!submitted) {
    view.querySelectorAll('.ts-q-option').forEach(el => {
      el.addEventListener('click', () => {
        if (_qSession.timerInterval) {
          clearInterval(_qSession.timerInterval);
          _qSession.timerInterval = null;
        }
        // Mark answer locally immediately
        const chosen = parseInt(el.dataset.idx);
        _qSession.results[idx] = {
          session_id:       _qSession.sessionId,
          book_id:          _qSession.bookId,
          chapter_id:       _qSession.chapterId,
          topic_id:         _qSession.topicId,
          question_id:      q.id || ('q_' + idx),
          question_index:   idx,
          question_type:    q.type || 'direct',
          question_subtype: q.subtype || null,
          tags:             q.tags || [],
          difficulty:       q.difficulty || 1,
          profile_i:        q.profile ? q.profile.i : null,
          profile_wm:       q.profile ? q.profile.wm : null,
          profile_xp:       q.profile ? q.profile.xp : null,
          time_taken:       _qSession.qElapsed[idx],
          correct:          chosen === q.correct,
          chosen
        };

        // Update score pill
        const attempted_count = _qSession.results.filter(r => r !== undefined).length;
        const pill = document.getElementById('tsScorePill');
        if (pill) pill.textContent = `${attempted_count} / ${_qSession.questions.length} marked`;

        // Re-render to show marked state + update palette
        _renderQuestion(idx);
      });
    });
  }

  // Timer — only for unanswered, unsubmitted
  if (!submitted && !attempted) {
    let elapsed = _qSession.qElapsed[idx];
    const timerEl = document.getElementById('tsTimer');
    if (timerEl) timerEl.textContent = elapsed + 's';

    _qSession.timerInterval = setInterval(() => {
      elapsed++;
      _qSession.qElapsed[idx] = elapsed;
      const timerEl = document.getElementById('tsTimer');
      if (!timerEl) {
        clearInterval(_qSession.timerInterval);
        _qSession.timerInterval = null;
        return;
      }
      timerEl.textContent = elapsed + 's';
      if (elapsed > xp * 1.5) timerEl.classList.add('warn');
    }, 1000);
  }

  _updatePalette();
}
// New helper for navigation
function qGoTo(idx) {
  if (!_qSession) return;
  if (_qSession.timerInterval) {
    clearInterval(_qSession.timerInterval);
    _qSession.timerInterval = null;
  }
  _renderQuestion(idx);
}

// Final submit — saves to Supabase and enters review mode
async function qFinalSubmit() {
  if (!_qSession) return;
  if (_qSession.timerInterval) {
    clearInterval(_qSession.timerInterval);
    _qSession.timerInterval = null;
  }

  _qSession.submitted = true;

  // Save to Supabase
  const toSave = _qSession.results.filter(r => r !== undefined);
  await qSaveResults(toSave);

  // Update topbar
  const correct_count = toSave.filter(r => r.correct).length;
  const pill = document.getElementById('tsScorePill');
  if (pill) pill.textContent = `${correct_count} / ${toSave.length} correct`;

  // Re-render current question in review mode
  _renderQuestion(_qSession.current);

  if (typeof showToast === 'function') showToast(`Submitted — ${correct_count}/${toSave.length} correct`);
}
function qSubmitAnswer() {
  if (!_qSession) return;
  const idx = _qSession.current;
  if (_qSession.results[idx] !== undefined) return;

  const q = _qSession.questions[idx];
  const selected = document.querySelector('#tsOptions .ts-q-option.selected');

  if (!selected) {
    if (typeof showToast === 'function') showToast('Select an option first');
    return;
  }

  const chosen = parseInt(selected.dataset.idx);
  const correct = chosen === q.correct;

  if (_qSession.timerInterval) {
    clearInterval(_qSession.timerInterval);
    _qSession.timerInterval = null;
  }

  const timeTaken = _qSession.qElapsed[idx];

  _qSession.results[idx] = {
    session_id:       _qSession.sessionId,
    book_id:          _qSession.bookId,
    chapter_id:       _qSession.chapterId,
    topic_id:         _qSession.topicId,
    question_id:      q.id || ('q_' + idx),
    question_index:   idx,
    question_type:    q.type || 'direct',
    question_subtype: q.subtype || null,
    tags:             q.tags || [],
    difficulty:       q.difficulty || 1,
    profile_i:        q.profile ? q.profile.i : null,
    profile_wm:       q.profile ? q.profile.wm : null,
    profile_xp:       q.profile ? q.profile.xp : null,
    time_taken:       timeTaken,
    correct,
    chosen
  };

  _renderQuestion(idx);

  const correct_count = _qSession.results.filter(r => r && r.correct).length;
  const answered_count = _qSession.results.filter(r => r !== undefined).length;
  const pill = document.getElementById('tsScorePill');
  if (pill) pill.textContent = `${correct_count} / ${answered_count} answered`;
}

function qNextQuestion() {
  if (!_qSession) return;
  if (_qSession.timerInterval) {
    clearInterval(_qSession.timerInterval);
    _qSession.timerInterval = null;
  }
  const next = _qSession.current + 1;
  if (next < _qSession.questions.length) {
    _renderQuestion(next);
  } else {
    qShowResults();
  }
}

async function qShowResults() {
  if (!_qSession) return;
  if (_qSession.timerInterval) clearInterval(_qSession.timerInterval);

  // Save results to Supabase
  const toSave = _qSession.results.filter(r => r !== undefined);
  await qSaveResults(toSave);

  const questions = _qSession.questions;
  const results = _qSession.results;
  const correct_count = results.filter(r => r && r.correct).length;
  const total = results.filter(r => r !== undefined).length;
  const pct = total > 0 ? Math.round((correct_count / total) * 100) : 0;
  const totalTime = Math.round((Date.now() - _qSession.startTime) / 1000);

  // Tag accuracy
  const tagStats = {};
  results.forEach(r => {
    if (!r) return;
    (r.tags || []).forEach(tag => {
      if (!tagStats[tag]) tagStats[tag] = { correct: 0, total: 0 };
      tagStats[tag].total++;
      if (r.correct) tagStats[tag].correct++;
    });
  });

  // Type accuracy
  const typeStats = { direct: {c:0,t:0}, statement: {c:0,t:0}, infer: {c:0,t:0} };
  results.forEach(r => {
    if (!r) return;
    const t = r.question_type || 'direct';
    if (!typeStats[t]) typeStats[t] = {c:0,t:0};
    typeStats[t].t++;
    if (r.correct) typeStats[t].c++;
  });

  const scoreClass = pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'bad';

  const screen = document.getElementById('testingScreen');
  const body = screen.querySelector('#tsBody');
  if (!body) return;

  // Build tag bars
  const tagBarsHTML = Object.entries(tagStats).map(([key, s]) => {
    const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[key];
    const label = cat ? cat.label : key;
    const color = cat ? cat.color : '#887fa0';
    const p = Math.round((s.correct / s.total) * 100);
    return `<div class="ts-tag-row">
      <span class="ts-tag-label">${escHtml(label)}</span>
      <div class="ts-tag-bar-track"><div class="ts-tag-bar-fill" style="width:${p}%;background:${color};"></div></div>
      <span class="ts-tag-pct">${p}%</span>
    </div>`;
  }).join('');

  // Type bars
  const typeColors = { direct: '#60a5fa', statement: '#c084fc', infer: '#fb923c' };
  const typeLabels = { direct: 'Direct', statement: 'Statement', infer: 'Inference' };
  const typeBarsHTML = Object.entries(typeStats).filter(([,s]) => s.t > 0).map(([type, s]) => {
    const p = Math.round((s.c / s.t) * 100);
    return `<div class="ts-tag-row">
      <span class="ts-tag-label">${typeLabels[type]||type} (${s.t})</span>
      <div class="ts-tag-bar-track"><div class="ts-tag-bar-fill" style="width:${p}%;background:${typeColors[type]||'#887fa0'};"></div></div>
      <span class="ts-tag-pct">${p}%</span>
    </div>`;
  }).join('');

  // Review list
  const reviewHTML = questions.map((q, i) => {
    const r = results[i];
    if (!r) return '';
    const verdict = r.correct ? 'correct' : 'wrong';
    return `<div class="ts-review-row ${verdict}">
      <div class="ts-review-q-text">${escHtml((q.text||'').substring(0,120))}${(q.text||'').length>120?'…':''}</div>
      <div class="ts-review-meta">
        <span class="ts-review-verdict ${verdict}">${r.correct ? '✓ Correct' : '✗ Wrong'}</span>
        <span class="ts-review-time">${r.time_taken}s</span>
        ${!r.correct ? `<span style="font-size:11px;color:#665f78;font-family:sans-serif;">→ Correct: ${escHtml((q.options||[])[q.correct]||'')}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="ts-results">
      <div class="ts-results-heading">Session Complete</div>
      <div class="ts-results-sub">
        ${_qSession.topicId ? (_getTopicById(_qSession.topicId)||{}).name||'' : ''} · ${_formatTime(totalTime)} total
      </div>

      <div class="ts-results-score-row">
        <div class="ts-results-score-card">
          <div class="ts-results-score-val ${scoreClass}">${pct}%</div>
          <div class="ts-results-score-lbl">Score</div>
        </div>
        <div class="ts-results-score-card">
          <div class="ts-results-score-val">${correct_count}/${total}</div>
          <div class="ts-results-score-lbl">Correct</div>
        </div>
        <div class="ts-results-score-card">
          <div class="ts-results-score-val">${_formatTime(totalTime)}</div>
          <div class="ts-results-score-lbl">Time</div>
        </div>
      </div>

      ${tagBarsHTML ? `
        <div class="ts-results-tags">
          <div class="ts-results-section-label">By Category</div>
          ${tagBarsHTML}
        </div>` : ''}

      ${typeBarsHTML ? `
        <div class="ts-results-tags">
          <div class="ts-results-section-label">By Question Type</div>
          ${typeBarsHTML}
        </div>` : ''}

      <div class="ts-results-section-label" style="margin-bottom:1rem;">Review</div>
      <div class="ts-review-list">${reviewHTML}</div>

      <div class="ts-results-actions">
        <button class="ts-submit-btn" onclick="closeTestingScreen()">← Back to Topic</button>
        <button class="ts-next-btn visible" onclick="openAnalytics()">Analytics →</button>
      </div>
    </div>
  `;
}

function _formatTime(sec) {
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}m ${s}s`;
}

// ── Expose ────────────────────────────────────────────
window.openQuestionsModal  = openQuestionsModal;
window.closeQuestionsModal = closeQuestionsModal;
window.qCopyPrompt         = qCopyPrompt;
window.qParseAndSave       = qParseAndSave;
window.qDeleteAll          = qDeleteAll;
window.qSubmitAnswer       = qSubmitAnswer;
window.qNextQuestion       = qNextQuestion;
window.qShowResults        = qShowResults;
window.closeTestingScreen  = closeTestingScreen;
window.injectTestButton    = injectTestButton;
window.qLoadResults        = qLoadResults;
window.qGoTo        = qGoTo;
window.qFinalSubmit = qFinalSubmit;