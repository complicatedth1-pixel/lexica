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

function getAllPagesWithWPM(confirmedOnly = false) {
  const pages = [];
  window.library.forEach(book => {
    if (!book.isPDFViewer) {
      (book.treeData||[]).forEach(ch => {
        (ch.topics||[]).forEach(tp => {
          if (confirmedOnly && tp.confirmed !== true) return;
          const timeSpentMs = tp.timeSpent || 0;
          const timeSpentSec = timeSpentMs / 1000;
          let text = '';
          (tp.sections||[]).forEach(sec => {
            if (sec.content) { const tmp = document.createElement('div'); tmp.innerHTML = sec.content; text += ' ' + tmp.textContent; }
          });
          text = text.trim();
          const wc = text ? text.split(/\s+/).filter(Boolean).length : (tp.wordCount || 0);
          const wpm = (timeSpentSec > 5 && wc > 0) ? Math.round((wc/timeSpentSec)*60) : null;
          pages.push({ pageName: tp.name, bookName: book.name, chapterName: ch.name, wordCount: wc, timeSpentMs, timeSpentSec, wpm, isPDF: false, confirmed: tp.confirmed === true, bookId: book.id, topicId: tp.id });
        });
      });
    }
    if (book.isPDFViewer && book.pageTimes) {
      const WORDS_PER_PDF_PAGE = 250;
      Object.entries(book.pageTimes).forEach(([pageNum, timeSpentMs]) => {
        if (!timeSpentMs || timeSpentMs <= 0) return;
        const isConfirmed = !!(book.pageConfirmed && book.pageConfirmed[pageNum]);
        if (confirmedOnly && !isConfirmed) return;
        const timeSpentSec = timeSpentMs / 1000;
        const wc = WORDS_PER_PDF_PAGE;
        const wpm = (timeSpentSec > 5) ? Math.round((wc / timeSpentSec) * 60) : null;
        pages.push({ pageName: `Page ${pageNum}`, bookName: book.name, chapterName: '', wordCount: wc, timeSpentMs, timeSpentSec, wpm, isPDF: true, pageNum: parseInt(pageNum), confirmed: isConfirmed, bookId: book.id, topicId: null });
      });
    }
  });
  return pages;
}

function getAllUnconfirmedPages() {
  // Pages where stopwatch was used (timeSpent > 0) but not confirmed
  const pages = [];
  window.library.forEach(book => {
    if (!book.isPDFViewer) {
      (book.treeData||[]).forEach(ch => {
        (ch.topics||[]).forEach(tp => {
          if (tp.confirmed === true) return;
          if ((tp.timeSpent || 0) <= 0) return;
          pages.push({ pageName: tp.name, bookName: book.name, chapterName: ch.name, timeSpentMs: tp.timeSpent || 0, bookId: book.id, chapterId: ch.id, topicId: tp.id, isPDF: false });
        });
      });
    }
    if (book.isPDFViewer && book.pageTimes) {
      Object.entries(book.pageTimes).forEach(([pageNum, timeSpentMs]) => {
        if (!timeSpentMs || timeSpentMs <= 0) return;
        if (book.pageConfirmed && book.pageConfirmed[pageNum]) return;
        pages.push({ pageName: `Page ${pageNum}`, bookName: book.name, chapterName: '', timeSpentMs, bookId: book.id, pageNum: parseInt(pageNum), isPDF: true });
      });
    }
  });
  return pages;
}

function confirmPage(bookId, topicId, pageNum) {
  const book = window.library.find(b => b.id === bookId);
  if (!book) return;
if (book.isPDFViewer && pageNum !== undefined && pageNum !== 'undefined') {
    if (!book.pageConfirmed) book.pageConfirmed = {};
    book.pageConfirmed[String(pageNum)] = true;
    saveBook(book);
    showToast('✓ Page marked as read');
    renderAnalytics();
  }
   else if (topicId) {
    let found = false;
    (book.treeData||[]).forEach(ch => { ch.topics.forEach(tp => { if (tp.id === topicId) { tp.confirmed = true; found = true; } }); });
    if (found) {
  saveBook(book);
  showToast('✓ Page marked as read');
  renderAnalytics();
}
  }
}

