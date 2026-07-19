'use strict';

let CASE = null;
let MANIFEST = null;
let targets = [];
let targetLookup = new Map();
let storageKey = '';
let timerHandle = null;
let timerStartedAt = null;

const state = {
  foundKeys: new Set(),
  foundVictim: false,
  active: null,
  clickStart: null,
  toastTimer: null,
  suppressClick: false,
  elapsed: 0,
  completed: false,
  revealed: false
};

const $ = selector => document.querySelector(selector);
const pathKey = cells => cells.map(([r, c]) => `${r},${c}`).join('|');
const reversePathKey = cells => [...cells].reverse().map(([r, c]) => `${r},${c}`).join('|');
const normalise = value => String(value || '').toUpperCase().replace(/[^A-Z]/g, '');

window.addEventListener('DOMContentLoaded', initialise);
window.addEventListener('beforeunload', saveProgress);

async function initialise() {
  try {
    MANIFEST = await fetchJson('puzzles/manifest.json');
    const today = ukTodayISO();
    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get('date') || today;
    const entries = MANIFEST.puzzles;
    const exact = entries.find(item => item.date === requestedDate);

    let selected = exact;
    if (requestedDate > today) {
      showFatal(`That case is still locked. It will open on ${formatLongDate(requestedDate)}.`);
      return;
    }

    if (!selected) {
      const published = entries.filter(item => item.date <= today);
      if (!published.length) {
        showFatal(`The first Daily Worder opens on ${formatLongDate(MANIFEST.launch_date)}.`);
        return;
      }
      selected = published[published.length - 1];
      showNotice(`No case has been scheduled for ${formatLongDate(requestedDate)}. The latest published case is shown instead.`);
    }

    CASE = await fetchJson(`puzzles/${selected.date}.json`);
    storageKey = `daily-worder:${CASE.date}`;
    buildTargets();
    restoreProgress();
    render();
    restoreMarks();
    updateUI();
    updateNavigation(today);
    updateStreak();
    startTimer();
    attachControls();

    $('#loading').classList.add('hidden');
    $('#puzzleApp').classList.remove('hidden');
  } catch (error) {
    console.error(error);
    showFatal('The puzzle files could not be loaded. On a computer, open the site through GitHub Pages rather than directly from the folder.');
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function ukTodayISO() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildTargets() {
  targets = [];
  targetLookup = new Map();
  CASE.grids.forEach((grid, gridIndex) => {
    Object.entries(grid.word_cells).forEach(([word, cells]) => {
      targets.push({ type: 'word', word, gridIndex, cells, key: `word:${gridIndex}:${word}` });
    });
    if (grid.victim_word_cells.length) {
      targets.push({ type: 'victim', word: CASE.victim, gridIndex, cells: grid.victim_word_cells, key: `victim:${gridIndex}` });
    }
  });
  targets.forEach(target => {
    targetLookup.set(`${target.gridIndex}|${pathKey(target.cells)}`, target);
    targetLookup.set(`${target.gridIndex}|${reversePathKey(target.cells)}`, target);
  });
}

function render() {
  document.title = `Daily Worder #${CASE.daily_number} — ${CASE.title}`;
  $('#caseNumber').textContent = `Daily Worder #${CASE.daily_number}`;
  $('#caseTitle').textContent = CASE.title;
  $('#puzzleDate').textContent = formatLongDate(CASE.date);
  $('#difficultyLabel').textContent = titleCase(CASE.difficulty || 'medium');
  renderGrids();
  renderLists();
  fillAnswerControls();

  $('#weaponAnswer').value = state.answers?.weapon || '';
  $('#killerAnswer').value = state.answers?.killer || '';
  $('#victimAnswer').value = state.answers?.victim || '';
  $('#sceneAnswer').value = state.answers?.scene || '';
}

function renderGrids() {
  const root = $('#grids');
  root.innerHTML = '';
  CASE.grids.forEach((grid, gridIndex) => {
    const card = document.createElement('article');
    card.className = 'grid-card';
    card.innerHTML = `<div class="location">${escapeHtml(grid.title)}</div>`;

    const board = document.createElement('div');
    board.className = 'letter-grid';
    board.dataset.gridIndex = gridIndex;
    board.setAttribute('aria-label', `${grid.title} word-search grid`);

    const circled = new Set(grid.circle_cells.map(([r, c]) => `${r},${c}`));
    grid.grid.forEach((row, r) => row.forEach((letter, c) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (circled.has(`${r},${c}`)) cell.classList.add('circled');
      cell.dataset.gridIndex = gridIndex;
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.textContent = letter;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `${letter}, row ${r + 1}, column ${c + 1}`);
      board.appendChild(cell);
    }));

    board.addEventListener('pointerdown', beginPointerSelection);
    board.addEventListener('click', handleCellClick);
    card.appendChild(board);
    root.appendChild(card);
  });

  document.addEventListener('pointermove', movePointerSelection, { passive: false });
  document.addEventListener('pointerup', endPointerSelection);
  document.addEventListener('pointercancel', cancelPointerSelection);
}

