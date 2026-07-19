'use strict';

window.addEventListener('DOMContentLoaded', initialiseArchive);

async function initialiseArchive() {
  const root = document.querySelector('#archiveGrid');
  try {
    const response = await fetch('puzzles/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const manifest = await response.json();
    const today = ukTodayISO();
    const results = readResults();
    root.innerHTML = '';

    [...manifest.puzzles].reverse().forEach(item => {
      const future = item.date > today;
      const complete = Boolean(results[item.date]?.completed);
      const element = future ? document.createElement('article') : document.createElement('a');
      element.className = `archive-card${future ? ' locked' : ''}${complete ? ' completed' : ''}`;
      if (!future) element.href = `index.html?date=${item.date}`;
      element.innerHTML = `
        <div class="archive-date">${escapeHtml(formatLongDate(item.date))}</div>
        <h2>#${item.daily_number} · ${escapeHtml(item.title)}</h2>
        <div class="archive-status">${future ? '🔒 Unlocks on this date' : complete ? '✓ Case solved' : 'Open case file'}</div>`;
      root.appendChild(element);
    });
  } catch (error) {
    console.error(error);
    root.innerHTML = '';
    const notice = document.querySelector('#archiveNotice');
    notice.textContent = 'The archive could not be loaded. Open it through the published GitHub Pages address.';
    notice.classList.remove('hidden');
    notice.classList.add('error');
  }
}

function ukTodayISO() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readResults() {
  try { return JSON.parse(localStorage.getItem('daily-worder-results') || '{}'); }
  catch { return {}; }
}

function formatLongDate(isoDate) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London'
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}
