// JavaScript source code

const SUPABASE_URL = 'https://tzslxobwueqwecxpowqm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tcGF06S2ICA4NNw7T0S0xw_aRee02qV';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentClassId = null;
let studentIds = [];
let saveTimer = null;
let undoStack = [];
let searchQuery = '';
let selectedStudents = new Set();
let studentNotes = {};

const REASONS = {
  '': { label: 'Присутствует', emoji: '✅', cls: '' },
  'medical': { label: 'По болезни (мед. справка)', emoji: '🏥', cls: 'medical' },
  'health_admin': { label: 'По состоянию здоровья (с разр. мед. работника/админ.)', emoji: '🩺', cls: 'health-admin' },
  'parents_family': { label: 'Заявление родителей (семейные)', emoji: '📄', cls: 'parents-family' },
  'parents_health': { label: 'Заявление родителей (по здоровью)', emoji: '📋', cls: 'parents-health' },
  'survey': { label: 'Посещение врача, медосмотр', emoji: '👨‍⚕️', cls: 'survey' },
  'sport': { label: 'Соревнования', emoji: '🏆', cls: 'sport' },
  'cultural': { label: 'Культ-массовые', emoji: '🎭', cls: 'cultural' },
  'ozdorovlenie': { label: 'Санаторий', emoji: '🌿', cls: 'ozdorovlenie' },
  'norespect': { label: 'Без уважительной', emoji: '⚠️', cls: 'norespect' },
  'other': { label: 'Другие уважительные', emoji: '❓', cls: 'other' }
};
const REASON_KEYS = ['medical', 'health_admin', 'parents_family', 'parents_health', 'survey', 'sport', 'cultural', 'ozdorovlenie', 'norespect', 'other'];
const MEDICAL_REASONS = {
  'cold': 'Простудные',
  'infectious': 'Инфекционные',
  'skin': 'Кожные',
  'injury': 'Травмы',
  'hospital': 'Больница',
  'examination': 'Обследование'
};

const LS_THEME = 'attendance_theme_v1';
const LS_ACCENT = 'attendance_accent_v1';
const REPORT_CONSECUTIVE_DAYS = 3;
const REPORT_LONG_ABSENCE_DAYS = 5;

let students = [];
let absences = {};
let schedule = { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 };
let excludedDates = [];
let specialDays = [];
let quarters = [];
let className = '';
let expandedRows = new Set();
let lastReport1 = null;
let lastReport2 = null;

const dateInput = document.getElementById('date');
const tbody = document.getElementById('tbody');
const statsEl = document.getElementById('stats');
const miniCalEl = document.getElementById('miniCalendar');
const statusDot = document.getElementById('statusDot');
const saveStatus = document.getElementById('saveStatus');

function defaultQuarters() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultSched = { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 };
  return [
    { name: '1 четверть', from: `${y}-09-01`, to: `${y}-10-30`, schedule: { ...defaultSched } },
    { name: '2 четверть', from: `${y}-11-01`, to: `${y}-12-24`, schedule: { ...defaultSched } },
    { name: '3 четверть', from: `${y+1}-01-08`, to: `${y+1}-03-23`, schedule: { ...defaultSched } },
    { name: '4 четверть', from: `${y+1}-04-01`, to: `${y+1}-05-31`, schedule: { ...defaultSched } }
  ];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateRu(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

function dateRange(from, to) {
  const res = [];
  let cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) {
    res.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return res;
}

function dowOf(str) {
  return new Date(str + 'T00:00:00').getDay();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function getSpecialDay(dateStr) {
  return specialDays.find(s => s.date === dateStr);
}

function getDayLessons(dateStr) {
  const sp = getSpecialDay(dateStr);
  if (sp) return sp.lessons;
  
  const dow = dowOf(dateStr);
  if (dow === 0 || dow === 6) return 0;
  if (excludedDates.includes(dateStr)) return 0;
  
  // Ищем четверть, в которую попадает эта дата
  const q = quarters.find(q => dateStr >= q.from && dateStr <= q.to);
  if (q && q.schedule) {
    return q.schedule[dow] || 0;
  }
  
  // Если дата вне четвертей, используем глобальное расписание (запасной вариант)
  return schedule[dow] || 0;
}

function isEducationDay(dateStr) {
  return getDayLessons(dateStr) > 0;
}

function setTheme(theme) {
  if (theme === 'auto') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('light-theme', !isDark);
  } else {
    document.body.classList.toggle('light-theme', theme === 'light');
  }
  document.querySelectorAll('.theme-btn').forEach((btn, i) => {
    const labels = ['dark', 'light', 'auto'];
    btn.classList.toggle('active', labels[i] === theme);
  });
  localStorage.setItem(LS_THEME, theme);
}

function normalizeRgb(rgbStr) {
  const [r, g, b] = String(rgbStr).split(',').map(s => s.trim());
  return `rgb(${r}, ${g}, ${b})`;
}

function setAccent(hex, rgbStr) {
  document.documentElement.style.setProperty('--primary', hex);
  document.documentElement.style.setProperty('--primary-rgb', rgbStr);
  document.documentElement.style.setProperty('--primary-hover', hex);
  document.documentElement.style.setProperty('--primary-dark', hex);
  localStorage.setItem(LS_ACCENT, JSON.stringify({ hex, rgbStr }));
  
  const target = normalizeRgb(rgbStr).replace(/\s/g, '');
  const targetRgba = `rgba(${target.slice(4, -1)},1)`;
  
  document.querySelectorAll('.color-dot').forEach(dot => {
    const current = getComputedStyle(dot).backgroundColor.replace(/\s/g, '');
    dot.classList.toggle('active', current === target || current === targetRgba);
  });
}

function loadPrefs() {
  let th = localStorage.getItem(LS_THEME) || 'light'; // По умолчанию светлая
  
  // Если сейчас зима, и пользователь не выбирал тему вручную — включаем тёмную
  const isNewYearSeason = document.body.classList.contains('newyear');
  if (isNewYearSeason && (!localStorage.getItem(LS_THEME) || localStorage.getItem(LS_THEME) === 'auto')) {
    th = 'dark';
  }
  
  let ac = null;
  try {
    ac = JSON.parse(localStorage.getItem(LS_ACCENT) || 'null');
  } catch (e) {
    ac = null;
  }
  setTheme(th);
  if (ac && ac.hex && ac.rgbStr) setAccent(ac.hex, ac.rgbStr);
}

let searchDebounce = null;
function onSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    if (q === searchQuery) return;
    searchQuery = q;
    render();
  }, 200);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  const btn = document.getElementById('loginBtn');
  err.textContent = '';
  if (!email || !pass) {
    err.textContent = 'Введите email и пароль';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Вход…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  btn.textContent = 'Войти';
  if (error) {
    err.textContent = error.message;
    return;
  }
  if (!data || !data.user) {
    err.textContent = 'Не удалось получить пользователя';
    return;
  }
  await afterLogin(data.user);
}

async function doLogout() {
  await sb.auth.signOut();

  clearTimeout(saveTimer);
  clearTimeout(searchDebounce);
  saveTimer = null;
  searchDebounce = null;

  currentUser = null;
  currentClassId = null;
  studentIds = [];
  students = [];
  absences = {};
  studentNotes = {};

  undoStack = [];
  searchQuery = '';
  selectedStudents.clear();
  expandedRows.clear();

  schedule = { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 };
  excludedDates = [];
  specialDays = [];
  quarters = [];
  className = '';

  lastReport1 = null;
  lastReport2 = null;

  activeSaves = 0;
  lastSaveError = false;
  saveChains.clear();

  statusDot.className = 'status-dot connected';
  saveStatus.textContent = '';

  const selectAll = document.getElementById('selectAll');
  if (selectAll) selectAll.checked = false;
  updateBulkPanel();

  updateHeader();

  document.getElementById('loginScreen').style.display = 'flex';
  document.querySelector('.container').style.display = 'none';
}

function openPasswordModal() {
  document.getElementById('newPassInput').value = '';
  document.getElementById('passwordBackdrop').classList.add('open');
}

async function saveNewPassword() {
  const p = document.getElementById('newPassInput').value;
  if (p.length < 6) {
    alert('Пароль должен быть минимум 6 символов');
    return;
  }
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) {
    alert(error.message);
    return;
  }
  document.getElementById('passwordBackdrop').classList.remove('open');
  toast('Пароль успешно изменён');
  await logAction('Смена пароля');
}