function renderLists() {
  makeWordList($('#evidenceList'), CASE.evidence);
  makeWordList($('#suspectList'), CASE.suspects);
}

function makeWordList(root, words) {
  root.innerHTML = '';
  words.forEach(word => {
    const li = document.createElement('li');
    li.dataset.word = word;
    li.innerHTML = `<span>☐ ${escapeHtml(titleCase(word))}</span><small class="count">Not found</small>`;
    root.appendChild(li);
  });
}

function fillAnswerControls() {
  fillSelect($('#weaponAnswer'), 'Choose evidence…', CASE.evidence);
  fillSelect($('#killerAnswer'), 'Choose suspect…', CASE.suspects);
  fillSelect($('#sceneAnswer'), 'Choose location…', CASE.grids.map(grid => grid.title));
}

function fillSelect(select, placeholder, values) {
  select.innerHTML = '';
  select.add(new Option(placeholder, ''));
  values.forEach(value => select.add(new Option(titleCase(value), value)));
}

function attachControls() {
  $('#checkAnswer').addEventListener('click', checkAnswer);
  $('#resetPuzzle').addEventListener('click', resetPuzzle);
  $('#revealAnswer').addEventListener('click', revealAnswer);
  $('#shareResult').addEventListener('click', shareResult);
  $('#victimAnswer').addEventListener('keydown', event => { if (event.key === 'Enter') checkAnswer(); });
  ['weaponAnswer', 'killerAnswer', 'victimAnswer', 'sceneAnswer'].forEach(id => {
    $(`#${id}`).addEventListener('change', saveProgress);
    $(`#${id}`).addEventListener('input', saveProgress);
  });
}

function beginPointerSelection(event) {
  if (state.completed) return;
  const cell = event.target.closest('.cell');
  if (!cell || event.button > 0) return;
  event.preventDefault();
  state.active = {
    pointerId: event.pointerId,
    gridIndex: Number(cell.dataset.gridIndex),
    start: [Number(cell.dataset.row), Number(cell.dataset.col)],
    current: [Number(cell.dataset.row), Number(cell.dataset.col)],
    moved: false
  };
  updatePreview();
}

function movePointerSelection(event) {
  if (!state.active || state.active.pointerId !== event.pointerId) return;
  event.preventDefault();
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const cell = element && element.closest('.cell');
  if (!cell || Number(cell.dataset.gridIndex) !== state.active.gridIndex) return;
  const current = [Number(cell.dataset.row), Number(cell.dataset.col)];
  if (current[0] !== state.active.current[0] || current[1] !== state.active.current[1]) {
    state.active.current = current;
    state.active.moved = true;
    updatePreview();
  }
}

function endPointerSelection(event) {
  if (!state.active || state.active.pointerId !== event.pointerId) return;
  const active = state.active;
  state.active = null;
  clearPreview();
  if (active.moved) {
    state.suppressClick = true;
    const cells = lineCells(active.start, active.current);
    if (cells.length > 1) submitSelection(active.gridIndex, cells);
  }
}

function cancelPointerSelection() {
  state.active = null;
  clearPreview();
}

function handleCellClick(event) {
  if (state.completed) return;
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }
  const cell = event.target.closest('.cell');
  if (!cell) return;
  const point = {
    gridIndex: Number(cell.dataset.gridIndex),
    cell: [Number(cell.dataset.row), Number(cell.dataset.col)]
  };

  if (!state.clickStart || state.clickStart.gridIndex !== point.gridIndex) {
    state.clickStart = point;
    clearPreview();
    cell.classList.add('preview');
    showToast('Start selected — tap the last letter.');
    return;
  }

  const cells = lineCells(state.clickStart.cell, point.cell);
  state.clickStart = null;
  clearPreview();
  if (cells.length > 1) submitSelection(point.gridIndex, cells);
}

