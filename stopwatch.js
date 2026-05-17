// stopwatch.js — Timer state, topic page time tracking, PDF page time
// Per-page tracking: each A4 virtual page within a topic has its own time entry.
// Data stored as tp.pageTimes = { [pageNum]: ms } on each topic object.
// Owns: swElapsed, swStart, swTimer, swRunning, swSessionElapsed
// Reads: treeData, selectedChapterId, selectedTopicId (from editor.js)
// Reads: pdfMode, pdfViewerBook, pdfCurrentPage (from pdf.js)
// Reads: window._currentA4Page (set by editor.js renderPage scroll handler)

'use strict';

let swElapsed = 0, swStart = null, swTimer = null, swRunning = false, swSessionElapsed = 0;
const swDisplay = document.getElementById('swDisplay');
const swStartStop = document.getElementById('swStartStop');

function swFormat(ms) {
  const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

// Get current A4 page (1-based); falls back to 1 if not in topic view
function getCurrentA4Page() {
  return (window._currentA4Page && window._currentA4Page >= 1) ? window._currentA4Page : 1;
}

// Return total time across ALL pages of a topic (for analytics compatibility)
function getTopicTotalTime(tp) {
  if (!tp) return 0;
  if (tp.pageTimes && Object.keys(tp.pageTimes).length > 0)
    return Object.values(tp.pageTimes).reduce((a, b) => a + b, 0);
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
    else saveCurrentPageTime();
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
    const tp = getSelectedTopic(); const pg = getCurrentA4Page();
    if (tp) {
      if (!tp.pageTimes) tp.pageTimes = {};
      tp.pageTimes[pg] = 0;
      tp.timeSpent = getTopicTotalTime(tp);
      saveAll(); showToast('Timer reset for page ' + pg);
    }
  }
});

// Save elapsed session time to the current topic + A4 page
function saveCurrentPageTime() {
  const tp = getSelectedTopic(); if (!tp) return;
  let sessionTime = swSessionElapsed;
  if (swRunning && swStart) sessionTime += Date.now() - swStart;
  if (sessionTime <= 0) return;
  if (!tp.pageTimes) tp.pageTimes = {};
  const pg = getCurrentA4Page();
  tp.pageTimes[pg] = (tp.pageTimes[pg] || 0) + sessionTime;
  // Keep legacy tp.timeSpent as total for analytics compatibility
  tp.timeSpent = getTopicTotalTime(tp);
  swSessionElapsed = 0;
  if (swRunning && swStart) swStart = Date.now();
  tp.wordCount = computeTopicWordCount(tp);
  saveAll();
}

// Alias used externally
function saveStopwatchToTopic() {
  if (!pdfMode) saveCurrentPageTime();
}

// ── A4 page change while running: bank time for old page, load new page ──
document.addEventListener('a4pagechange', e => {
  if (!swRunning || pdfMode) return;
  const { from, to } = e.detail;
  if (!from || from === to) return;

  // Bank time for the page we're leaving
  const added = Date.now() - swStart;
  swSessionElapsed += added;
  swStart = Date.now();

  const tp = getSelectedTopic(); if (!tp) return;
  if (!tp.pageTimes) tp.pageTimes = {};
  tp.pageTimes[from] = (tp.pageTimes[from] || 0) + added;
  tp.timeSpent = getTopicTotalTime(tp);
  saveAll();

  // Switch display to new page's accumulated time
  swElapsed = tp.pageTimes[to] || 0;
  swSessionElapsed = 0;
  swStart = Date.now();
});

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

// Save time when switching topics
document.getElementById('chapterList').addEventListener('click', e => {
  const topicName = e.target.closest('.topic-name');
  if (topicName) {
    const tid = topicName.dataset.tid;
    if (tid && tid !== selectedTopicId) {
      if (swRunning && swStart) swSessionElapsed += Date.now() - swStart;
      if (!pdfMode) saveCurrentPageTime();
      clearInterval(swTimer); swRunning = false; swStart = null; swSessionElapsed = 0;
      swStartStop.textContent = '▶'; swDisplay.classList.remove('running');
      swElapsed = 0; swDisplay.textContent = '00:00';
      setTimeout(() => {
        const newTp = getSelectedTopic();
        let found = newTp;
        if (!found || found.id !== tid) {
          for (const ch of (treeData || [])) {
            const t = (ch.topics||[]).find(t => t.id === tid);
            if (t) { found = t; break; }
          }
        }
        if (found) {
          const pg = getCurrentA4Page();
          if (!found.pageTimes) found.pageTimes = {};
          swElapsed = found.pageTimes[pg] || 0;
          swDisplay.textContent = swElapsed > 0 ? swFormat(swElapsed) : '00:00';
        }
      }, 120);
    }
  }
}, true);

// Save time when going home
document.getElementById('homeLink').addEventListener('click', () => {
  if (!pdfMode) {
    if (swRunning && swStart) {
      const elapsed = Date.now() - swStart;
      swElapsed += elapsed;
      swSessionElapsed += elapsed;
      swStart = null;
    }
    saveCurrentPageTime();
    clearInterval(swTimer); swRunning = false; swElapsed = 0; swStart = null; swSessionElapsed = 0;
    swStartStop.textContent = '▶'; swDisplay.textContent = '00:00'; swDisplay.classList.remove('running');
  }
}, true);

window.swFormat = swFormat;
window.saveStopwatchToTopic = saveStopwatchToTopic;
window.savePDFPageTime = savePDFPageTime;
window.loadPDFPageTime = loadPDFPageTime;
window.getTopicTotalTime = getTopicTotalTime;