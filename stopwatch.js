// stopwatch.js — Timer state, topic time tracking, PDF page time
// Per-TOPIC tracking: time is accumulated directly on tp.timeSpent (ms).
// pageTimes is no longer used for regular topics; only PDFs still use pageTimes.
// Owns: swElapsed, swStart, swTimer, swRunning, swSessionElapsed
// Reads: treeData, selectedChapterId, selectedTopicId (from editor.js)
// Reads: pdfMode, pdfViewerBook, pdfCurrentPage (from pdf.js)

'use strict';

let swElapsed = 0, swStart = null, swTimer = null, swRunning = false, swSessionElapsed = 0;
const swDisplay = document.getElementById('swDisplay');
const swStartStop = document.getElementById('swStartStop');

function swFormat(ms) {
  const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

// Return total time for a topic — now simply tp.timeSpent
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

// Save elapsed session time to the current topic directly
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

// Alias used externally (called by editor.js etc.)
function saveStopwatchToTopic() {
  if (!pdfMode) saveCurrentTopicTime();
}

// ── No a4pagechange listener needed — time is per topic, not per visual page ──

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
      if (!pdfMode) saveCurrentTopicTime();
      clearInterval(swTimer); swRunning = false; swStart = null; swSessionElapsed = 0;
      swStartStop.textContent = '▶'; swDisplay.classList.remove('running');
      swElapsed = 0; swDisplay.textContent = '00:00';
      setTimeout(() => {
        // Find the newly selected topic and load its accumulated time
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

// Save time when going home
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

window.swFormat = swFormat;
window.saveStopwatchToTopic = saveStopwatchToTopic;
window.savePDFPageTime = savePDFPageTime;
window.loadPDFPageTime = loadPDFPageTime;
window.getTopicTotalTime = getTopicTotalTime;