function lineCells(start, end) {
  const [r1, c1] = start;
  const [r2, c2] = end;
  const drRaw = r2 - r1;
  const dcRaw = c2 - c1;
  if (!(drRaw === 0 || dcRaw === 0 || Math.abs(drRaw) === Math.abs(dcRaw))) return [];
  const steps = Math.max(Math.abs(drRaw), Math.abs(dcRaw));
  if (steps === 0) return [[r1, c1]];
  const dr = Math.sign(drRaw);
  const dc = Math.sign(dcRaw);
  return Array.from({ length: steps + 1 }, (_, i) => [r1 + dr * i, c1 + dc * i]);
}

function updatePreview() {
  clearPreview();
  if (!state.active) return;
  lineCells(state.active.start, state.active.current).forEach(([r, c]) => {
    getCell(state.active.gridIndex, r, c)?.classList.add('preview');
  });
}

function clearPreview() {
  document.querySelectorAll('.cell.preview').forEach(cell => cell.classList.remove('preview'));
}

function submitSelection(gridIndex, cells) {
  const target = targetLookup.get(`${gridIndex}|${pathKey(cells)}`);
  if (!target) {
    showToast('That is not one of the case words.');
    return;
  }

  if (target.type === 'victim') {
    if (state.foundVictim) {
      showToast(`${titleCase(CASE.victim)} is already marked.`);
      return;
    }
    state.foundVictim = true;
    markCells(target, 'victim-found');
    showToast(`Victim located in ${titleCase(CASE.grids[gridIndex].title)}.`);
  } else {
    if (state.foundKeys.has(target.key)) {
      showToast(`${titleCase(target.word)} is already marked in this grid.`);
      return;
    }
    state.foundKeys.add(target.key);
    markCells(target, 'found');
    showToast(`Found ${titleCase(target.word)} in ${titleCase(CASE.grids[gridIndex].title)}.`);
  }
  updateUI();
  saveProgress();
}

function markCells(target, className) {
  target.cells.forEach(([r, c]) => getCell(target.gridIndex, r, c)?.classList.add(className));
}

function getCell(gridIndex, row, col) {
  return document.querySelector(`.cell[data-grid-index="${gridIndex}"][data-row="${row}"][data-col="${col}"]`);
}

function restoreMarks() {
  targets.forEach(target => {
    if (target.type === 'word' && state.foundKeys.has(target.key)) markCells(target, 'found');
    if (target.type === 'victim' && state.foundVictim) markCells(target, 'victim-found');
  });
  if (state.completed) showCompletedMessage();
}

function updateUI() {
  CASE.grids.forEach((grid, gridIndex) => {
    grid.circle_cells.forEach(([r, c]) => getCell(gridIndex, r, c)?.classList.add('circled'));
  });

  targets.filter(target => target.type === 'word' && state.foundKeys.has(target.key)).forEach(target => {
    const decoys = new Set(CASE.grids[target.gridIndex].decoy_circle_cells.map(([r, c]) => `${r},${c}`));
    target.cells.forEach(([r, c]) => {
      if (decoys.has(`${r},${c}`)) getCell(target.gridIndex, r, c)?.classList.remove('circled');
    });
  });

  const foundByWord = new Map();
  targets.filter(target => target.type === 'word' && state.foundKeys.has(target.key)).forEach(target => {
    const indices = foundByWord.get(target.word) || [];
    indices.push(target.gridIndex);
    foundByWord.set(target.word, indices);
  });

  document.querySelectorAll('.word-list li').forEach(li => {
    const word = li.dataset.word;
    const indices = foundByWord.get(word) || [];
    li.classList.toggle('partial', indices.length === 1);
    li.classList.toggle('repeated', indices.length >= 2);
    li.querySelector('span').textContent = `${indices.length ? '☑' : '☐'} ${titleCase(word)}`;
    li.querySelector('.count').textContent = indices.length
      ? `Found in ${indices.map(index => titleCase(CASE.grids[index].title)).join(' and ')}`
      : 'Not found';
  });

  const wordTargets = targets.filter(target => target.type === 'word');
  $('#progressText').textContent = `${state.foundKeys.size} / ${wordTargets.length}`;
  $('#progressBar').style.width = `${wordTargets.length ? (state.foundKeys.size / wordTargets.length) * 100 : 0}%`;

  const remaining = [];
  CASE.grids.forEach((grid, gridIndex) => {
    grid.circle_cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([r, c]) => {
      const cell = getCell(gridIndex, r, c);
      if (cell?.classList.contains('circled')) remaining.push(grid.grid[r][c]);
    });
  });
  $('#circleLetters').textContent = remaining.length ? remaining.join(' ') : '—';
  updateNotes(foundByWord);
  updateStatus();
}