function unconfirmPage(bookId, topicId, pageNum) {
  const book = window.library.find(b => b.id === bookId);
  if (!book) return;
  if (book.isPDFViewer && pageNum !== undefined && pageNum !== 'undefined') {
    if (book.pageConfirmed) {
      book.pageConfirmed[String(pageNum)] = false;
      delete book.pageConfirmed[String(pageNum)];
    }
    saveBook(book);
    showToast('↩ Page moved to unconfirmed');
    renderAnalytics();
  } else if (topicId) {
    let found = false;
    (book.treeData||[]).forEach(ch => { ch.topics.forEach(tp => { if (tp.id === topicId) { tp.confirmed = false; found = true; } }); });
    if (found) {
      // Sync global treeData if this is the active book
      if (book.id === window.activeBookId && typeof treeData !== 'undefined') {
        treeData = book.treeData;
      }
      saveBook(book);
      showToast('↩ Page moved to unconfirmed');
      renderAnalytics();
    }
  }
}

function confirmAllUnconfirmed(filterBookId) {
  window.library.forEach(book => {
    if (filterBookId && book.id !== filterBookId) return;
if (!book.isPDFViewer) {
  (book.treeData||[]).forEach(ch => { ch.topics.forEach(tp => { if ((tp.timeSpent||0) > 0 && tp.confirmed !== true) tp.confirmed = true; }); });
  // Also sync global treeData if this is the active book
  if (book.id === window.activeBookId && typeof treeData !== 'undefined') {
    treeData = book.treeData;
  }
  saveBook(book);
    } else if (book.pageTimes) {
      if (!book.pageConfirmed) book.pageConfirmed = {};
      Object.keys(book.pageTimes).forEach(pg => { if (book.pageTimes[pg] > 0) book.pageConfirmed[pg] = true; });
      saveBook(book);
    }
  });
  renderAnalytics();
  showToast('✓ All unconfirmed reads marked as done');
}

