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

  // Questions analytics (async — fires and forgets)
  if (typeof renderQuestionsAnalytics === 'function') renderQuestionsAnalytics();
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

// ── Questions Analytics ───────────────────────────────
async function renderQuestionsAnalytics() {
  // Create/find section
  let section = document.getElementById('analyticsQuestionsSection');
  if (!section) {
    section = document.createElement('div');
    section.id = 'analyticsQuestionsSection';
    section.className = 'analytics-section qa-section';
    // Insert after analyticsBooksGrid section
    const booksSection = document.getElementById('analyticsBooksGrid').closest('.analytics-section');
    booksSection.insertAdjacentElement('afterend', section);
  }

  section.innerHTML = `
    <div class="analytics-section-title">Question <em>Analytics</em></div>
    <div class="analytics-section-sub">Performance across all practice sessions</div>

    <div class="qa-filter-row">
      <select class="qa-filter-select" id="qaFilterBook" onchange="renderQuestionsAnalytics()">
        <option value="all">All Books</option>
        ${window.library.map(b => `<option value="${escHtml(b.id)}">${escHtml(b.name.length > 30 ? b.name.substring(0,28)+'…' : b.name)}</option>`).join('')}
      </select>
      <select class="qa-filter-select" id="qaFilterChapter" onchange="renderQuestionsAnalytics()">
        <option value="all">All Chapters</option>
      </select>
      <select class="qa-filter-select" id="qaFilterTopic" onchange="renderQuestionsAnalytics()">
        <option value="all">All Topics</option>
      </select>
      <div id="qaLoadingMsg" style="font-size:12px;color:#665f78;font-family:sans-serif;"></div>
    </div>

    <div id="qaContent"><div class="analytics-empty" style="padding:2rem;font-style:italic;">Loading…</div></div>
  `;

  // Populate chapter/topic dropdowns based on library
  _qaPopulateDropdowns();

  await _qaRenderContent();
}

function _qaPopulateDropdowns() {
  const bookSel    = document.getElementById('qaFilterBook');
  const chapterSel = document.getElementById('qaFilterChapter');
  const topicSel   = document.getElementById('qaFilterTopic');
  if (!bookSel || !chapterSel || !topicSel) return;

  const selectedBook = bookSel.value;
  chapterSel.innerHTML = '<option value="all">All Chapters</option>';
  topicSel.innerHTML   = '<option value="all">All Topics</option>';

  window.library.forEach(book => {
    if (selectedBook !== 'all' && book.id !== selectedBook) return;
    (book.treeData || []).forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.name.length > 28 ? ch.name.substring(0,26)+'…' : ch.name;
      chapterSel.appendChild(opt);
      (ch.topics || []).forEach(tp => {
        const topt = document.createElement('option');
        topt.value = tp.id;
        topt.dataset.chapter = ch.id;
        topt.textContent = (ch.name.substring(0,12) + ' › ' + tp.name).substring(0,36);
        topicSel.appendChild(topt);
      });
    });
  });
}