function updateNotes(foundByWord) {
  const notes = [];
  foundByWord.forEach((indices, word) => {
    if (indices.length >= 2) {
      notes.push(`${titleCase(word)} is repeated in ${indices.map(index => titleCase(CASE.grids[index].title)).join(' and ')}.`);
    }
  });
  if (state.foundKeys.size === targets.filter(target => target.type === 'word').length) {
    notes.push('Every checklist occurrence has been found. The remaining circled letters now identify the victim.');
  }
  if (state.foundVictim) notes.push(`The victim’s name has been located in ${titleCase(CASE.crime_scene)}.`);
  $('#notes').innerHTML = notes.length
    ? notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')
    : '<li>No repeated discoveries yet.</li>';
}

function checkAnswer() {
  const answers = readAnswers();
  const correct = {
    weapon: CASE.weapon,
    killer: CASE.killer,
    victim: normalise(CASE.victim),
    scene: CASE.crime_scene
  };
  const misses = [];
  if (answers.weapon !== correct.weapon) misses.push('murder weapon');
  if (answers.killer !== correct.killer) misses.push('murderer');
  if (normalise(answers.victim) !== correct.victim) misses.push('victim');
  if (answers.scene !== correct.scene) misses.push('crime scene');

  const box = $('#resultMessage');
  box.className = `message show ${misses.length ? 'error' : 'success'}`;
  if (misses.length) {
    box.textContent = `Not quite. Recheck the ${humanJoin(misses)}.`;
  } else {
    state.completed = true;
    stopTimer();
    if (!state.revealed) recordCompletion();
    showCompletedMessage();
    updateStreak();
    saveProgress();
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function showCompletedMessage() {
  const box = $('#resultMessage');
  box.className = 'message show success';
  box.innerHTML = `<strong>Case closed.</strong> ${titleCase(CASE.killer)} murdered ${titleCase(CASE.victim)} with the ${titleCase(CASE.weapon)} at the ${titleCase(CASE.crime_scene)}.${state.revealed ? ' The solution was revealed.' : ''}`;
}

function revealAnswer() {
  if (!window.confirm('Reveal the complete solution to this case? Revealed cases do not add to your streak.')) return;
  state.revealed = true;
  $('#weaponAnswer').value = CASE.weapon;
  $('#killerAnswer').value = CASE.killer;
  $('#victimAnswer').value = titleCase(CASE.victim);
  $('#sceneAnswer').value = CASE.crime_scene;
  targets.filter(target => target.type === 'word').forEach(target => state.foundKeys.add(target.key));
  state.foundVictim = true;
  targets.forEach(target => markCells(target, target.type === 'victim' ? 'victim-found' : 'found'));
  updateUI();
  checkAnswer();
}

function resetPuzzle() {
  if (!window.confirm('Clear all progress and answers for this case?')) return;
  stopTimer();
  state.foundKeys.clear();
  state.foundVictim = false;
  state.active = null;
  state.clickStart = null;
  state.elapsed = 0;
  state.completed = false;
  state.revealed = false;
  state.answers = {};
  localStorage.removeItem(storageKey);
  document.querySelectorAll('.cell').forEach(cell => cell.classList.remove('found', 'victim-found', 'preview'));
  $('#weaponAnswer').value = '';
  $('#killerAnswer').value = '';
  $('#victimAnswer').value = '';
  $('#sceneAnswer').value = '';
  $('#resultMessage').className = 'message';
  $('#resultMessage').textContent = '';
  updateUI();
  startTimer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function readAnswers() {
  return {
    weapon: $('#weaponAnswer')?.value || '',
    killer: $('#killerAnswer')?.value || '',
    victim: $('#victimAnswer')?.value || '',
    scene: $('#sceneAnswer')?.value || ''
  };
}

function restoreProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    state.foundKeys = new Set(saved.foundKeys || []);
    state.foundVictim = Boolean(saved.foundVictim);
    state.elapsed = Number(saved.elapsed || 0);
    state.completed = Boolean(saved.completed);
    state.revealed = Boolean(saved.revealed);
    state.answers = saved.answers || {};
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function saveProgress() {
  if (!CASE || !storageKey) return;
  const payload = {
    foundKeys: [...state.foundKeys],
    foundVictim: state.foundVictim,
    elapsed: currentElapsed(),
    completed: state.completed,
    revealed: state.revealed,
    answers: readAnswers()
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function startTimer() {
  if (state.completed) {
    updateTimerDisplay();
    return;
  }
  timerStartedAt = Date.now();
  updateTimerDisplay();
  timerHandle = window.setInterval(() => {
    updateTimerDisplay();
    if (currentElapsed() % 10 === 0) saveProgress();
  }, 1000);
}

function stopTimer() {
  if (timerStartedAt !== null) {
    state.elapsed = currentElapsed();
    timerStartedAt = null;
  }
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
  updateTimerDisplay();
}

function currentElapsed() {
  return state.elapsed + (timerStartedAt === null ? 0 : Math.floor((Date.now() - timerStartedAt) / 1000));
}

function updateTimerDisplay() {
  $('#timer').textContent = formatTime(currentElapsed());
}

function recordCompletion() {
  const results = readResults();
  results[CASE.date] = { completed: true, elapsed: currentElapsed(), daily_number: CASE.daily_number };
  localStorage.setItem('daily-worder-results', JSON.stringify(results));
}

function readResults() {
  try { return JSON.parse(localStorage.getItem('daily-worder-results') || '{}'); }
  catch { return {}; }
}

function updateStreak() {
  const results = readResults();
  const today = ukTodayISO();
  const available = MANIFEST.puzzles.filter(item => item.date <= today).map(item => item.date);
  let index = available.length - 1;
  if (available[index] === today && !results[today]?.completed) index -= 1;
  let streak = 0;
  for (; index >= 0; index -= 1) {
    if (!results[available[index]]?.completed) break;
    streak += 1;
  }
  $('#streakCount').textContent = String(streak);
}

function updateStatus() {
  $('#dailyStatus').textContent = state.completed ? (state.revealed ? 'Revealed' : 'Solved') : 'In progress';
}

function updateNavigation(today) {
  const entries = MANIFEST.puzzles;
  const index = entries.findIndex(item => item.date === CASE.date);
  const previous = entries[index - 1];
  const next = entries[index + 1];
  const previousLink = $('#previousDay');
  const nextLink = $('#nextDay');

  if (previous) previousLink.href = `index.html?date=${previous.date}`;
  else previousLink.classList.add('hidden');

  if (next && next.date <= today) nextLink.href = `index.html?date=${next.date}`;
  else nextLink.classList.add('hidden');
}

async function shareResult() {
  const status = state.completed ? (state.revealed ? 'Solution revealed' : 'Case solved') : 'Investigation in progress';
  const text = [
    `DAILY WORDER #${CASE.daily_number}`,
    `🕵️ ${status}`,
    `⏱ ${formatTime(currentElapsed())}`,
    `🔎 ${state.foundKeys.size}/${targets.filter(target => target.type === 'word').length} word placements found`,
    `🔥 Streak ${$('#streakCount').textContent}`,
    `${window.location.origin}${window.location.pathname}?date=${CASE.date}`
  ].join('\n');

  try {
    if (navigator.share) await navigator.share({ title: `Daily Worder #${CASE.daily_number}`, text });
    else await navigator.clipboard.writeText(text);
    showToast(navigator.share ? 'Share panel opened.' : 'Result copied to the clipboard.');
  } catch (error) {
    if (error?.name !== 'AbortError') copyFallback(text);
  }
}

function copyFallback(text) {
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  showToast('Result copied to the clipboard.');
}

function showNotice(message) {
  const notice = $('#siteNotice');
  notice.textContent = message;
  notice.classList.remove('hidden', 'error');
}

function showFatal(message) {
  $('#loading').classList.add('hidden');
  const notice = $('#siteNotice');
  notice.textContent = message;
  notice.classList.remove('hidden');
  notice.classList.add('error');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function formatLongDate(isoDate) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function humanJoin(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}