function openAnalytics() {
  saveAll();
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
    if (book.isPDFViewer) {
      totalPages += book.pdfNumPages || 0;
      if (book.pageTimes) Object.values(book.pageTimes).forEach(t => { totalTimeMs += t || 0; });
    } else {
      const chapters = book.treeData || [];
      totalChapters += chapters.length;
      chapters.forEach(ch => {
        totalPages += (ch.topics||[]).length;
        (ch.topics||[]).forEach(tp => { totalTimeMs += tp.timeSpent || 0; });
      });
    }
  });

  document.getElementById('analyticsStatsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Books</div><div class="stat-card-value">${window.library.length}</div><div class="stat-card-unit">books in library</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Chapters</div><div class="stat-card-value">${totalChapters}</div><div class="stat-card-unit">across all books</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Pages</div><div class="stat-card-value">${totalPages}</div><div class="stat-card-unit">topics / pages</div></div>
    <div class="stat-card"><div class="stat-card-label">Time Spent</div><div class="stat-card-value" style="font-size:${totalTimeMs>0?'30px':'48px'}">${totalTimeMs > 0 ? formatDuration(totalTimeMs) : '—'}</div><div class="stat-card-unit">tracked time</div></div>`;

  // ── WPM — confirmed pages only ──
  const allPages = getAllPagesWithWPM(true); // confirmed only for rankings
  const pagesWithWpm = allPages.filter(p => p.wpm !== null && p.wpm > 0 && p.wpm < 5000);
  let avgWpm = null;
  if (pagesWithWpm.length > 0) avgWpm = Math.round(pagesWithWpm.reduce((s,p) => s+p.wpm, 0) / pagesWithWpm.length);

  document.getElementById('analyticsAvgWpm').textContent = avgWpm !== null ? avgWpm : '—';
  const wpmDesc = document.getElementById('analyticsWpmDesc');
  if (avgWpm !== null) {
    const rating = avgWpm < 100 ? 'methodical and thorough' : avgWpm < 200 ? 'steady and focused' : avgWpm < 350 ? 'confident and efficient' : 'remarkably fast';
    wpmDesc.innerHTML = `Based on <strong>${pagesWithWpm.length} confirmed page${pagesWithWpm.length!==1?'s':''}</strong>. Your pace is <strong>${rating}</strong>.`;
  } else {
    wpmDesc.innerHTML = `No confirmed pages with time data yet. Mark pages as ✓ Read after finishing them.`;
  }

  const buildTable = (rows, isFast) => {
    if (!rows.length) return `<div class="analytics-empty">No confirmed pages with tracked time yet.</div>`;
    return `<table class="analytics-table"><thead><tr><th>#</th><th>Page</th><th>Book</th><th>WPM</th><th></th></tr></thead><tbody>${rows.map((p,i) => `<tr>
      <td><span class="rank-badge">${i+1}</span></td>
      <td>${escHtml(p.pageName)}</td>
      <td style="font-size:11px;color:var(--cream2);">${escHtml(p.bookName)}</td>
      <td><span class="wpm-pill ${isFast?'fast':'slow'}">${p.wpm}</span></td>
      <td><button onclick="unconfirmPage('${p.bookId}','${p.topicId||''}',${p.pageNum!==undefined?p.pageNum:'undefined'})" title="Remove from rankings" style="background:rgba(220,80,80,0.1);border:1px solid rgba(220,80,80,0.25);color:#e07070;font-family:sans-serif;font-size:11px;padding:3px 8px;border-radius:3px;cursor:pointer;line-height:1;">✕</button></td>
    </tr>`).join('')}</tbody></table>`;
  };
  const sorted = [...pagesWithWpm].sort((a,b) => b.wpm-a.wpm);
  document.getElementById('fastestTableWrap').innerHTML = buildTable(sorted.slice(0,5), true);
  document.getElementById('slowestTableWrap').innerHTML = buildTable([...sorted].reverse().slice(0,5), false);
  if (window.innerWidth < 640) document.getElementById('analyticsTablesGrid').style.gridTemplateColumns = '1fr';
  else document.getElementById('analyticsTablesGrid').style.gridTemplateColumns = '1fr 1fr';

  // ── Per-book breakdown ──
  const booksGrid = document.getElementById('analyticsBooksGrid');
  if (!window.library.length) { booksGrid.innerHTML = '<div class="analytics-empty">No books yet.</div>'; return; }
  booksGrid.innerHTML = [...window.library].sort((a,b) => (b.lastOpened||0)-(a.lastOpened||0)).map(book => {
    if (book.isPDFViewer) {
      let bookTimeMs = 0;
      const pageTimesEntries = Object.entries(book.pageTimes || {});
      pageTimesEntries.forEach(([, t]) => { bookTimeMs += t || 0; });
      const pagesWithTime = pageTimesEntries.filter(([, t]) => t > 0).length;
      const totalPdfPages = book.pdfNumPages || 0;
      const confirmedCount = Object.values(book.pageConfirmed || {}).filter(Boolean).length;
      const pct = totalPdfPages > 0 ? Math.round(pagesWithTime / totalPdfPages * 100) : 0;
      return `<div class="book-analytics-row">
        <div class="book-analytics-header">
          <div class="book-analytics-name">${escHtml(book.name)} <span style="font-size:10px;color:var(--cream2);font-weight:300;">PDF</span></div>
          <div class="book-analytics-stats">
            <div class="book-stat-chip"><span class="chip-val">${totalPdfPages}</span><span class="chip-lbl">Pages</span></div>
            <div class="book-stat-chip"><span class="chip-val">${bookTimeMs>0?formatDuration(bookTimeMs):'—'}</span><span class="chip-lbl">Time</span></div>
            <div class="book-stat-chip"><span class="chip-val">${confirmedCount}</span><span class="chip-lbl">✓ Done</span></div>
            <div class="book-stat-chip"><span class="chip-val">${pct}%</span><span class="chip-lbl">Read</span></div>
          </div>
        </div>
        ${totalPdfPages > 0 ? `<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.8rem;"><div class="book-analytics-track"><div class="book-analytics-fill" style="width:${pct}%"></div></div><span class="book-analytics-pct">${pagesWithTime}/${totalPdfPages} pages timed</span></div>` : ''}
      </div>`;
    }
    const chapters = book.treeData || []; let bookTimeMs = 0;
    const filledSec = chapters.reduce((a,c) => a+(c.topics||[]).reduce((a2,t) => { bookTimeMs += t.timeSpent||0; return a2+(t.sections||[]).filter(s => s.content&&s.content.trim()).length; }, 0), 0);
    const totalSec = chapters.reduce((a,c) => a+(c.topics||[]).reduce((a2,t) => a2+(t.sections||[]).length, 0), 0);
    const pageCount = chapters.reduce((a,c) => a+(c.topics||[]).length, 0);
    const confirmedCount = chapters.reduce((a,c) => a+(c.topics||[]).filter(t => t.confirmed === true).length, 0);
    const pct = totalSec > 0 ? Math.round(filledSec/totalSec*100) : 0;
    return `<div class="book-analytics-row"><div class="book-analytics-header"><div class="book-analytics-name">${escHtml(book.name)}</div><div class="book-analytics-stats"><div class="book-stat-chip"><span class="chip-val">${chapters.length}</span><span class="chip-lbl">Ch</span></div><div class="book-stat-chip"><span class="chip-val">${pageCount}</span><span class="chip-lbl">Pages</span></div><div class="book-stat-chip"><span class="chip-val">${bookTimeMs>0?formatDuration(bookTimeMs):'—'}</span><span class="chip-lbl">Time</span></div><div class="book-stat-chip"><span class="chip-val">${confirmedCount}</span><span class="chip-lbl">✓ Done</span></div><div class="book-stat-chip"><span class="chip-val">${pct}%</span><span class="chip-lbl">Written</span></div></div></div>${totalSec>0?`<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.8rem;"><div class="book-analytics-track"><div class="book-analytics-fill" style="width:${pct}%"></div></div><span class="book-analytics-pct">${filledSec}/${totalSec} sections</span></div>`:''}</div>`;
  }).join('');

  // ── Unconfirmed Reads section ──
  renderUnconfirmedSection();
}

function renderUnconfirmedSection() {
  let el = document.getElementById('analyticsUnconfirmedSection');
  if (!el) {
    el = document.createElement('div');
    el.id = 'analyticsUnconfirmedSection';
    el.className = 'analytics-section';
    document.getElementById('analyticsBooksGrid').closest('.analytics-section').insertAdjacentElement('afterend', el);
  }

  const unconfirmed = getAllUnconfirmedPages();
  if (!unconfirmed.length) {
    el.innerHTML = '';
    return;
  }

  // Get unique books for filter dropdown
  const bookNames = [...new Set(unconfirmed.map(p => p.bookName))];
  const bookOptions = ['All Books', ...bookNames].map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');

  el.innerHTML = `
    <div class="analytics-section-title">Unconfirmed <em>Reads</em></div>
    <div class="analytics-section-sub">Pages where the stopwatch ran but you haven't confirmed completion. These are excluded from WPM rankings.</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">
      <select id="unconfirmedBookFilter" style="background:var(--glass2);border:1px solid var(--border-color);color:var(--cream);font-family:'Outfit',sans-serif;font-size:12px;padding:6px 10px;border-radius:4px;outline:none;cursor:pointer;min-height:36px;">
        ${bookOptions}
      </select>
      <button id="confirmSelectedBtn" onclick="confirmFromFilter()" style="background:rgba(90,180,90,0.15);border:1px solid rgba(90,180,90,0.3);color:#80d880;font-family:sans-serif;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;min-height:36px;">✓ Mark Filtered as Done</button>
      <button onclick="confirmAllUnconfirmed(null)" style="background:rgba(212,135,42,0.12);border:1px solid rgba(212,135,42,0.25);color:#d4a060;font-family:sans-serif;font-size:12px;padding:6px 14px;border-radius:4px;cursor:pointer;min-height:36px;">✓ Mark All as Done</button>
    </div>
    <div class="analytics-table-wrap" id="unconfirmedTableWrap"></div>
  `;

  renderUnconfirmedTable(unconfirmed);

  document.getElementById('unconfirmedBookFilter').addEventListener('change', () => {
    const sel = document.getElementById('unconfirmedBookFilter').value;
    const filtered = sel === 'All Books' ? unconfirmed : unconfirmed.filter(p => p.bookName === sel);
    renderUnconfirmedTable(filtered);
  });
}

function renderUnconfirmedTable(rows) {
  const wrap = document.getElementById('unconfirmedTableWrap');
  if (!wrap) return;
  if (!rows.length) { wrap.innerHTML = '<div class="analytics-empty">No unconfirmed pages for this selection.</div>'; return; }
  wrap.innerHTML = `<table class="analytics-table">
    <thead><tr><th>Page</th><th>Book</th><th>Chapter</th><th>Time Spent</th><th>Action</th></tr></thead>
    <tbody>${rows.map(p => `<tr>
      <td>${escHtml(p.pageName)}</td>
      <td style="font-size:11px;color:var(--cream2);">${escHtml(p.bookName)}</td>
      <td style="font-size:11px;color:var(--cream2);">${escHtml(p.chapterName||'—')}</td>
      <td>${formatDuration(p.timeSpentMs)}</td>
      <td><button onclick="confirmPage('${p.bookId}','${p.topicId||''}',${p.pageNum!==undefined?p.pageNum:'undefined'})" style="background:rgba(90,180,90,0.12);border:1px solid rgba(90,180,90,0.25);color:#80d880;font-family:sans-serif;font-size:11px;padding:3px 9px;border-radius:3px;cursor:pointer;">✓ Done</button></td>
    </tr>`).join('')}
    </tbody>
  </table>`;
}

function confirmFromFilter() {
  const sel = document.getElementById('unconfirmedBookFilter')?.value;
  if (!sel || sel === 'All Books') { confirmAllUnconfirmed(null); return; }
  const book = window.library.find(b => b.name === sel);
  if (book) confirmAllUnconfirmed(book.id);
}

window.openAnalytics = openAnalytics;
window.closeAnalytics = closeAnalytics;
window.confirmPage = confirmPage;
window.unconfirmPage = unconfirmPage;
window.confirmAllUnconfirmed = confirmAllUnconfirmed;
window.confirmFromFilter = confirmFromFilter;