async function afterLogin(user) {
  currentUser = user;
  const { data: cls, error } = await sb.from('classes').select('*').eq('owner_id', user.id).order('id').limit(1);
  if (error) { toast(error.message); return; }

  let classRow;
  if (!cls || !cls.length) {
    const { data: nc, error: e2 } = await sb.from('classes').insert({ owner_id: user.id, name: '' }).select().single();
    if (e2) { toast(e2.message); return; }
    classRow = nc;
    const { error: e3 } = await sb.from('class_settings').insert({ class_id: classRow.id });
    if (e3) toast('Не удалось создать настройки класса: ' + e3.message);
  } else {
    classRow = cls[0];
  }

  currentClassId = classRow.id;
  className = classRow.name || '';

  await loadAll();

  document.getElementById('loginScreen').style.display = 'none';
  document.querySelector('.container').style.display = '';
  document.getElementById('userEmail').textContent = user.email;
  
  // --- ИСПРАВЛЕННЫЙ БЛОК ВЫБОРА ДАТЫ ---
  const today = todayStr();
  const startDay = isEducationDay(today) ? today : getLastEducationDay(today);
  dateInput.value = startDay; // Ставим правильную дату в инпут ДО вызова render()
  
  updateHeader();
  render();
  // ------------------------------------

  refreshQuarterSelect();
  initReportDates();
  loadSettingsForm();
  updateReport1Badge();
  updateReport2Badge();

  if (!isEducationDay(today)) {
    setTimeout(() => toast(`Сегодня выходной. Открыт последний учебный день: ${formatDateRu(startDay)}`), 800);
  }
}

async function loadAll() {
  statusDot.className = 'status-dot connected';

  const { data: st, error: stErr } = await sb.from('students').select('id, full_name, position, note').eq('class_id', currentClassId).order('position');
  if (stErr) {
    toast('Ошибка загрузки учеников: ' + stErr.message);
    students = [];
    studentIds = [];
    studentNotes = {};
  } else {
    students = (st || []).map(r => r.full_name);
    studentIds = (st || []).map(r => r.id);
    studentNotes = {};
    (st || []).forEach(r => { if (r.note) studentNotes[r.id] = r.note; });
  }

  absences = {};
  if (studentIds.length) {
    const { data: ab, error: abErr } = await sb.from('absences').select('*').in('student_id', studentIds);
    if (abErr) {
      toast('Ошибка загрузки пропусков: ' + abErr.message);
    } else {
      const idToIdx = new Map();
      studentIds.forEach((id, i) => idToIdx.set(String(id), i));
      (ab || []).forEach(a => {
        const idx = idToIdx.get(String(a.student_id));
        if (idx === undefined) return;
        if (!absences[a.date]) absences[a.date] = {};
        absences[a.date][idx] = {
        reason: a.reason,
        full: a.is_full_day !== false,
        from: a.lesson_from,
        to: a.lesson_to,
        comment: a.comment || '',
        medical_reason: a.medical_reason || ''
        };
      });
    }
  }

  const { data: cfg, error: cfgErr } = await sb.from('class_settings').select('*').eq('class_id', currentClassId).maybeSingle();
  if (cfgErr) {
    toast('Ошибка загрузки настроек: ' + cfgErr.message);
  } else if (cfg) {
    schedule = cfg.schedule || schedule;
    quarters = (Array.isArray(cfg.quarters) && cfg.quarters.length === 4) ? cfg.quarters : defaultQuarters();
    excludedDates = Array.isArray(cfg.excluded_dates) ? cfg.excluded_dates : [];
    specialDays = Array.isArray(cfg.special_days) ? cfg.special_days : [];
  }

  if (!quarters.length) quarters = defaultQuarters();
  if (!Object.keys(schedule).length) schedule = { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 };
}

let activeSaves = 0;
let lastSaveError = false;
const saveChains = new Map();

function beginSave() {
  activeSaves++;
  lastSaveError = false;
  statusDot.className = 'status-dot saving';
  saveStatus.textContent = 'Сохранение...';
}

function endSave(ok) {
  activeSaves = Math.max(0, activeSaves - 1);
  if (!ok) lastSaveError = true;
  if (activeSaves === 0) {
    statusDot.className = 'status-dot connected';
    if (lastSaveError) {
      saveStatus.textContent = 'Ошибка';
    } else {
      saveStatus.textContent = '✓ Сохранено';
      setTimeout(() => {
        if (saveStatus.textContent === '✓ Сохранено' && activeSaves === 0) saveStatus.textContent = '';
      }, 2000);
    }
    lastSaveError = false;
  }
}

async function saveAbsencesForDay(day) {
  if (!currentClassId || !studentIds.length) return;
  const prev = saveChains.get(day) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => doSaveAbsencesForDay(day));
  saveChains.set(day, next);
  try {
    return await next;
  } finally {
    if (saveChains.get(day) === next) saveChains.delete(day);
  }
}

async function doSaveAbsencesForDay(day) {
  beginSave();
  try {
    const dayData = absences[day] || {};
    const { data: existing, error: fetchError } = await sb.from('absences').select('id, student_id').eq('date', day).in('student_id', studentIds);

    if (fetchError) {
      console.warn(fetchError);
      toast('Ошибка загрузки данных: ' + fetchError.message);
      endSave(false);
      return;
    }

    const existingByStudent = {};
    (existing || []).forEach(e => { existingByStudent[String(e.student_id)] = e.id; });

    const toDelete = [];
    const toUpsert = [];
    studentIds.forEach((sid, idx) => {
      const a = dayData[idx];
      const key = String(sid);
      if (!a) {
        if (existingByStudent[key]) toDelete.push(existingByStudent[key]);
      } else {
        toUpsert.push({
        student_id: sid,
        date: day,
        reason: a.reason,
        is_full_day: a.full !== false,
        lesson_from: a.full === false ? a.from : null,
        lesson_to: a.full === false ? a.to : null,
        comment: a.comment || null,
        medical_reason: a.reason === 'medical' ? (a.medical_reason || null) : null
        });
      }
    });

    if (toDelete.length) {
      const { error: delError } = await sb.from('absences').delete().in('id', toDelete);
      if (delError) throw delError;
    }
    if (toUpsert.length) {
      const { error: upsertError } = await sb.from('absences').upsert(toUpsert, { onConflict: 'student_id,date' });
      if (upsertError) throw upsertError;
    }
    endSave(true);
  } catch (e) {
    console.warn(e);
    toast('Ошибка сохранения: ' + e.message);
    endSave(false);
  }
}

async function logAction(action) {
  try {
    const { error } = await sb.from('logs').insert({ user_id: currentUser.id, action });
    if (error) console.warn('logAction:', error.message);
  } catch (e) {
    console.warn('logAction exception:', e);
  }
}

function persistChange(desc = '') {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveAbsencesForDay(dateInput.value), 500);
  if (desc) logAction(desc);
}

function pushUndo(desc) {
  undoStack.push({
    date: dateInput.value,
    data: structuredClone(absences[dateInput.value] || {}),
    desc
  });
  if (undoStack.length > 20) undoStack.shift();
}

async function undoLast() {
  if (!undoStack.length) { toast('Нечего отменять'); return; }
  const state = undoStack.pop();

  if (state.type === 'interval') {
    const restoredDates = state.dates || [];
    for (const item of restoredDates) {
      absences[item.date] = structuredClone(item.data || {});
    }
    for (const item of restoredDates) {
      await saveAbsencesForDay(item.date);
    }
    const restoredDateSet = new Set(restoredDates.map(item => item.date));
    if (!restoredDateSet.has(dateInput.value) && restoredDates.length) {
      dateInput.value = restoredDates[0].date;
      expandedRows.clear();
      selectedStudents.clear();
    }
    updateBulkPanel();
  } else {
    absences[state.date] = state.data;
    if (dateInput.value !== state.date) dateInput.value = state.date;
    await saveAbsencesForDay(state.date);
  }
  render();
  toast(`Отменено: ${state.desc}`);
}

function updateHeader() {
  const safeClass = (className || '').trim();
  
  // Обновляем старый элемент в сайдбаре (если он есть)
  const classEl = document.getElementById('sideClassName');
  if (classEl) classEl.textContent = safeClass ? `${safeClass} класс` : 'Класс не указан';
  
  // Обновляем новый чип в верхней панели
  const uxChip = document.getElementById('uxClassIndicator');
  if (uxChip) {
    // Очищаем содержимое, но оставляем зеленую точку
    uxChip.innerHTML = '<span class="ux-indicator-dot"></span>' + (safeClass ? `${safeClass} класс` : 'Класс не указан');
  }

  document.title = safeClass ? `Посещаемость ${safeClass}` : 'Посещаемость';
}
function onDateChange() {
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
}

