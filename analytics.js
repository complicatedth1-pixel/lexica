// analytics.js — openAnalytics, closeAnalytics, renderAnalytics, WPM calc
// Reads: window.library (synced via saveAll before opening)

'use strict';

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalSec = Math.floor(ms/1000), h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getAllPagesWithWPM() {
  const pages = [];
  window.library.forEach(book => {
    (book.treeData||[]).forEach(ch => {
      (ch.topics||[]).forEach(tp => {
        const timeSpentMs = tp.timeSpent || 0;
        const timeSpentSec = timeSpentMs / 1000;
        let text = '';
        (tp.sections||[]).forEach(sec => { if (sec.content) { const tmp = document.createElement('div'); tmp.innerHTML = sec.content; text += ' ' + tmp.textContent; } });
        text = text.trim();
        const wc = text ? text.split(/\s+/).filter(Boolean).length : (tp.wordCount || 0);
        const wpm = (timeSpentSec > 5 && wc > 0) ? Math.round((wc/timeSpentSec)*60) : null;
        pages.push({ pageName: tp.name, bookName: book.name, chapterName: ch.name, wordCount: wc, timeSpentMs, timeSpentSec, wpm });
      });
    });
  });
  return pages;
}

function openAnalytics() {
  saveAll(); // sync active book before reading library
  renderAnalytics();
  document.getElementById('analyticsPage').classList.add('visible');
  document.getElementById('homepage').classList.add('hidden');
}

function closeAnalytics() {
  document.getElementById('analyticsPage').classList.remove('visible');
  document.getElementById('homepage').classList.remove('hidden');
  renderHomepage();
}

function renderAnalytics() {
  let totalChapters = 0, totalPages = 0, totalTimeMs = 0;
  window.library.forEach(book => {
    const chapters = book.treeData || [];
    totalChapters += chapters.length;
    chapters.forEach(ch => {
      totalPages += (ch.topics||[]).length;
      (ch.topics||[]).forEach(tp => { totalTimeMs += tp.timeSpent || 0; });
    });
  });

  document.getElementById('analyticsStatsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Books</div><div class="stat-card-value">${window.library.length}</div><div class="stat-card-unit">books in library</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Chapters</div><div class="stat-card-value">${totalChapters}</div><div class="stat-card-unit">across all books</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Pages</div><div class="stat-card-value">${totalPages}</div><div class="stat-card-unit">topics / pages</div></div>
    <div class="stat-card"><div class="stat-card-label">Time Spent</div><div class="stat-card-value" style="font-size:${totalTimeMs>0?'30px':'48px'}">${totalTimeMs > 0 ? formatDuration(totalTimeMs) : '—'}</div><div class="stat-card-unit">tracked time</div></div>`;

  const allPages = getAllPagesWithWPM();
  const pagesWithWpm = allPages.filter(p => p.wpm !== null && p.wpm > 0 && p.wpm < 5000);
  let avgWpm = null;
  if (pagesWithWpm.length > 0) avgWpm = Math.round(pagesWithWpm.reduce((s,p) => s+p.wpm, 0) / pagesWithWpm.length);

  document.getElementById('analyticsAvgWpm').textContent = avgWpm !== null ? avgWpm : '—';
  const wpmDesc = document.getElementById('analyticsWpmDesc');
  if (avgWpm !== null) {
    const rating = avgWpm < 100 ? 'methodical and thorough' : avgWpm < 200 ? 'steady and focused' : avgWpm < 350 ? 'confident and efficient' : 'remarkably fast';
    wpmDesc.innerHTML = `Based on <strong>${pagesWithWpm.length} page${pagesWithWpm.length!==1?'s':''}</strong> with tracked time. Your pace is <strong>${rating}</strong>.`;
  } else wpmDesc.innerHTML = `No time data yet. Use the <strong>stopwatch ▶</strong> while reading to track your speed.`;

  const buildTable = (rows, isFast) => {
    if (!rows.length) return `<div class="analytics-empty">No pages with tracked time yet.</div>`;
    return `<table class="analytics-table"><thead><tr><th>#</th><th>Page</th><th>Book</th><th>WPM</th></tr></thead><tbody>${rows.map((p,i) => `<tr><td><span class="rank-badge">${i+1}</span></td><td>${escHtml(p.pageName)}</td><td style="font-size:11px;color:var(--cream2);">${escHtml(p.bookName)}</td><td><span class="wpm-pill ${isFast?'fast':'slow'}">${p.wpm}</span></td></tr>`).join('')}</tbody></table>`;
  };
  const sorted = [...pagesWithWpm].sort((a,b) => b.wpm-a.wpm);
  document.getElementById('fastestTableWrap').innerHTML = buildTable(sorted.slice(0,5), true);
  document.getElementById('slowestTableWrap').innerHTML = buildTable([...sorted].reverse().slice(0,5), false);
  if (window.innerWidth < 640) document.getElementById('analyticsTablesGrid').style.gridTemplateColumns = '1fr';
  else document.getElementById('analyticsTablesGrid').style.gridTemplateColumns = '1fr 1fr';

  const booksGrid = document.getElementById('analyticsBooksGrid');
  if (!window.library.length) { booksGrid.innerHTML = '<div class="analytics-empty">No books yet.</div>'; return; }
  booksGrid.innerHTML = [...window.library].sort((a,b) => (b.lastOpened||0)-(a.lastOpened||0)).map(book => {
    const chapters = book.treeData || []; let bookTimeMs = 0;
    const filledSec = chapters.reduce((a,c) => a+(c.topics||[]).reduce((a2,t) => { bookTimeMs += t.timeSpent||0; return a2+(t.sections||[]).filter(s => s.content&&s.content.trim()).length; }, 0), 0);
    const totalSec = chapters.reduce((a,c) => a+(c.topics||[]).reduce((a2,t) => a2+(t.sections||[]).length, 0), 0);
    const pageCount = chapters.reduce((a,c) => a+(c.topics||[]).length, 0);
    const pct = totalSec > 0 ? Math.round(filledSec/totalSec*100) : 0;
    return `<div class="book-analytics-row"><div class="book-analytics-header"><div class="book-analytics-name">${escHtml(book.name)}</div><div class="book-analytics-stats"><div class="book-stat-chip"><span class="chip-val">${chapters.length}</span><span class="chip-lbl">Ch</span></div><div class="book-stat-chip"><span class="chip-val">${pageCount}</span><span class="chip-lbl">Pages</span></div><div class="book-stat-chip"><span class="chip-val">${bookTimeMs>0?formatDuration(bookTimeMs):'—'}</span><span class="chip-lbl">Time</span></div><div class="book-stat-chip"><span class="chip-val">${pct}%</span><span class="chip-lbl">Written</span></div></div></div>${totalSec>0?`<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.8rem;"><div class="book-analytics-track"><div class="book-analytics-fill" style="width:${pct}%"></div></div><span class="book-analytics-pct">${filledSec}/${totalSec} sections</span></div>`:''}</div>`;
  }).join('');
}

window.openAnalytics = openAnalytics;
window.closeAnalytics = closeAnalytics;
