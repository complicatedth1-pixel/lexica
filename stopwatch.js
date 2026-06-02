// stopwatch.js — Timer state, topic time tracking, PDF page time
// Per-TOPIC tracking: time is accumulated directly on tp.timeSpent (ms).
// Owns: swElapsed, swStart, swTimer, swRunning, swSessionElapsed

'use strict';

let swElapsed = 0, swStart = null, swTimer = null, swRunning = false, swSessionElapsed = 0;
const swDisplay = document.getElementById('swDisplay');
const swStartStop = document.getElementById('swStartStop');

function swFormat(ms) {
  const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

function getTopicTotalTime(tp) {
  if (!tp) return 0;
  return tp.timeSpent || 0;
}

swStartStop.addEventListener('click', () => {
  if (!swRunning) {
    swStart = Date.now();
    swTimer = setInterval(() => { swDisplay.textContent = swFormat(swElapsed + (Date.now() - swStart)); }, 500);
    swRunning = true; swStartStop.textContent = '⏸'; swDisplay.classList.add('running');
  } else {
    const added = Date.now() - swStart; swElapsed += added; swSessionElapsed += added;
    clearInterval(swTimer); swRunning = false; swStartStop.textContent = '▶';
    swDisplay.classList.remove('running'); swDisplay.textContent = swFormat(swElapsed);
    if (pdfMode && pdfCurrentPage !== null) savePDFPageTime();
    else saveCurrentTopicTime();
  }
});

document.getElementById('swReset').addEventListener('click', () => {
  if (swRunning) { swSessionElapsed += Date.now() - swStart; clearInterval(swTimer); swRunning = false; swStartStop.textContent = '▶'; swDisplay.classList.remove('running'); }
  swElapsed = 0; swSessionElapsed = 0; swStart = null; swDisplay.textContent = '00:00';
  if (pdfMode && pdfCurrentPage !== null) {
    if (!pdfViewerBook.pageTimes) pdfViewerBook.pageTimes = {};
    pdfViewerBook.pageTimes[pdfCurrentPage] = 0;
    saveBook(pdfViewerBook); showToast('Timer reset');
  } else {
    const tp = getSelectedTopic();
    if (tp) {
      tp.timeSpent = 0;
      tp.wordCount = computeTopicWordCount(tp);
      saveAll(); showToast('Timer reset for topic');
    }
  }
});

function saveCurrentTopicTime() {
  const tp = getSelectedTopic(); if (!tp) return;
  let sessionTime = swSessionElapsed;
  if (swRunning && swStart) sessionTime += Date.now() - swStart;
  if (sessionTime <= 0) return;
  tp.timeSpent = (tp.timeSpent || 0) + sessionTime;
  swSessionElapsed = 0;
  if (swRunning && swStart) swStart = Date.now();
  tp.wordCount = computeTopicWordCount(tp);
  saveAll();
}

function saveStopwatchToTopic() {
  if (!pdfMode) saveCurrentTopicTime();
}

function savePDFPageTime() {
  if (!pdfMode || !pdfViewerBook || pdfCurrentPage === null) return;
  if (!pdfViewerBook.pageTimes) pdfViewerBook.pageTimes = {};
  pdfViewerBook.pageTimes[pdfCurrentPage] = (pdfViewerBook.pageTimes[pdfCurrentPage] || 0) + swElapsed;
  pdfViewerBook.lastPage = pdfCurrentPage;
  saveBook(pdfViewerBook);
}

function loadPDFPageTime(pageNum) {
  if (!pdfMode || !pdfViewerBook || !pdfViewerBook.pageTimes) return 0;
  return pdfViewerBook.pageTimes[pageNum] || 0;
}

function computeTopicWordCount(tp) {
  if (!tp) return 0;
  let text = '';
  (tp.sections||[]).forEach(sec => { if (sec.content) { const tmp = document.createElement('div'); tmp.innerHTML = sec.content; text += ' ' + tmp.textContent; } });
  text = text.trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

// ── Save time when switching topics ──────────────────
document.getElementById('chapterList').addEventListener('click', e => {
  const topicName = e.target.closest('.topic-name');
  if (topicName) {
    const tid = topicName.dataset.tid;
    if (tid && tid !== selectedTopicId) {
      if (swRunning && swStart) swSessionElapsed += Date.now() - swStart;
      if (!pdfMode) saveCurrentTopicTime();
      clearInterval(swTimer); swRunning = false; swStart = null; swSessionElapsed = 0;
      swStartStop.textContent = '▶'; swDisplay.classList.remove('running');
      swElapsed = 0; swDisplay.textContent = '00:00';
      setTimeout(() => {
        let found = null;
        for (const ch of (treeData || [])) {
          const t = (ch.topics||[]).find(t => t.id === tid);
          if (t) { found = t; break; }
        }
        if (found) {
          swElapsed = found.timeSpent || 0;
          swDisplay.textContent = swElapsed > 0 ? swFormat(swElapsed) : '00:00';
        }
      }, 120);
    }
  }
}, true);

// ── Save time when going home ─────────────────────────
document.getElementById('homeLink').addEventListener('click', () => {
  if (!pdfMode) {
    if (swRunning && swStart) {
      const elapsed = Date.now() - swStart;
      swElapsed += elapsed;
      swSessionElapsed += elapsed;
      swStart = null;
    }
    saveCurrentTopicTime();
    clearInterval(swTimer); swRunning = false; swElapsed = 0; swStart = null; swSessionElapsed = 0;
    swStartStop.textContent = '▶'; swDisplay.textContent = '00:00'; swDisplay.classList.remove('running');
  }
}, true);

// ── Save on refresh / tab close (beforeunload) ────────
// FIX: The previous version used sendBeacon without auth headers, which
// Supabase REST rejects with 401 → silent data loss on every refresh.
// Fix: include apikey + Authorization headers via fetch with keepalive:true.
// keepalive:true is the modern equivalent of sendBeacon for JSON APIs —
// the browser guarantees it completes even if the page is unloading.
window.addEventListener('beforeunload', () => {
  // Step 1: flush any running stopwatch time into in-memory treeData
  if (swRunning && swStart) {
    const elapsed = Date.now() - swStart;
    swElapsed += elapsed;
    swSessionElapsed += elapsed;
    swStart = null;
    swRunning = false;
    clearInterval(swTimer);
  }

  if (pdfMode && pdfCurrentPage !== null) {
    if (pdfViewerBook) {
      if (!pdfViewerBook.pageTimes) pdfViewerBook.pageTimes = {};
      pdfViewerBook.pageTimes[pdfCurrentPage] = (pdfViewerBook.pageTimes[pdfCurrentPage] || 0) + swElapsed;
    }
  } else {
    const tp = getSelectedTopic();
    if (tp && swSessionElapsed > 0) {
      tp.timeSpent = (tp.timeSpent || 0) + swSessionElapsed;
      swSessionElapsed = 0;
      tp.wordCount = computeTopicWordCount(tp);
    }
  }

  // Step 2: sync editor DOM → window.library in-memory object
  // FIX: also force-flush the autosave debounce — if the user typed and
  // refreshed within 1500ms, saveAll() was never called yet. We call it
  // here directly so the in-memory book object has the latest treeData
  // before we serialize it to JSON for the beacon.
  if (typeof saveAll === 'function') saveAll();

  // Step 3: fire a keepalive fetch to Supabase REST (replaces broken sendBeacon)
  // FIX: sendBeacon sends no custom headers — Supabase requires apikey and
  // Authorization. fetch with keepalive:true is guaranteed by spec to
  // complete after page unload and supports full headers.
  const user = window.currentUser;
  const token = window._supabaseAccessToken;
  const SUPABASE_URL = 'https://ckrtzfyqkcgnsbueetqh.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcnR6Znlxa2NnbnNidWVldHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDk4NjEsImV4cCI6MjA5Mzk4NTg2MX0.S7bRBw6jJtTHxiTgFxL_45kIeV1Q4EotKd2MFviOMac';

  if (user && window.activeBookId && window._libraryLoaded) {
    const book = window.library && window.library.find(b => b.id === window.activeBookId);
    if (book && !book.isPDFViewer) {
      const row = {
        id: book.id,
        user_id: user.id,
        name: book.name || '',
        tree_data: book.treeData || [],
        highlights: book.highlights || {},
        notes: book.notes || {},
        last_opened: Date.now(),
        is_pdf: book.isPDF || false,
        is_pdf_viewer: book.isPDFViewer || false,
        pdf_num_pages: book.pdfNumPages || null,
        page_times: book.pageTimes || {},
        pdf_highlights: book.pdfHighlights || {},
        page_confirmed: book.pageConfirmed || {}
      };
      try {
        // keepalive:true — browser completes this request even after page unload
        fetch(
          `${SUPABASE_URL}/rest/v1/books?on_conflict=id,user_id`,
          {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates',
              'apikey': SUPABASE_ANON,
              'Authorization': `Bearer ${token || SUPABASE_ANON}`
            },
            body: JSON.stringify(row)
          }
        );
      } catch(e) {
        // last-resort: try sendBeacon with the anon key in a custom header blob
        // (some browsers block keepalive fetch on unload; beacon is a fallback)
        try {
          navigator.sendBeacon(
            `${SUPABASE_URL}/rest/v1/books?on_conflict=id,user_id&apikey=${SUPABASE_ANON}`,
            new Blob([JSON.stringify(row)], { type: 'application/json' })
          );
        } catch(e2) {}
      }
    }
  }
});

window.swFormat = swFormat;
window.saveStopwatchToTopic = saveStopwatchToTopic;
window.savePDFPageTime = savePDFPageTime;
window.loadPDFPageTime = loadPDFPageTime;
window.getTopicTotalTime = getTopicTotalTime;