function changeDate(days) {
  const d = new Date(dateInput.value + 'T00:00:00');
  d.setDate(d.getDate() + days);
  dateInput.value = formatDate(d);
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
}

function setToday() {
  const today = todayStr();
  dateInput.value = isEducationDay(today) ? today : getLastEducationDay(today);
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
}

function getLastEducationDay(fromDateStr) {
  let d = new Date(fromDateStr + 'T00:00:00');
  for (let i = 0; i < 30; i++) {
    const str = formatDate(d);
    if (isEducationDay(str)) return str;
    d.setDate(d.getDate() - 1);
  }
  return fromDateStr; // запасной вариант
}

function collapseAllRows() {
  expandedRows.clear();
  render();
  toast('Все детали свёрнуты');
}

function renderMiniCalendar() {
  miniCalEl.innerHTML = '';
  const today = new Date();
  for (let i = -10; i <= 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const str = formatDate(d);
    const dow = d.getDay();
    const sp = getSpecialDay(str);
    const isWeekend = (dow === 0 || dow === 6) && !sp;
    const el = document.createElement('div');
    el.className = 'mini-day'
      + (str === dateInput.value ? ' active' : '')
      + (isWeekend ? ' is-weekend' : '');
    if (sp) el.classList.add('is-special');
    if (absences[str] && Object.keys(absences[str]).length > 0) el.classList.add('has-absences');
    el.innerHTML = `<span class="mini-dow">${['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][dow]}</span><span class="mini-num">${d.getDate()}</span><span class="mini-dot"></span>`;
    if (!isWeekend) {
      el.onclick = () => {
        dateInput.value = str;
        expandedRows.clear();
        selectedStudents.clear();
        updateBulkPanel();
        render();
      };
    }
    miniCalEl.appendChild(el);
  }
    // Прокручиваем календарь так, чтобы активный день был по центру
  setTimeout(() => {
    const activeDay = miniCalEl.querySelector('.mini-day.active');
    if (activeDay) {
      const containerWidth = miniCalEl.offsetWidth;
      const activeDayLeft = activeDay.offsetLeft;
      const activeDayWidth = activeDay.offsetWidth;
      
      // Вычисляем позицию для центрирования
      const scrollTo = activeDayLeft - (containerWidth / 2) + (activeDayWidth / 2);
      
      miniCalEl.scrollTo({
        left: scrollTo,
        behavior: 'smooth' // Плавная прокрутка
      });
    }
  }, 50); // Небольшая задержка, чтобы DOM успел отрисоваться
}

function render() {
  renderMiniCalendar();

  const day = getDayData();
  const total = students.length;
  const absentCount = Object.keys(day).length;
  statsEl.innerHTML = `
    <div class="stat total">
      <div class="label">Всего</div>
      <div class="value">${total}</div>
    </div>
    <div class="stat present">
      <div class="label">Присутствуют</div>
      <div class="value">${total - absentCount}</div>
    </div>
    <div class="stat absent">
      <div class="label">Отсутствуют</div>
      <div class="value">${absentCount}</div>
    </div>`;

  const today = todayStr();
  const currentQ = quarters.find(q => today >= q.from && today <= q.to) || quarters[0] || null;
  const eduDaysThisQuarter = currentQ ? getEducationDays(currentQ.from, today) : [];
  const warnNames = [];
  
  // Ищем учеников с 5+ днями (суммарно) по причине "Заявление родителей (по здоровью)"
  students.forEach((name, i) => {
    if (countDaysWithReason(i, eduDaysThisQuarter, 'parents_health') >= 5) {
      warnNames.push(name);
    }
  });
  
  const banner = document.getElementById('warningBanner');
  if (warnNames.length > 0) {
    banner.classList.add('visible');
    document.getElementById('warningText').textContent =
      `У ${warnNames.length} учеников 5+ дней пропусков по заявлению (здоровье) за текущую четверть: ${warnNames.join(', ')}`;
  } else {
    banner.classList.remove('visible');
  }

  const frag = document.createDocumentFragment();

  if (students.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5">
      <div class="empty-state">
        <span class="emoji">📭</span>Список класса пуст. Добавьте учеников через «Редактировать список».
      </div>
    </td>`;
    frag.appendChild(tr);
    tbody.innerHTML = '';
    tbody.appendChild(frag);
    return;
  }

  const lessonsToday = getDayLessons(dateInput.value);
  const sp = getSpecialDay(dateInput.value);
  let renderedCount = 0;

  students.forEach((name, i) => {
    if (searchQuery && !name.toLowerCase().includes(searchQuery)) return;
    renderedCount++;

    const cur = day[i] || null;
    const curReason = cur?.reason || '';
    const tr = document.createElement('tr');
    if (curReason) tr.className = 'r-' + curReason;

    const options = Object.entries(REASONS).map(([val, r]) =>
      `<option value="${val}"${val === curReason ? ' selected' : ''}>${r.emoji} ${r.label}</option>`
    ).join('');

    let detailHtml = '';
    if (curReason) {
      if (expandedRows.has(i)) {
        let fieldsHtml = '';
        if (lessonsToday > 0) {
          const fV = cur.full ? 1 : cur.from;
          const tV = cur.full ? lessonsToday : cur.to;
          fieldsHtml += `<div class="partial-inputs">
            <input type="number" class="partial-from" data-index="${i}" min="1" max="${lessonsToday}" value="${fV}">
            <span>—</span>
            <input type="number" class="partial-to" data-index="${i}" min="1" max="${lessonsToday}" value="${tV}">
          </div>`;
        }
        
        if (curReason === 'medical') {
          const medOptions = Object.entries(MEDICAL_REASONS).map(([val, label]) => 
            `<option value="${val}"${cur.medical_reason === val ? ' selected' : ''}>${label}</option>`
          ).join('');
          fieldsHtml += `<select class="medical-reason-select" data-index="${i}" style="margin-bottom: 8px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); font-family: inherit; font-size: 12px; width: 100%; outline: none;">
            <option value="">-- Уточните причину справки (необязательно) --</option>
            ${medOptions}
          </select>`;
        }

        fieldsHtml += `<input type="text" class="comment-input" data-index="${i}" placeholder="Комментарий (справка №...)" value="${escapeHtml(cur.comment || '')}">`;
        
        detailHtml = `<div class="row-details">
          ${fieldsHtml}
          <div class="row-details-actions">
            <button class="btn-collapse-row" data-index="${i}">✓ Свернуть</button>
          </div>
        </div>`;
      } else {
        let hint = '';
        if (lessonsToday > 0) {
          hint = cur.full ? `весь день (${lessonsToday} ур.)` : `уроки ${cur.from}–${cur.to}`;
          if (sp) hint += ' 🔔';
        } else {
          hint = 'нерабочий день';
        }
        const commentIcon = cur.comment
          ? ` · 📝 ${escapeHtml(cur.comment.substring(0, 30))}${cur.comment.length > 30 ? '…' : ''}`
          : '';
        detailHtml = `<div class="compact-info">
          <span class="compact-hint">${hint}${commentIcon}</span>
          <button class="btn-expand-row" data-index="${i}">✎ Детали</button>
        </div>`;
      }
    }

    const hasNote = studentNotes[studentIds[i]];
    const noteIcon = hasNote
      ? `<span class="note-icon" title="${escapeHtml(hasNote)}" data-index="${i}">📝</span>`
      : '';

    tr.innerHTML = `
      <td>
        <input type="checkbox" class="chk-student" data-index="${i}" ${selectedStudents.has(i) ? 'checked' : ''}>
      </td>
      <td style="color:var(--muted);font-weight:600;">${i + 1}</td>
      <td class="student-name">
        <span class="name-text" data-index="${i}">${escapeHtml(name)}</span>${noteIcon}
        <button class="btn-quick-interval" data-index="${i}" title="Добавить интервал">📅</button>
      </td>
      <td>
        <span class="badge ${curReason ? 'absent' : 'present'}">${curReason ? '🔴 Отсутствует' : '🟢 Присутствует'}</span>
      </td>
      <td>
        <select class="reason-select ${curReason ? 'v-' + curReason : ''}" data-index="${i}">${options}</select>
        ${detailHtml}
      </td>`;
    frag.appendChild(tr);
  });

  if (renderedCount === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5">
      <div class="empty-state">
        <span class="emoji">🔍</span>Ничего не найдено по запросу
      </div>
    </td>`;
    frag.appendChild(tr);
  }

  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

function setupTableDelegation() {
    tbody.addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('chk-student')) {
      toggleSelect(parseInt(t.dataset.index, 10));
    } else if (t.classList.contains('reason-select')) {
      const idx = parseInt(t.dataset.index, 10);
      const reason = t.value;
      setReason(idx, reason);
      if (!reason) expandedRows.delete(idx);
      render();
    } else if (t.classList.contains('medical-reason-select')) {
      const idx = parseInt(t.dataset.index, 10);
      setMedicalReason(idx, t.value);
    } else if (t.classList.contains('partial-from') || t.classList.contains('partial-to')) {
      const idx = parseInt(t.dataset.index, 10);
      const fromEl = tbody.querySelector(`.partial-from[data-index="${idx}"]`);
      const toEl = tbody.querySelector(`.partial-to[data-index="${idx}"]`);
      const f = fromEl ? fromEl.value : '';
      const tt = toEl ? toEl.value : '';
      setPartial(idx, f === '' ? null : parseInt(f, 10), tt === '' ? null : parseInt(tt, 10));
      render();
    } else if (t.classList.contains('comment-input')) {
      setComment(parseInt(t.dataset.index, 10), t.value);
    }
  });

  tbody.addEventListener('click', e => {
    const t = e.target;
    if (t.classList.contains('btn-expand-row')) {
      expandedRows.add(parseInt(t.dataset.index, 10));
      render();
    } else if (t.classList.contains('btn-collapse-row')) {
      expandedRows.delete(parseInt(t.dataset.index, 10));
      render();
    } else if (t.classList.contains('btn-quick-interval')) {
      e.stopPropagation();
      openIntervalModal(parseInt(t.dataset.index, 10));
    } else if (t.classList.contains('name-text') || t.classList.contains('note-icon')) {
      const idx = parseInt(t.dataset.index, 10);
      if (!Number.isNaN(idx)) openStudentStats(idx);
    }
  });
}

