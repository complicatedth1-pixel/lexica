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

// ── Save time when closing/refreshing tab ─────────────
// Uses sendBeacon for reliable delivery even during page unload.
// Falls back to synchronous saveAll() which at least updates in-memory state.
window.addEventListener('beforeunload', () => {
  if (!swRunning && swSessionElapsed <= 0) return; // nothing to save

  // Accumulate any running time into session elapsed
  if (swRunning && swStart) {
    const elapsed = Date.now() - swStart;
    swElapsed += elapsed;
    swSessionElapsed += elapsed;
    swStart = null;
    swRunning = false;
    clearInterval(swTimer);
  }

  if (pdfMode && pdfCurrentPage !== null) {
    // For PDF mode — update in-memory then let saveAll flush it
    if (pdfViewerBook) {
      if (!pdfViewerBook.pageTimes) pdfViewerBook.pageTimes = {};
      pdfViewerBook.pageTimes[pdfCurrentPage] = (pdfViewerBook.pageTimes[pdfCurrentPage] || 0) + swElapsed;
    }
  } else {
    // For topic mode — update tp.timeSpent directly in memory
    const tp = getSelectedTopic();
    if (tp && swSessionElapsed > 0) {
      tp.timeSpent = (tp.timeSpent || 0) + swSessionElapsed;
      swSessionElapsed = 0;
      tp.wordCount = computeTopicWordCount(tp);
    }
  }

  // Sync in-memory book state to library object
  saveAll();

  // Best-effort: send the updated book to Supabase via beacon
  // (fetch/XHR are not guaranteed to complete on unload, but sendBeacon is)
  if (currentUser && window.activeBookId && window._libraryLoaded) {
    const book = window.library.find(b => b.id === window.activeBookId);
    if (book) {
      const row = {
        id: book.id, user_id: currentUser.id, name: book.name || '',
        tree_data: book.treeData || [], highlights: book.highlights || {},
        notes: book.notes || {}, last_opened: Date.now(),
        is_pdf: book.isPDF || false, is_pdf_viewer: book.isPDFViewer || false,
        pdf_num_pages: book.pdfNumPages || null, page_times: book.pageTimes || {},
        pdf_highlights: book.pdfHighlights || {},
        page_confirmed: book.pageConfirmed || {}
      };
      // Supabase REST endpoint — sendBeacon fires reliably on tab close
      const url = `${window._supabase?.supabaseUrl || 'https://ckrtzfyqkcgnsbueetqh.supabase.co'}/rest/v1/books`;
      try {
        navigator.sendBeacon(url + '?on_conflict=id,user_id',
          new Blob([JSON.stringify(row)], { type: 'application/json' })
        );
      } catch(e) {}
    }
  }
});

window.swFormat = swFormat;
window.saveStopwatchToTopic = saveStopwatchToTopic;
window.savePDFPageTime = savePDFPageTime;
window.loadPDFPageTime = loadPDFPageTime;
window.getTopicTotalTime = getTopicTotalTime;