async function _qaRenderContent() {
  const bookSel    = document.getElementById('qaFilterBook');
  const chapterSel = document.getElementById('qaFilterChapter');
  const topicSel   = document.getElementById('qaFilterTopic');
  const content    = document.getElementById('qaContent');
  const loading    = document.getElementById('qaLoadingMsg');
  if (!content) return;

  const filterBook    = bookSel    ? bookSel.value    : 'all';
  const filterChapter = chapterSel ? chapterSel.value : 'all';
  const filterTopic   = topicSel   ? topicSel.value   : 'all';

  if (loading) loading.textContent = 'Loading…';

  const filters = {};
  if (filterBook    !== 'all') filters.book_id    = filterBook;
  if (filterChapter !== 'all') filters.chapter_id = filterChapter;
  if (filterTopic   !== 'all') filters.topic_id   = filterTopic;

  const results = await qLoadResults({ ...filters, limit: 500 });

  if (loading) loading.textContent = '';

  if (!results.length) {
    content.innerHTML = '<div class="analytics-empty" style="padding:2rem;font-style:italic;">No question attempts yet. Complete a test session to see analytics here.</div>';
    return;
  }

  // ── Compute stats ──
  const total    = results.length;
  const correct  = results.filter(r => r.correct).length;
  const pct      = Math.round((correct / total) * 100);
  const avgTime  = Math.round(results.reduce((s,r) => s + (r.time_taken||0), 0) / total);

  // By type
  const byType = {};
  results.forEach(r => {
    const t = r.question_type || 'direct';
    if (!byType[t]) byType[t] = { c: 0, t: 0 };
    byType[t].t++;
    if (r.correct) byType[t].c++;
  });

  // By difficulty
  const byDiff = {};
  results.forEach(r => {
    const d = r.difficulty || 1;
    if (!byDiff[d]) byDiff[d] = { c: 0, t: 0 };
    byDiff[d].t++;
    if (r.correct) byDiff[d].c++;
  });

  // By tag
  const byTag = {};
  results.forEach(r => {
    (r.tags || []).forEach(tag => {
      if (!byTag[tag]) byTag[tag] = { c: 0, t: 0 };
      byTag[tag].t++;
      if (r.correct) byTag[tag].c++;
    });
  });

  // ── Render ──
  const typeColors  = { direct: '#60a5fa', statement: '#c084fc', infer: '#fb923c' };
  const typeLabels  = { direct: 'Direct', statement: 'Statement', infer: 'Inference' };
  const diffLabels  = { 1:'D1 — Direct fact', 2:'D2 — Statement (old)', 3:'D3 — Statement (new)', 4:'D4 — Inference' };
  const diffColors  = { 1:'#4ade80', 2:'#60a5fa', 3:'#c084fc', 4:'#fb923c' };

  const scoreClass = pct >= 70 ? '#6adf6a' : pct >= 40 ? '#d4a060' : '#ff8a8a';

  const typeBars = Object.entries(byType).map(([type, s]) => {
    const p = Math.round((s.c / s.t) * 100);
    const col = typeColors[type] || '#887fa0';
    return `<div class="qa-bar-row">
      <span class="qa-bar-label">${typeLabels[type]||type}</span>
      <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
      <span class="qa-bar-pct" style="color:${col};">${p}%</span>
      <span class="qa-bar-count">${s.c}/${s.t}</span>
    </div>`;
  }).join('');

  const diffBars = [1,2,3,4].filter(d => byDiff[d]).map(d => {
    const s = byDiff[d];
    const p = Math.round((s.c / s.t) * 100);
    const col = diffColors[d];
    return `<div class="qa-bar-row">
      <span class="qa-bar-label">${diffLabels[d]}</span>
      <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
      <span class="qa-bar-pct" style="color:${col};">${p}%</span>
      <span class="qa-bar-count">${s.c}/${s.t}</span>
    </div>`;
  }).join('');

  const tagBars = Object.entries(byTag)
    .sort((a,b) => b[1].t - a[1].t)
    .map(([key, s]) => {
      const cat = window.HL_CAT_MAP && window.HL_CAT_MAP[key];
      const label = cat ? cat.label : key;
      const col = cat ? cat.color : '#887fa0';
      const p = Math.round((s.c / s.t) * 100);
      return `<div class="qa-bar-row">
        <span class="qa-bar-label">✦ ${escHtml(label)}</span>
        <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
        <span class="qa-bar-pct" style="color:${col};">${p}%</span>
        <span class="qa-bar-count">${s.c}/${s.t}</span>
      </div>`;
    }).join('');

  // Per-book breakdown when viewing all
  let bookBreakdownHTML = '';
  if (filterBook === 'all') {
    const byBook = {};
    results.forEach(r => {
      if (!byBook[r.book_id]) byBook[r.book_id] = { c: 0, t: 0, name: r.book_id };
      byBook[r.book_id].t++;
      if (r.correct) byBook[r.book_id].c++;
    });
    // Enrich with book names
    window.library.forEach(b => { if (byBook[b.id]) byBook[b.id].name = b.name; });
    const bookRows = Object.values(byBook).sort((a,b) => b.t - a.t).map(s => {
      const p = Math.round((s.c / s.t) * 100);
      const col = p >= 70 ? '#6adf6a' : p >= 40 ? '#d4a060' : '#ff8a8a';
      return `<div class="qa-bar-row">
        <span class="qa-bar-label">${escHtml((s.name||'').substring(0,20))}</span>
        <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
        <span class="qa-bar-pct" style="color:${col};">${p}%</span>
        <span class="qa-bar-count">${s.c}/${s.t}</span>
      </div>`;
    }).join('');
    if (bookRows) bookBreakdownHTML = `
      <div style="margin-bottom:2rem;">
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.5rem;">By Book</div>
        ${bookRows}
      </div>`;
  }

  // Per-chapter breakdown when a book is selected
  let chapterBreakdownHTML = '';
  if (filterBook !== 'all' && filterChapter === 'all') {
    const byCh = {};
    results.forEach(r => {
      if (!byCh[r.chapter_id]) byCh[r.chapter_id] = { c: 0, t: 0, name: r.chapter_id };
      byCh[r.chapter_id].t++;
      if (r.correct) byCh[r.chapter_id].c++;
    });
    const book = window.library.find(b => b.id === filterBook);
    if (book) {
      (book.treeData || []).forEach(ch => {
        if (byCh[ch.id]) byCh[ch.id].name = ch.name;
      });
    }
    const chRows = Object.values(byCh).sort((a,b) => b.t - a.t).map(s => {
      const p = Math.round((s.c / s.t) * 100);
      const col = p >= 70 ? '#6adf6a' : p >= 40 ? '#d4a060' : '#ff8a8a';
      return `<div class="qa-bar-row">
        <span class="qa-bar-label">${escHtml((s.name||'').substring(0,22))}</span>
        <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
        <span class="qa-bar-pct" style="color:${col};">${p}%</span>
        <span class="qa-bar-count">${s.c}/${s.t}</span>
      </div>`;
    }).join('');
    if (chRows) chapterBreakdownHTML = `
      <div style="margin-bottom:2rem;">
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.5rem;">By Chapter</div>
        ${chRows}
      </div>`;
  }

  // Per-topic breakdown when a chapter is selected
  let topicBreakdownHTML = '';
  if (filterChapter !== 'all' && filterTopic === 'all') {
    const byTp = {};
    results.forEach(r => {
      if (!byTp[r.topic_id]) byTp[r.topic_id] = { c: 0, t: 0, name: r.topic_id };
      byTp[r.topic_id].t++;
      if (r.correct) byTp[r.topic_id].c++;
    });
    const book = window.library.find(b => b.id === filterBook);
    if (book) {
      (book.treeData || []).forEach(ch => {
        (ch.topics || []).forEach(tp => {
          if (byTp[tp.id]) byTp[tp.id].name = tp.name;
        });
      });
    }
    const tpRows = Object.values(byTp).sort((a,b) => b.t - a.t).map(s => {
      const p = Math.round((s.c / s.t) * 100);
      const col = p >= 70 ? '#6adf6a' : p >= 40 ? '#d4a060' : '#ff8a8a';
      return `<div class="qa-bar-row">
        <span class="qa-bar-label">${escHtml((s.name||'').substring(0,22))}</span>
        <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${p}%;background:${col};"></div></div>
        <span class="qa-bar-pct" style="color:${col};">${p}%</span>
        <span class="qa-bar-count">${s.c}/${s.t}</span>
      </div>`;
    }).join('');
    if (tpRows) topicBreakdownHTML = `
      <div style="margin-bottom:2rem;">
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.5rem;">By Topic</div>
        ${tpRows}
      </div>`;
  }

  content.innerHTML = `
    <div class="qa-stat-grid">
      <div class="qa-stat-card">
        <div class="qa-stat-val" style="color:${scoreClass};">${pct}%</div>
        <div class="qa-stat-lbl">Overall Score</div>
      </div>
      <div class="qa-stat-card">
        <div class="qa-stat-val">${total}</div>
        <div class="qa-stat-lbl">Attempted</div>
      </div>
      <div class="qa-stat-card">
        <div class="qa-stat-val">${correct}</div>
        <div class="qa-stat-lbl">Correct</div>
      </div>
      <div class="qa-stat-card">
        <div class="qa-stat-val">${avgTime}s</div>
        <div class="qa-stat-lbl">Avg Time/Q</div>
      </div>
    </div>

    ${bookBreakdownHTML}
    ${chapterBreakdownHTML}
    ${topicBreakdownHTML}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:2rem;">
      <div>
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.8rem;">By Question Type</div>
        ${typeBars || '<div class="analytics-empty">No data</div>'}
      </div>
      <div>
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.8rem;">By Difficulty</div>
        ${diffBars || '<div class="analytics-empty">No data</div>'}
      </div>
    </div>

    ${tagBars ? `
      <div style="margin-bottom:2rem;">
        <div class="analytics-section-title" style="font-size:18px;margin-bottom:0.8rem;">By Category (Tags)</div>
        ${tagBars}
      </div>` : ''}
  `;
}

window.openAnalytics = openAnalytics;
window.closeAnalytics = closeAnalytics;
window.confirmPage = confirmPage;
window.unconfirmPage = unconfirmPage;
window.confirmAllUnconfirmed = confirmAllUnconfirmed;
window.confirmFromFilter = confirmFromFilter;
window.renderQuestionsAnalytics = renderQuestionsAnalytics;
window._qaRenderContent = _qaRenderContent;