function markAllPresent() {
  if (!confirm('Отметить всех присутствующими? Все отметки за этот день будут удалены.')) return;
  pushUndo('Сброс дня');
  absences[dateInput.value] = {};
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  persistChange(`Сброс дня на ${formatDateRu(dateInput.value)}`);
  render();
}

function copyYesterday() {
  const cur = new Date(dateInput.value + 'T00:00:00');
  cur.setDate(cur.getDate() - 1);
  const yStr = formatDate(cur);
  const yData = absences[yStr];
  if (!yData || Object.keys(yData).length === 0) {
    toast('Вчера отсутствующих не было');
    return;
  }
  pushUndo('Копирование со вчера');
  absences[dateInput.value] = structuredClone(yData);
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  persistChange(`Копирование со вчера на ${formatDateRu(dateInput.value)}`);
  render();
  toast('Отметки скопированы со вчерашнего дня');
}

async function copyToWeek() {
  const yData = absences[dateInput.value];
  if (!yData || Object.keys(yData).length === 0) {
    toast('Сегодня отсутствующих нет');
    return;
  }

  let d = new Date(dateInput.value + 'T00:00:00');
  const daysToCopy = [];
  const savedStates = [];
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() + 1);
    const str = formatDate(d);
    if (!isEducationDay(str)) continue;
    daysToCopy.push(str);
    savedStates.push({ date: str, data: structuredClone(absences[str] || {}) });
  }

  if (!daysToCopy.length) {
    toast('В ближайшие 5 дней нет учебных дней');
    return;
  }

  undoStack.push({
    type: 'interval',
    desc: 'Копирование на 5 дней',
    dates: savedStates
  });
  if (undoStack.length > 20) undoStack.shift();

  for (const str of daysToCopy) {
    absences[str] = structuredClone(yData);
  }
  render();
  await Promise.all(daysToCopy.map(saveAbsencesForDay));
  logAction(`Копирование на 5 дней с ${formatDateRu(dateInput.value)}`);
  toast(`Скопировано на ${daysToCopy.length} учебных дней`);
}

function toggleSelectAll(chk) {
  if (chk.checked) {
    students.forEach((_, i) => selectedStudents.add(i));
  } else {
    selectedStudents.clear();
  }
  updateBulkPanel();
  render();
}

function toggleSelect(idx) {
  if (selectedStudents.has(idx)) selectedStudents.delete(idx);
  else selectedStudents.add(idx);
  updateBulkPanel();
  render();
}

function updateBulkPanel() {
  const panel = document.getElementById('bulkPanel');
  const info = document.getElementById('bulkInfo');
  if (selectedStudents.size > 0) {
    panel.classList.add('visible');
    info.textContent = `Выбрано: ${selectedStudents.size}`;
    const sel = document.getElementById('bulkReason');
    if (sel.options.length <= 1) {
      sel.innerHTML = '<option value="">-- Причина --</option>' +
        Object.entries(REASONS).filter(([k]) => k)
          .map(([k, r]) => `<option value="${k}">${r.emoji} ${r.label}</option>`).join('');
    }
  } else {
    panel.classList.remove('visible');
  }
}

function clearSelection() {
  selectedStudents.clear();
  document.getElementById('selectAll').checked = false;
  updateBulkPanel();
  render();
}

async function applyBulkReason() {
  const reason = document.getElementById('bulkReason').value;
  if (!reason) {
    toast('Выберите причину');
    return;
  }
  pushUndo('Массовое изменение статуса');
  const d = dateInput.value;
  if (!absences[d]) absences[d] = {};
  selectedStudents.forEach(idx => {
    absences[d][idx] = { reason, full: true, comment: '', medical_reason: '' };
  });
  persistChange(`Массовое изменение статуса (${REASONS[reason]?.label || reason})`);
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
  toast('Статус обновлён для выбранных');
}

function openStudentStats(idx) {
  const name = students[idx];
  const note = studentNotes[studentIds[idx]] || '';
  document.getElementById('statsTitle').textContent = name;

  let totalAbs = 0;
  const byReason = {};
  REASON_KEYS.forEach(k => byReason[k] = 0);
  Object.values(absences).forEach(day => {
    const a = day[idx];
    if (a && a.reason) {
      totalAbs++;
      byReason[a.reason] = (byReason[a.reason] || 0) + 1;
    }
  });

  const labels = {
    medical: 'Мед. справка', 
    health_admin: 'По состоянию здоровья (с разр.)', 
    parents_family: 'Заявление родителей (семейные)',
    parents_health: 'Заявление родителей (по здоровью)',
    survey: 'Посещение врача',
    sport: 'Соревнования',
    cultural: 'Культ-массовые',
    ozdorovlenie: 'Санаторий',
    norespect: 'Без уважительной',
    other: 'Иная'
  };
  const rowsHtml = REASON_KEYS.filter(k => byReason[k] > 0).map(k =>
    `<div class="stats-bar-item"><span>${labels[k]}</span><b>${byReason[k]}</b></div>`
  ).join('');

  const html = `
    <p class="hint" style="margin-bottom:12px;">
      Всего пропусков (дней): <b style="color:var(--danger); font-size:16px;">${totalAbs}</b>
    </p>
    <div class="stats-bar-student">
      ${rowsHtml || '<div class="empty-state">Пропусков нет</div>'}
    </div>
    <div class="form-group" style="margin-top:20px;">
      <label>Заметка к ученику (видна только вам)</label>
      <textarea id="studentNoteInput" style="min-height:80px;" placeholder="Например: аллергия на физкультуру...">${escapeHtml(note)}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="document.getElementById('studentStatsBackdrop').classList.remove('open')">Закрыть</button>
      <button class="btn-primary" onclick="saveStudentNote(${idx})">Сохранить заметку</button>
    </div>`;
  document.getElementById('studentStatsContent').innerHTML = html;
  document.getElementById('studentStatsBackdrop').classList.add('open');
}

async function saveStudentNote(idx) {
  const note = document.getElementById('studentNoteInput').value.trim();
  const sid = studentIds[idx];
  const { error } = await sb.from('students').update({ note }).eq('id', sid);
  if (error) {
    toast(error.message);
    return;
  }
  if (note) studentNotes[sid] = note;
  else delete studentNotes[sid];
  document.getElementById('studentStatsBackdrop').classList.remove('open');
  toast('Заметка сохранена');
  logAction(`Сохранена заметка для ${students[idx]}`);
}

function openIntervalModal(prefillIdx) {
  if (students.length === 0) {
    toast('Сначала добавьте учеников');
    return;
  }
  const sel = document.getElementById('intervalStudent');
  sel.innerHTML = students.map((name, i) => `<option value="${i}">${escapeHtml(name)}</option>`).join('');
  if (typeof prefillIdx === 'number' && prefillIdx >= 0 && prefillIdx < students.length) {
    sel.value = prefillIdx;
  }
  const reasonSel = document.getElementById('intervalReason');
  reasonSel.innerHTML = Object.entries(REASONS).filter(([k]) => k)
    .map(([k, r]) => `<option value="${k}">${r.emoji} ${r.label}</option>`).join('');
  
  const medWrap = document.getElementById('intervalMedReasonWrap');
  const medSel = document.getElementById('intervalMedReason');
  if (medWrap && medSel) {
    medSel.value = '';
    medWrap.style.display = reasonSel.value === 'medical' ? 'block' : 'none';
    reasonSel.onchange = function() {
      medWrap.style.display = this.value === 'medical' ? 'block' : 'none';
      if (this.value !== 'medical') medSel.value = '';
    };
  }

  const d = dateInput.value || todayStr();
  document.getElementById('intervalFrom').value = d;
  document.getElementById('intervalTo').value = d;
  document.getElementById('intervalComment').value = '';
  document.getElementById('intervalBackdrop').classList.add('open');
  setTimeout(() => document.getElementById('intervalFrom').focus(), 100);
}

function closeIntervalModal() {
  document.getElementById('intervalBackdrop').classList.remove('open');
}

async function saveInterval() {
  const idx = parseInt(document.getElementById('intervalStudent').value, 10);
  const reason = document.getElementById('intervalReason').value;
  const from = document.getElementById('intervalFrom').value;
  const to = document.getElementById('intervalTo').value;
  const comment = document.getElementById('intervalComment').value.trim();
  const skipNonEdu = document.getElementById('intervalSkipNonEdu').checked;
  const medEl = document.getElementById('intervalMedReason');
  const medReason = medEl ? medEl.value : '';
  
  if (!from || !to) { alert('Заполните обе даты'); return; }
  if (from > to) { alert('Дата «с» должна быть раньше или равна дате «по»'); return; }
  if (!reason) { alert('Выберите причину'); return; }
  if (!students[idx]) { alert('Ученик не найден'); return; }

  const dates = dateRange(from, to);
  const affected = dates.filter(d => !skipNonEdu || isEducationDay(d));
  if (!affected.length) { alert('В выбранном диапазоне не оказалось учебных дней'); return; }

  const desc = `Интервал для ${students[idx]} (${formatDateRu(from)}–${formatDateRu(to)})`;
  undoStack.push({
    type: 'interval',
    desc,
    dates: affected.map(date => ({
      date,
      data: structuredClone(absences[date] || {})
    }))
  });
  if (undoStack.length > 20) undoStack.shift();

  for (const d of affected) {
    if (!absences[d]) absences[d] = {};
    absences[d][idx] = { 
      reason, 
      full: true, 
      comment, 
      medical_reason: reason === 'medical' ? medReason : '' 
    };
  }
  closeIntervalModal();
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
  for (const d of affected) await saveAbsencesForDay(d);
  logAction(desc);
  toast(`Добавлено ${affected.length} дн.`);
}

function getDayData() {
  if (!absences[dateInput.value]) absences[dateInput.value] = {};
  return absences[dateInput.value];
}

function setReason(idx, reason) {
  pushUndo('Изменение статуса');
  const d = dateInput.value;
  if (!absences[d]) absences[d] = {};
  const prev = absences[d][idx];
  if (!reason) {
    delete absences[d][idx];
  } else if (prev && prev.reason && prev.full === false) {
    absences[d][idx] = { 
      reason, 
      full: false, 
      from: prev.from, 
      to: prev.to, 
      comment: prev.comment,
      medical_reason: reason === 'medical' ? (prev.medical_reason || '') : ''
    };
  } else {
    absences[d][idx] = { 
      reason, 
      full: true, 
      comment: prev ? prev.comment : '',
      medical_reason: reason === 'medical' ? (prev?.medical_reason || '') : ''
    };
  }
  persistChange(`${formatDateRu(d)}: ${students[idx]} — ${REASONS[reason]?.label || 'Присутствует'}`);
}

function setPartial(idx, from, to) {
  pushUndo('Изменение деталей');
  const d = dateInput.value;
  const cur = absences[d]?.[idx];
  if (!cur || !cur.reason) return;
  const lessonsToday = getDayLessons(d);
  const fOk = Number.isFinite(from) && from >= 1;
  const tOk = Number.isFinite(to) && to >= 1 && to >= from;
  if (!fOk || !tOk || (lessonsToday > 0 && from === 1 && to === lessonsToday)) {
    absences[d][idx] = { reason: cur.reason, full: true, comment: cur.comment || '', medical_reason: cur.medical_reason || '' };
  } else {
    absences[d][idx] = { reason: cur.reason, full: false, from, to, comment: cur.comment || '', medical_reason: cur.medical_reason || '' };
  }
  persistChange();
}

function setComment(idx, text) {
  pushUndo('Изменение комментария');
  const d = dateInput.value;
  if (!absences[d]?.[idx]) return;
  absences[d][idx].comment = text;
  persistChange();
}

function setMedicalReason(idx, medReason) {
  pushUndo('Уточнение мед. справки');
  const d = dateInput.value;
  if (absences[d]?.[idx]) {
    absences[d][idx].medical_reason = medReason;
    persistChange();
  }
}

function openEditList() {
  document.getElementById('classListEditor').value = students.join('\n');
  document.getElementById('modalBackdrop').classList.add('open');
}

async function saveClassList() {
  const lines = document.getElementById('classListEditor').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) {
    alert('Список пуст');
    return;
  }

  const { data: existing, error: exErr } = await sb.from('students').select('id, position').eq('class_id', currentClassId).order('position');
  if (exErr) {
    toast('Ошибка загрузки списка: ' + exErr.message);
    return;
  }
  const existingByPos = {};
  (existing || []).forEach(e => { existingByPos[e.position] = e.id; });

  const toUpdate = [];
  const toInsert = [];
  for (let i = 0; i < lines.length; i++) {
    if (existingByPos[i]) {
      toUpdate.push({ id: existingByPos[i], full_name: lines[i], position: i });
    } else {
      toInsert.push({ class_id: currentClassId, full_name: lines[i], position: i });
    }
  }

  const extras = (existing || []).filter(e => e.position >= lines.length).map(e => e.id);

  try {
    if (toUpdate.length) {
      const { error } = await sb.from('students').upsert(toUpdate);
      if (error) throw error;
    }
    if (toInsert.length) {
      const { error } = await sb.from('students').insert(toInsert);
      if (error) throw error;
    }
    if (extras.length) {
      const { error } = await sb.from('students').delete().in('id', extras);
      if (error) throw error;
    }
  } catch (e) {
    toast('Ошибка сохранения списка: ' + e.message);
    return;
  }

  document.getElementById('modalBackdrop').classList.remove('open');
  await loadAll();
  expandedRows.clear();
  selectedStudents.clear();
  updateBulkPanel();
  render();
  toast('Список сохранён');
  logAction('Изменён список класса');
}

function getEducationDays(from, to) {
  return dateRange(from, to).filter(d => isEducationDay(d));
}

function maxConsecutiveFull(idx, eduDays, reason = null) {
  let max = 0;
  let cur = 0;
  for (const d of eduDays) {
    const a = absences[d]?.[idx];
    const match = a && a.full && (!reason || a.reason === reason);
    if (match) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function countDaysWithReason(idx, eduDays, reason) {
  let count = 0;
  for (const d of eduDays) {
    const a = absences[d]?.[idx];
    if (a && a.full && a.reason === reason) {
      count++;
    }
  }
  return count;
}

function hasFullReason(idx, reason, eduDays) {
  return eduDays.some(d => {
    const a = absences[d]?.[idx];
    return a && a.reason === reason && a.full;
  });
}

function buildReport1(from, to, eduDays) {
  const analysis = students.map((name, idx) => {
    // «По болезни без мед. документов»: health_admin + parents_health
    const healthAdminMax = Math.max(
      maxConsecutiveFull(idx, eduDays, 'health_admin'),
      maxConsecutiveFull(idx, eduDays, 'parents_health')
    );
    return {
      name,
      anyMax: maxConsecutiveFull(idx, eduDays),
      medMax: maxConsecutiveFull(idx, eduDays, 'medical'),
      healthAdminMax: healthAdminMax,
      // «Уважительные с документами»: только parents_family
      // (parents_health уже учтён выше, в healthAdminMax)
      parentsMax: maxConsecutiveFull(idx, eduDays, 'parents_family'),
      surveyMax: maxConsecutiveFull(idx, eduDays, 'survey'),
      sportMax: maxConsecutiveFull(idx, eduDays, 'sport'),
      culturalMax: maxConsecutiveFull(idx, eduDays, 'cultural'),
      ozdMax: maxConsecutiveFull(idx, eduDays, 'ozdorovlenie'),
      norespMax: maxConsecutiveFull(idx, eduDays, 'norespect'),
      otherMax: maxConsecutiveFull(idx, eduDays, 'other')
    };
  });
  const f = pred => analysis.filter(pred).map(a => a.name);
  
  // Уважительные: 3+ дня подряд хотя бы по одной из этих причин
  // (parents_health сюда НЕ входит — он в healthAdmin4)
  const respSet = new Set([
    ...f(a => a.parentsMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.surveyMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.sportMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.culturalMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.ozdMax >= REPORT_CONSECUTIVE_DAYS)
  ]);
  
  return {
    from, to,
    total: students.length,
    s3plus: f(a => a.anyMax >= REPORT_CONSECUTIVE_DAYS),
    med4: f(a => a.medMax >= REPORT_CONSECUTIVE_DAYS),
    healthAdmin4: f(a => a.healthAdminMax >= REPORT_CONSECUTIVE_DAYS),
    resp: [...respSet],
    noresp: f(a => a.norespMax >= REPORT_CONSECUTIVE_DAYS),
    other: f(a => a.otherMax >= REPORT_CONSECUTIVE_DAYS)
  };
}

function runReport1() {
  const from = document.getElementById('report1From').value;
  const to = document.getElementById('report1To').value;
  if (!from || !to || from > to) {
    alert('Проверьте период');
    return;
  }
  const eduDays = getEducationDays(from, to);
  if (!eduDays.length) {
    document.getElementById('report1Output').innerHTML = `<div class="report-block">
      <div class="empty-state">Нет учебных дней</div>
    </div>`;
    return;
  }
  lastReport1 = buildReport1(from, to, eduDays);
  const totalForPct = lastReport1.total || 0;
  const pct = n => totalForPct ? Math.round((n / totalForPct) * 100) : 0;
  const c = (className || '').trim();
    const rows = [
    ['Всего учеников в классе', lastReport1.total, null],
    ['Пропустили 3 и более дня подряд (любая причина)', lastReport1.s3plus.length, lastReport1.s3plus],
    ['Пропустили 3 и более дня по мед. справке', lastReport1.med4.length, lastReport1.med4],
    ['Пропустили 3 и более дня по болезни без мед. документов', lastReport1.healthAdmin4.length, lastReport1.healthAdmin4],
    ['Уважительные с документами', lastReport1.resp.length, lastReport1.resp],
    ['Иная причина', lastReport1.other.length, lastReport1.other],
    ['Без уважительной причины', lastReport1.noresp.length, lastReport1.noresp]
  ];
  document.getElementById('report1Output').innerHTML = `
    <div class="report-block" id="report1Block">
      <div class="report-title-row">
        <h3>📑 Отчёт №1. Сведения об учащихся${c ? ' ' + c + ' класса' : ''}</h3>
        <button class="btn-collapse" onclick="toggleCollapse(1)">
          <span class="collapse-icon">▲</span> Свернуть
        </button>
      </div>
      <div class="report-content">
        <p class="meta">
          Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b> · Учебных дней: <b>${eduDays.length}</b>
        </p>
        <table class="report-table">
          <thead>
            <tr>
              <th>Показатель</th>
              <th style="width:80px;text-align:right">Кол-во</th>
              <th style="width:80px;text-align:right">Доля</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(([lbl, cnt, list]) => `<tr>
              <td>${lbl}${list && list.length ? '<br>' + listHtml(list) : ''}</td>
              <td class="num">${cnt}</td>
              <td class="num muted">${cnt ? pct(cnt) + '%' : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="report-actions">
          <button class="btn-secondary" onclick="exportExcel(1)">📊 Скачать Excel</button>
          <button class="btn-secondary" onclick="printReport(1, 'Сведения об учащихся', '${formatDateRu(from)} — ${formatDateRu(to)}')">🖨️ Печать / PDF</button>
        </div>
      </div>
    </div>`;
}

function buildReport2(from, to, eduDays) {
  const byReason = {};
  REASON_KEYS.forEach(k => byReason[k] = 0);
  const medBreakdown = { cold: 0, infectious: 0, skin: 0, injury: 0, hospital: 0, examination: 0, unspecified: 0 };  
  let total = 0;
  for (const d of eduDays) {
    const dayAbs = absences[d] || {};
    const lessons = getDayLessons(d);
    for (const a of Object.values(dayAbs)) {
      let n = lessons;
      if (a.full === false) {
        const f = Math.max(1, a.from);
        const t = Math.min(lessons, a.to);
        n = (t >= f) ? (t - f + 1) : 0;
      }
      if (n > 0) {
        total += n;
        byReason[a.reason] = (byReason[a.reason] || 0) + n;
        
        if (a.reason === 'medical') {
          if (a.medical_reason && medBreakdown[a.medical_reason] !== undefined) {
            medBreakdown[a.medical_reason] += n;
          } else {
            medBreakdown.unspecified += n;
          }
        }
      }
    }
  }
  const longAbs = [];
  students.forEach((name, idx) => {
    let start = null;
    let reasons = [];
    for (let i = 0; i <= eduDays.length; i++) {
      const abs = i < eduDays.length ? absences[eduDays[i]]?.[idx] : null;
      const isFull = abs && abs.reason && abs.full;
      if (isFull) {
        if (start === null) start = i;
        reasons.push(abs.reason);
      } else {
        if (start !== null && (i - start) >= REPORT_LONG_ABSENCE_DAYS) {
          longAbs.push({
            name,
            from: eduDays[start],
            to: eduDays[i - 1],
            length: i - start,
            reasons: [...new Set(reasons)]
          });
        }
        start = null;
        reasons = [];
      }
    }
  });
  return { from, to, total, byReason, longAbs, medBreakdown };
}

function runReport2() {
  const mStr = document.getElementById('report2Month').value;
  if (!mStr) {
    alert('Выберите месяц');
    return;
  }
  const [y, m] = mStr.split('-').map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  const eduDays = getEducationDays(from, to);
  if (!eduDays.length) {
    document.getElementById('report2Output').innerHTML = `<div class="report-block">
      <div class="empty-state">Нет учебных дней</div>
    </div>`;
    return;
  }
  
  lastReport2 = buildReport2(from, to, eduDays);
  const c = (className || '').trim();
    const labels = {
    medical: 'Мед. справка', 
    health_admin: 'По состоянию здоровья (с разр.)', 
    parents_family: 'Заявление родителей (все)', 
    parents_health: 'Заявление родителей (все)', 
    survey: 'Посещение врача', 
    sport: 'Соревнования', 
    cultural: 'Культ-массовые',
    ozdorovlenie: 'Санаторий',
    norespect: 'Без уважительной', 
    other: 'Иная'
  };
  
  let subRows = '';
  REASON_KEYS.forEach(k => {
    if (k === 'parents_health') return; // пропускаем, объединяем с семейными ниже
    if (k === 'medical') {
      subRows += `<tr class="sub"><td>${labels[k]}</td><td class="num">${lastReport2.byReason[k] || 0}</td></tr>`;
      const mb = lastReport2.medBreakdown;
      if (mb) {
        Object.entries(MEDICAL_REASONS).forEach(([key, label]) => {
          if (mb[key] > 0) {
            subRows += `<tr class="sub-sub"><td>— ${label}</td><td class="num">${mb[key]}</td></tr>`;
          }
        });
        if (mb.unspecified > 0) {
          subRows += `<tr class="sub-sub"><td>— Без уточнения</td><td class="num">${mb.unspecified}</td></tr>`;
        }
      }
    } else if (k === 'parents_family') {
      const totalParents = (lastReport2.byReason['parents_family'] || 0) + (lastReport2.byReason['parents_health'] || 0);
      subRows += `<tr class="sub"><td>Заявление родителей (все)</td><td class="num">${totalParents}</td></tr>`;
    } else {
      subRows += `<tr class="sub"><td>${labels[k]}</td><td class="num">${lastReport2.byReason[k] || 0}</td></tr>`;
    }
  });
  
  const longRows = lastReport2.longAbs.length
    ? lastReport2.longAbs.map((la, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(la.name)}</td>
        <td>${formatDateRu(la.from)}-${formatDateRu(la.to)}</td>
        <td>${la.reasons.map(r => REASONS[r]?.label || r).join(', ')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">🎉 Нет учащихся с 5+ днями пропусков!</td></tr>`;
    
  document.getElementById('report2Output').innerHTML = `
    <div class="report-block" id="report2Block">
      <div class="report-title-row">
        <h3>📚 Отчёт №2. Пропущенные уроки${c ? ' (' + c + ')' : ''}</h3>
        <button class="btn-collapse" onclick="toggleCollapse(2)">
          <span class="collapse-icon">▲</span> Свернуть
        </button>
      </div>
      <div class="report-content">
        <p class="meta">
          Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b>
        </p>
        <table class="report-table">
          <thead>
            <tr>
              <th>Категория</th>
              <th style="width:120px;text-align:right">Уроков</th>
            </tr>
          </thead>
          <tbody>
            <tr class="total-row">
              <td>Всего пропущено</td>
              <td class="num" style="font-size:16px">${lastReport2.total}</td>
            </tr>${subRows}
          </tbody>
        </table>
        <h4 style="margin:20px 0 10px; font-size:15px;">Учащиеся с 5+ днями подряд</h4>
        <div class="table-wrap">
          <table class="report-table exact-table">
            <thead>
              <tr>
                <th style="width: 50px;">№</th>
                <th>ФИО учащегося</th>
                <th>Дата отсутствия</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>${longRows}</tbody>
          </table>
        </div>
        <div class="report-actions">
          <button class="btn-secondary" onclick="exportExcel(2)">📊 Скачать Excel</button>
          <button class="btn-secondary" onclick="printReport(2, 'Количество пропущенных уроков', '${formatDateRu(from)} — ${formatDateRu(to)}')">🖨️ Печать / PDF</button>
        </div>
      </div>
    </div>`;
}

function runYearSummary() {
  const c = (className || '').trim();
  let rowsHtml = '';
  let hasData = false;
  quarters.forEach(q => {
    if (!q.from || !q.to) return;
    const edu = getEducationDays(q.from, q.to);
    if (!edu.length) return;
    hasData = true;
    const r = buildReport1(q.from, q.to, edu);
    rowsHtml += `<tr>
      <td>${q.name}</td>
      <td class="num">${edu.length}</td>
      <td class="num">${r.s3plus.length}</td>
      <td class="num">${r.med4.length}</td>
    </tr>`;
  });
  document.getElementById('yearOutput').innerHTML = hasData
    ? `<div class="report-block">
        <h3>📅 Сводка за учебный год ${c ? ' (' + c + ')' : ''}</h3>
        <p class="meta">Сравнение по четвертям</p>
        <table class="report-table">
          <thead>
            <tr>
              <th>Четверть</th>
              <th style="text-align:right">Учебных дней</th>
              <th style="text-align:right">3+ дня подряд</th>
              <th style="text-align:right">3+ дней по справке</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`
    : `<div class="report-block"><div class="empty-state">Нет данных</div></div>`;
}

function listHtml(arr) {
  if (!arr || !arr.length) return '';
  return `<details class="students-list">
    <summary>ФИО (${arr.length})</summary>
    <ul>${arr.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
  </details>`;
}

function toggleCollapse(n) {
  const b = document.getElementById('report' + n + 'Block');
  if (b) b.classList.toggle('collapsed');
}

function printReport(n, title, period) {
  document.getElementById('printTitle').textContent = title;
  document.getElementById('printClass').textContent = className || '—';
  document.getElementById('printPeriod').textContent = period;
  document.body.classList.add('printing-r' + n);
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing-r' + n), 300);
  }, 50);
}

function printClassList() {
  document.getElementById('printTitle').textContent = 'Список класса';
  document.getElementById('printClass').textContent = className || '—';
  document.getElementById('printPeriod').textContent = 'Дата: ' + formatDateRu(dateInput.value);
  document.body.classList.add('printing-class');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing-class'), 300);
  }, 50);
}

function exportExcel(reportNum) {
  if (reportNum === 1 && !lastReport1) return;
  if (reportNum === 2 && !lastReport2) return;
  const wb = XLSX.utils.book_new();
  const wsData = [];
  if (reportNum === 1) {
    const r = lastReport1;
    wsData.push(['Показатель', 'Кол-во', 'ФИО']);
    wsData.push(['Всего учеников', r.total, '']);
    wsData.push(['3 и более дня подряд', r.s3plus.length, r.s3plus.join(', ')]);
    wsData.push(['3 и более дня по справке', r.med4.length, r.med4.join(', ')]);
    wsData.push(['3 и более дня по болезни без мед. документов', r.healthAdmin4.length, r.healthAdmin4.join(', ')]);
    wsData.push(['Уважительные с документами', r.resp.length, r.resp.join(', ')]);
    wsData.push(['Иная причина', r.other.length, r.other.join(', ')]);
    wsData.push(['Без уважительной', r.noresp.length, r.noresp.join(', ')]);
  } else {
    wsData.push(['Учащиеся с 5+ днями подряд']);
    wsData.push(['№', 'ФИО', 'Дата', 'Причина']);
    const r = lastReport2;
    if (r.longAbs.length) {
      r.longAbs.forEach((la, i) => wsData.push([
        i + 1,
        la.name,
        `${formatDateRu(la.from)}-${formatDateRu(la.to)}`,
        la.reasons.map(x => REASONS[x]?.label).join(', ')
      ]));
    } else {
      wsData.push(['', 'Нет данных', '', '']);
    }
    wsData.push([]);
    wsData.push(['Всего пропущено уроков', r.total]);
    
    const labels = { 
      medical: 'Мед. справка', 
      ozdorovlenie: 'Санаторий', 
      health_admin: 'По состоянию здоровья (с разр.)',
      parents_family: 'Заявление родителей (все)', 
      parents_health: 'Заявление родителей (все)', 
      survey: 'Посещение врача',
      sport: 'Соревнования', 
      cultural: 'Культ-массовые', 
      norespect: 'Без уважительной', 
      other: 'Иная' 
    };
    
    REASON_KEYS.forEach(k => {
      if (k === 'parents_health') return; // пропускаем, объединяем с семейными
      if (k === 'parents_family') {
        const totalParents = (r.byReason['parents_family'] || 0) + (r.byReason['parents_health'] || 0);
        if (totalParents) wsData.push(['Заявление родителей (все)', totalParents]);
      } else if (r.byReason[k]) {
        wsData.push([labels[k], r.byReason[k]]);
        if (k === 'medical' && r.medBreakdown) {
          Object.entries(MEDICAL_REASONS).forEach(([key, label]) => {
            if (r.medBreakdown[key]) wsData.push([`  — ${label}`, r.medBreakdown[key]]);
          });
          if (r.medBreakdown.unspecified) wsData.push(['  — Без уточнения', r.medBreakdown.unspecified]);
        }
      }
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');
  XLSX.writeFile(wb, `отчёт_${reportNum}_${todayStr()}.xlsx`);
  toast('Excel скачан');
}

function loadSettingsForm() {
  document.getElementById('classNameInput').value = className;
  document.getElementById('quartersForm').innerHTML = quarters.map((q, i) => {
    const s = q.schedule || { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 };
    return `
    <div class="quarter-settings-block" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border);">
      <div class="quarter-row">
        <label>${escapeHtml(q.name)}</label>
        <input type="date" id="qFrom${i}" value="${q.from}">
        <input type="date" id="qTo${i}" value="${q.to}">
      </div>
      <div class="schedule-grid" style="margin-top: 10px;">
        <div class="schedule-item"><label>Пн</label><input type="number" id="qSched${i}_1" min="0" max="15" value="${s[1] ?? 7}"></div>
        <div class="schedule-item"><label>Вт</label><input type="number" id="qSched${i}_2" min="0" max="15" value="${s[2] ?? 7}"></div>
        <div class="schedule-item"><label>Ср</label><input type="number" id="qSched${i}_3" min="0" max="15" value="${s[3] ?? 7}"></div>
        <div class="schedule-item"><label>Чт</label><input type="number" id="qSched${i}_4" min="0" max="15" value="${s[4] ?? 7}"></div>
        <div class="schedule-item"><label>Пт</label><input type="number" id="qSched${i}_5" min="0" max="15" value="${s[5] ?? 7}"></div>
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('excludedDatesEditor').value = excludedDates.join('\n');
  renderSpecialDaysList();
}

async function saveClassName() {
  const val = document.getElementById('classNameInput').value.trim();
  const { error } = await sb.from('classes').update({ name: val }).eq('id', currentClassId);
  if (error) {
    toast('Ошибка: ' + error.message);
    return;
  }
  className = val;
  updateHeader();
  toast('Сохранено');
}

async function saveQuarters() {
  quarters = quarters.map((q, i) => {
    const newSched = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    for (let d = 1; d <= 5; d++) {
      newSched[d] = Math.max(0, parseInt(document.getElementById(`qSched${i}_${d}`).value) || 0);
    }
    return {
      ...q,
      from: document.getElementById('qFrom' + i).value,
      to: document.getElementById('qTo' + i).value,
      schedule: newSched
    };
  });
  const ok = await saveSettings();
  if (!ok) return;
  refreshQuarterSelect();
  toast('Сохранено');
}

async function saveSchedule() {
  for (let d = 1; d <= 5; d++) {
    schedule[d] = Math.max(0, parseInt(document.getElementById('sched' + d).value) || 0);
  }
  schedule[0] = 0;
  schedule[6] = 0;
  const ok = await saveSettings();
  if (ok) toast('Сохранено');
}

async function saveExcludedDates() {
  excludedDates = document.getElementById('excludedDatesEditor').value
    .split('\n').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
  document.getElementById('excludedDatesEditor').value = excludedDates.join('\n');
  const ok = await saveSettings();
  if (ok) toast('Сохранено');
}

async function fillBelarusHolidays() {
  const year = new Date().getFullYear();
  const years = [year, year + 1];
  const added = new Set(excludedDates);
  years.forEach(y => {
    added.add(`${y}-01-01`);
    added.add(`${y}-01-07`);
    added.add(`${y}-03-08`);
    added.add(`${y}-05-01`);
    added.add(`${y}-05-09`);
    added.add(`${y}-07-03`);
    added.add(`${y}-11-07`);
    added.add(`${y}-12-25`);
  });
  excludedDates = [...added].sort();
  document.getElementById('excludedDatesEditor').value = excludedDates.join('\n');
  const ok = await saveSettings();
  if (ok) toast('Праздники добавлены');
}

async function addSpecialDay() {
  const date = document.getElementById('spDate').value;
  const lessons = Math.max(1, Math.min(15, parseInt(document.getElementById('spLessons').value, 10) || 1));
  if (!date) {
    alert('Выберите дату');
    return;
  }
  if (specialDays.find(s => s.date === date)) {
    if (!confirm('Такая дата уже есть. Заменить?')) return;
    specialDays = specialDays.filter(s => s.date !== date);
  }
  specialDays.push({ date, lessons });
  specialDays.sort((a, b) => a.date.localeCompare(b.date));
  excludedDates = excludedDates.filter(d => d !== date);
  document.getElementById('excludedDatesEditor').value = excludedDates.join('\n');
  document.getElementById('spDate').value = '';
  const ok = await saveSettings();
  if (!ok) return;
  renderSpecialDaysList();
  toast('Добавлен');
}

async function removeSpecialDay(date) {
  if (!confirm('Удалить?')) return;
  specialDays = specialDays.filter(s => s.date !== date);
  const ok = await saveSettings();
  if (!ok) return;
  renderSpecialDaysList();
  toast('Удалено');
}

function renderSpecialDaysList() {
  const el = document.getElementById('specialDaysList');
  if (!specialDays.length) {
    el.innerHTML = '<div class="special-empty">Нет дней</div>';
    return;
  }
  const dowNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  el.innerHTML = specialDays.map(s => `<div class="special-item">
    <span class="special-item-date">${formatDateRu(s.date)}</span>
    <span class="special-item-dow">(${dowNames[dowOf(s.date)]})</span>
    <span class="special-item-lessons">${s.lessons} ур.</span>
    <button class="special-item-del" onclick="removeSpecialDay('${s.date}')">✕</button>
  </div>`).join('');
}

async function saveSettings() {
  if (!currentClassId) return false;
  try {
    const { error } = await sb.from('class_settings').upsert({
      class_id: currentClassId,
      schedule,
      quarters,
      excluded_dates: excludedDates,
      special_days: specialDays
    }, { onConflict: 'class_id' });
    if (error) {
      toast('Ошибка сохранения настроек: ' + error.message);
      return false;
    }
    return true;
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message);
    return false;
  }
}

function refreshQuarterSelect() {
  const sel = document.getElementById('quarterSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Вручную</option>' + quarters.map((q, i) => `<option value="${i}">${q.name}</option>`).join('');
  if (cur !== '') sel.value = cur;
}

function onQuarterChange() {
  const idx = document.getElementById('quarterSelect').value;
  if (idx === '') return;
  const q = quarters[parseInt(idx, 10)];
  if (q && q.from && q.to) {
    document.getElementById('report1From').value = q.from;
    document.getElementById('report1To').value = q.to;
    updateReport1Badge();
    if (lastReport1) runReport1();
  }
}

function onReport1DateChange() {
  document.getElementById('quarterSelect').value = '';
  updateReport1Badge();
}

function updateReport1Badge() {
  const from = document.getElementById('report1From').value;
  const to = document.getElementById('report1To').value;
  const badge = document.getElementById('report1EduBadge');
  if (!from || !to || from > to) {
    badge.textContent = '📚 —';
    return;
  }
  badge.textContent = `📚 ${getEducationDays(from, to).length} уч. дн.`;
}

function updateReport2Badge() {
  const mStr = document.getElementById('report2Month').value;
  const badge = document.getElementById('report2EduBadge');
  if (!mStr) {
    badge.textContent = '📚 —';
    return;
  }
  const [y, m] = mStr.split('-').map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  badge.textContent = `📚 ${getEducationDays(from, to).length} уч. дн.`;
}

function initReportDates() {
  const f = document.getElementById('report1From');
  const t = document.getElementById('report1To');
  const m = document.getElementById('report2Month');
  if (!f.value) {
    const today = todayStr();
    const curQ = quarters.find(q => today >= q.from && today <= q.to) || quarters[0];
    if (curQ) {
      f.value = curQ.from;
      t.value = curQ.to;
    }
  }
  if (!m.value) m.value = todayStr().slice(0, 7);
  updateReport1Badge();
  updateReport2Badge();
}

function switchReportPane(name) {
  document.querySelectorAll('.report-tab').forEach(b => b.classList.toggle('active', b.dataset.report === name));
  document.querySelectorAll('.report-pane').forEach(p => p.classList.toggle('active', p.id === 'reportPane-' + name));
}

function exportCSV() {
  const day = getDayData();
  let csv = 'Дата;№;ФИО;Статус;Причина;Комментарий\n';
  students.forEach((name, i) => {
    const a = day[i];
    const st = a ? 'Отсутствует' : 'Присутствует';
    const rs = a ? (REASONS[a.reason]?.label || '') : '';
    const cm = a && a.comment ? a.comment : '';
    const safeName = String(name).replace(/"/g, '""');
    const safeCm = String(cm).replace(/"/g, '""');
    csv += `${dateInput.value};${i + 1};"${safeName}";${st};${rs};"${safeCm}"\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `день_${dateInput.value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function switchTab(name) {
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'settings') loadSettingsForm();
  if (name === 'reports') initReportDates();
  
  // Управляем классами на body для CSS
  const body = document.body;
  body.classList.remove('tab-attendance-active', 'tab-reports-active', 'tab-settings-active');
  body.classList.add('tab-' + name + '-active');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoLast();
    return;
  }

    if (e.key >= '1' && e.key <= '9') {
    const reasonIdx = e.key - 1;
    const reason = REASON_KEYS[reasonIdx];
    if (!reason) return;

    if (selectedStudents.size > 0) {
      pushUndo('Изменение статуса (горячие клавиши)');
      const d = dateInput.value;
      if (!absences[d]) absences[d] = {};

      selectedStudents.forEach(idx => {
        const prev = absences[d][idx];
        if (prev && prev.reason && prev.full === false) {
          absences[d][idx] = { reason, full: false, from: prev.from, to: prev.to, comment: prev.comment, medical_reason: reason === 'medical' ? (prev.medical_reason || '') : '' };
        } else {
          absences[d][idx] = { reason, full: true, comment: prev ? prev.comment : '', medical_reason: reason === 'medical' ? (prev?.medical_reason || '') : '' };
        }
      });

      persistChange(`Массовое изменение статуса (${REASONS[reason].label})`);
      selectedStudents.clear();
      updateBulkPanel();
      render();
      toast(`Статус "${REASONS[reason].label}" применён к выбранным`);
    } else {
      toast(`Сначала выделите ученика чекбоксом, затем нажмите ${e.key}`);
    }
  }
});

async function init() {
  loadPrefs();
  
  // Убрали отсюда принудительную установку даты, так как она теперь корректно работает в afterLogin
  
  document.querySelectorAll('.side-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('intervalBackdrop').addEventListener('click', e => {
    if (e.target.id === 'intervalBackdrop') closeIntervalModal();
  });

  setupTableDelegation();

  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    await afterLogin(session.user);
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.querySelector('.container').style.display = 'none';
  }
}

switchTab('attendance');
init();
