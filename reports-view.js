const SUPABASE_URL = 'https://tzslxobwueqwecxpowqm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tcGF06S2ICA4NNw7T0S0xw_aRee02qV';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allClasses = [];
let currentClass = null;
let lastReport1 = null;
let lastReport2 = null;
let lastElemSummary = null;
let lastHighSummary = null;
let lastYearlySummary = null;

const REASONS = {
  '': { label: 'Присутствует' },
  'medical': { label: 'По болезни (мед. справка)' },
  'health_admin': { label: 'По состоянию здоровья (с разр. мед. работника/админ.)' },
  'parents_family': { label: 'Заявление родителей (семейные)' },
  'parents_health': { label: 'Заявление родителей (по здоровью)' },
  'survey': { label: 'Посещение врача, медосмотр' },
  'sport': { label: 'Соревнования' },
  'cultural': { label: 'Культ-массовые' },
  'ozdorovlenie': { label: 'Санаторий' },
  'norespect': { label: 'Без уважительной' },
  'other': { label: 'Другие уважительные' }
};
const REASON_KEYS = ['medical', 'health_admin', 'parents_family', 'parents_health', 'survey', 'sport', 'cultural', 'ozdorovlenie', 'norespect', 'other'];
const REPORT_CONSECUTIVE_DAYS = 3;
const REPORT_LONG_ABSENCE_DAYS = 5;
const MEDICAL_REASONS = {
  'cold': 'Простудные',
  'infectious': 'Инфекционные',
  'skin': 'Кожные',
  'injury': 'Травмы',
  'hospital': 'Больница',
  'examination': 'Обследование'
};

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function formatDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function formatDateRu(str) { if (!str) return ''; const [y,m,d] = str.split('-'); return `${d}.${m}.${y}`; }
function dateRange(from, to) { const res = []; let cur = new Date(from+'T00:00:00'); const end = new Date(to+'T00:00:00'); while (cur <= end) { res.push(formatDate(cur)); cur.setDate(cur.getDate()+1); } return res; }
function dowOf(str) { return new Date(str+'T00:00:00').getDay(); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function getSpecialDay(dateStr) { return (currentClass.settings.special_days || []).find(s => s.date === dateStr); }
function getDayLessons(dateStr) {
  const sp = getSpecialDay(dateStr);
  if (sp) return sp.lessons;
  const dow = dowOf(dateStr);
  if (dow === 0 || dow === 6) return 0;
  if ((currentClass.settings.excluded_dates || []).includes(dateStr)) return 0;
  return (currentClass.settings.schedule || {})[dow] || 0;
}
function isEducationDay(dateStr) { return getDayLessons(dateStr) > 0; }
function getEducationDays(from, to) { return dateRange(from, to).filter(d => isEducationDay(d)); }

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
  location.reload();
}

async function afterLogin(user) {
  currentUser = user;
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = '';
  document.getElementById('userEmail').textContent = user.email;
  await loadClasses();
  
  // Принудительно применяем состояние вкладок при старте, чтобы скрыть/показать выбор класса
  if (document.getElementById('reportPane-analytics').classList.contains('active')) {
    switchReportPane('analytics');
  } else {
    switchReportPane('1'); // По умолчанию, если активна первая вкладка
  }
}

async function loadClasses() {
  const { data: cls, error } = await sb.from('classes').select('*').order('name');
  if (error) {
    toast('Ошибка загрузки классов: ' + error.message);
    return;
  }
  allClasses = cls || [];
  const sel = document.getElementById('classSelect');
  sel.innerHTML = allClasses.map(c => {
    const label = c.name && c.name.trim() ? c.name : `Класс #${String(c.id).slice(0, 8)}`;
    return `<option value="${c.id}">${escapeHtml(label)}</option>`;
  }).join('');
  if (allClasses.length) {
    sel.value = allClasses[0].id;
    await loadClassData(allClasses[0].id);
  } else {
    toast('Нет доступных классов');
  }
}

async function loadClassData(classId) {
  const row = allClasses.find(c => String(c.id) === String(classId));
  if (!row) {
    toast('Класс не найден');
    return;
  }

  const { data: cfg, error: cfgErr } = await sb.from('class_settings').select('*').eq('class_id', row.id).maybeSingle();
  if (cfgErr) {
    toast('Ошибка загрузки настроек класса: ' + cfgErr.message);
  }

  const { data: st, error: stErr } = await sb.from('students').select('id, full_name, position').eq('class_id', row.id).order('position');
  if (stErr) {
    toast('Ошибка загрузки учеников: ' + stErr.message);
  }

  const studentIds = (st || []).map(r => r.id);
  const studentNames = (st || []).map(r => r.full_name);

  const absencesRaw = {};
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
        if (!absencesRaw[a.date]) absencesRaw[a.date] = {};
        absencesRaw[a.date][idx] = {
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

  currentClass = {
    id: row.id,
    name: row.name || '',
    settings: cfg || { schedule: { 0:0, 1:7, 2:7, 3:7, 4:7, 5:7, 6:0 }, quarters: [], excluded_dates: [], special_days: [] },
    students: studentNames,
    absences: absencesRaw
  };

  if (!currentClass.settings.quarters || currentClass.settings.quarters.length !== 4) {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    currentClass.settings.quarters = [
      { name: '1 четверть', from: `${y}-09-01`, to: `${y}-10-30` },
      { name: '2 четверть', from: `${y}-11-01`, to: `${y}-12-24` },
      { name: '3 четверть', from: `${y+1}-01-08`, to: `${y+1}-03-23` },
      { name: '4 четверть', from: `${y+1}-04-01`, to: `${y+1}-05-31` }
    ];
  }

  refreshQuarterSelect();
  initReportDates();
}

async function onClassChange() {
  const id = document.getElementById('classSelect').value;
  await loadClassData(id);
  lastReport1 = null;
  lastReport2 = null;
  document.getElementById('report1Output').innerHTML = '<div class="report-block"><div class="empty-state">Нажмите «Сформировать»</div></div>';
  document.getElementById('report2Output').innerHTML = '<div class="report-block"><div class="empty-state">Нажмите «Сформировать»</div></div>';
  document.getElementById('yearOutput').innerHTML = '<div class="report-block"><div class="empty-state">Нажмите «Сформировать»</div></div>';
}

function refreshQuarterSelect() {
  const sel = document.getElementById('quarterSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Вручную</option>' + currentClass.settings.quarters.map((q, i) => `<option value="${i}">${q.name}</option>`).join('');
}
function onQuarterChange() {
  const idx = document.getElementById('quarterSelect').value;
  if (idx === '') return;
  const q = currentClass.settings.quarters[parseInt(idx, 10)];
  if (q && q.from && q.to) {
    document.getElementById('report1From').value = q.from;
    document.getElementById('report1To').value = q.to;
    updateReport1Badge();
  }
}
function onReport1DateChange() { document.getElementById('quarterSelect').value = ''; updateReport1Badge(); }
function updateReport1Badge() {
  const from = document.getElementById('report1From').value;
  const to = document.getElementById('report1To').value;
  const badge = document.getElementById('report1EduBadge');
  if (!from || !to || from > to) { badge.textContent = '📚 —'; return; }
  badge.textContent = `📚 ${getEducationDays(from, to).length} уч. дн.`;
}
function updateReport2Badge() {
  const mStr = document.getElementById('report2Month').value;
  const badge = document.getElementById('report2EduBadge');
  if (!mStr) { badge.textContent = '📚 —'; return; }
  const [y, m] = mStr.split('-').map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const to = `${y}-${String(m).padStart(2,'0')}-${String(lastD).padStart(2,'0')}`;
  badge.textContent = `📚 ${getEducationDays(from, to).length} уч. дн.`;
}
function initReportDates() {
  const f = document.getElementById('report1From'), t = document.getElementById('report1To'), m = document.getElementById('report2Month');
  if (!f.value && currentClass.settings.quarters.length) {
    const q = currentClass.settings.quarters[0];
    f.value = q.from; t.value = q.to;
  }
  if (!m.value) m.value = todayStr().slice(0, 7);
  updateReport1Badge();
  updateReport2Badge();
}

function maxConsecutiveFull(idx, eduDays, reason = null) {
  let max = 0, cur = 0;
  for (const d of eduDays) {
    const a = currentClass.absences[d]?.[idx];
    const match = a && a.full && (!reason || a.reason === reason);
    if (match) { cur++; if (cur > max) max = cur; } else cur = 0;
  }
  return max;
}
function hasFullReason(idx, reason, eduDays) {
  return eduDays.some(d => { const a = currentClass.absences[d]?.[idx]; return a && a.reason === reason && a.full; });
}

function buildReport1(from, to, eduDays) {
  const analysis = currentClass.students.map((name, idx) => {
    const healthAdminMax = Math.max(
      maxConsecutiveFull(idx, eduDays, 'health_admin'),
      maxConsecutiveFull(idx, eduDays, 'parents_health')
    );
    return {
      name,
      anyMax: maxConsecutiveFull(idx, eduDays),
      medMax: maxConsecutiveFull(idx, eduDays, 'medical'),
      healthAdminMax: healthAdminMax,
      parentsMax: Math.max(
        maxConsecutiveFull(idx, eduDays, 'parents_family'),
        maxConsecutiveFull(idx, eduDays, 'parents_health')
      ),
      surveyMax: maxConsecutiveFull(idx, eduDays, 'survey'),
      sportMax: maxConsecutiveFull(idx, eduDays, 'sport'),
      culturalMax: maxConsecutiveFull(idx, eduDays, 'cultural'),
      ozdMax: maxConsecutiveFull(idx, eduDays, 'ozdorovlenie'),
      norespMax: maxConsecutiveFull(idx, eduDays, 'norespect'),
      otherMax: maxConsecutiveFull(idx, eduDays, 'other')
    };
  });
  const f = pred => analysis.filter(pred).map(a => a.name);
  
  const respSet = new Set([
    ...f(a => a.parentsMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.surveyMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.sportMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.culturalMax >= REPORT_CONSECUTIVE_DAYS),
    ...f(a => a.ozdMax >= REPORT_CONSECUTIVE_DAYS)
  ]);
  
  return {
    from, to,
    total: currentClass.students.length,
    s3plus: f(a => a.anyMax >= REPORT_CONSECUTIVE_DAYS),
    med4: f(a => a.medMax >= REPORT_CONSECUTIVE_DAYS),
    healthAdmin4: f(a => a.healthAdminMax >= REPORT_CONSECUTIVE_DAYS),
    resp: [...respSet],
    noresp: f(a => a.norespMax >= REPORT_CONSECUTIVE_DAYS),
    other: f(a => a.otherMax >= REPORT_CONSECUTIVE_DAYS)
  };
}

function listHtml(arr) {
  if (!arr || !arr.length) return '';
  return `<details class="students-list"><summary>ФИО (${arr.length})</summary><ul>${arr.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></details>`;
}

function runReport1() {
  const from = document.getElementById('report1From').value;
  const to = document.getElementById('report1To').value;
  if (!from || !to || from > to) { alert('Проверьте период'); return; }
  const eduDays = getEducationDays(from, to);
  if (!eduDays.length) { document.getElementById('report1Output').innerHTML = `<div class="report-block"><div class="empty-state">Нет учебных дней</div></div>`; return; }
  
  const r = buildReport1(from, to, eduDays);
  lastReport1 = r;
  const pct = n => Math.round((n / r.total) * 100);
  const c = (currentClass.name || '').trim();
  const rows = [
    ['Всего учеников в классе', r.total, null],
    ['Пропустили 3 и более дня подряд (любая причина)', r.s3plus.length, r.s3plus],
    ['Пропустили 3 и более дня по мед. справке', r.med4.length, r.med4],
    ['Пропустили 3 и более дня по болезни без мед. документов', r.healthAdmin4.length, r.healthAdmin4],
    ['Уважительные с документами', r.resp.length, r.resp],
    ['Иная причина', r.other.length, r.other],
    ['Без уважительной причины', r.noresp.length, r.noresp]
  ];
  document.getElementById('report1Output').innerHTML = `
  <div class="report-block">
    <h3>📑 Отчёт №1. Сведения об учащихся${c ? ' ' + c + ' класса' : ''}</h3>
    <p class="meta">Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b> · Учебных дней: <b>${eduDays.length}</b></p>
    <table class="report-table">
      <thead><tr><th>Показатель</th><th style="width:80px;text-align:right">Кол-во</th><th style="width:80px;text-align:right">Доля</th></tr></thead>
      <tbody>${rows.map(([lbl, cnt, list]) => `<tr><td>${lbl}${list && list.length ? '<br>' + listHtml(list) : ''}</td><td class="num">${cnt}</td><td class="num muted">${cnt ? pct(cnt)+'%' : '—'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="report-actions">
      <button class="btn-secondary" onclick="exportExcel(1)">📊 Скачать Excel</button>
    </div>
  </div>`;
}

function buildReport2(from, to, eduDays) {
  const byReason = {}; REASON_KEYS.forEach(k => byReason[k] = 0);
  const medBreakdown = { cold: 0, infectious: 0, skin: 0, injury: 0, hospital: 0, examination: 0, unspecified: 0 };
  let total = 0;
  for (const d of eduDays) {
    const dayAbs = currentClass.absences[d] || {};
    const lessons = getDayLessons(d);
    for (const a of Object.values(dayAbs)) {
      let n = lessons;
      if (a.full === false) { const f = Math.max(1, a.from); const t = Math.min(lessons, a.to); n = (t >= f) ? (t - f + 1) : 0; }
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
  currentClass.students.forEach((name, idx) => {
    let start = null, reasons = [];
    for (let i = 0; i <= eduDays.length; i++) {
      const abs = i < eduDays.length ? currentClass.absences[eduDays[i]]?.[idx] : null;
      const isFull = abs && abs.reason && abs.full;
      if (isFull) { if (start === null) start = i; reasons.push(abs.reason); }
      else {
        if (start !== null && (i - start) >= REPORT_LONG_ABSENCE_DAYS) longAbs.push({ name, from: eduDays[start], to: eduDays[i - 1], length: i - start, reasons: [...new Set(reasons)] });
        start = null; reasons = [];
      }
    }
  });
  return { from, to, total, byReason, longAbs, medBreakdown };
}

function runReport2() {
  const mStr = document.getElementById('report2Month').value;
  if (!mStr) { alert('Выберите месяц'); return; }
  const [y, m] = mStr.split('-').map(Number);
  const lastD = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const to = `${y}-${String(m).padStart(2,'0')}-${String(lastD).padStart(2,'0')}`;
  const eduDays = getEducationDays(from, to);
  if (!eduDays.length) { document.getElementById('report2Output').innerHTML = `<div class="report-block"><div class="empty-state">Нет учебных дней</div></div>`; return; }
  
  const r = buildReport2(from, to, eduDays);
  lastReport2 = r;
  const c = (currentClass.name || '').trim();
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
    if (k === 'parents_health') return;
    if (k === 'medical') {
      subRows += `<tr class="sub"><td>${labels[k]}</td><td class="num">${r.byReason[k] || 0}</td></tr>`;
      const mb = r.medBreakdown;
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
      const totalParents = (r.byReason['parents_family'] || 0) + (r.byReason['parents_health'] || 0);
      subRows += `<tr class="sub"><td>Заявление родителей (все)</td><td class="num">${totalParents}</td></tr>`;
    } else {
      subRows += `<tr class="sub"><td>${labels[k]}</td><td class="num">${r.byReason[k] || 0}</td></tr>`;
    }
  });

  const longRows = r.longAbs.length ? r.longAbs.map((la, i) => `<tr><td>${i+1}</td><td>${escapeHtml(la.name)}</td><td>${formatDateRu(la.from)}-${formatDateRu(la.to)}</td><td>${la.reasons.map(x => REASONS[x]?.label || x).join(', ')}</td></tr>`).join('') : `<tr><td colspan="4" class="empty-state">🎉 Нет учащихся с 5+ днями пропусков!</td></tr>`;
  
  document.getElementById('report2Output').innerHTML = `
  <div class="report-block">
    <h3>📚 Отчёт №2. Пропущенные уроки${c ? ' (' + c + ')' : ''}</h3>
    <p class="meta">Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b></p>
    <table class="report-table">
      <thead><tr><th>Категория</th><th style="width:120px;text-align:right">Уроков</th></tr></thead>
      <tbody><tr class="total-row"><td>Всего пропущено</td><td class="num" style="font-size:16px">${r.total}</td></tr>${subRows}</tbody>
    </table>
    <h4 style="margin:20px 0 10px; font-size:15px;">Учащиеся с 5+ днями подряд</h4>
    <div class="table-wrap"><table class="report-table exact-table">
      <thead><tr><th style="width:50px;">№</th><th>ФИО учащегося</th><th>Дата отсутствия</th><th>Причина</th></tr></thead>
      <tbody>${longRows}</tbody>
    </table></div>
    <div class="report-actions">
      <button class="btn-secondary" onclick="exportExcel(2)">📊 Скачать Excel</button>
    </div>
  </div>`;
}

function runYearSummary() {
  const c = (currentClass.name || '').trim();
  let rowsHtml = ''; let hasData = false;
  currentClass.settings.quarters.forEach(q => {
    if (!q.from || !q.to) return;
    const edu = getEducationDays(q.from, q.to);
    if (!edu.length) return;
    hasData = true;
    const r = buildReport1(q.from, q.to, edu);
    rowsHtml += `<tr><td>${q.name}</td><td class="num">${edu.length}</td><td class="num">${r.s3plus.length}</td><td class="num">${r.med4.length}</td></tr>`;
  });
  document.getElementById('yearOutput').innerHTML = hasData ? `<div class="report-block">
    <h3>📅 Сводка за учебный год ${c ? ' (' + c + ')' : ''}</h3>
    <p class="meta">Сравнение по четвертям</p>
    <table class="report-table">
      <thead><tr><th>Четверть</th><th style="text-align:right">Учебных дней</th><th style="text-align:right">3+ дня подряд</th><th style="text-align:right">3+ дней по справке</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>` : `<div class="report-block"><div class="empty-state">Нет данных</div></div>`;
}

function exportExcel(reportNum) {
  if (reportNum === 1 && !lastReport1) { toast('Сначала сформируйте Отчёт №1'); return; }
  if (reportNum === 2 && !lastReport2) { toast('Сначала сформируйте Отчёт №2'); return; }

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
    const r = lastReport2;
    wsData.push(['Учащиеся с 5+ днями подряд']);
    wsData.push(['№', 'ФИО', 'Дата', 'Причина']);
    if (r.longAbs.length) {
      r.longAbs.forEach((la, i) => wsData.push([i + 1, la.name, `${formatDateRu(la.from)}-${formatDateRu(la.to)}`, la.reasons.map(x => REASONS[x]?.label).join(', ')]));
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
      if (k === 'parents_health') return;
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

function switchReportPane(name) {
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.report === name));
  document.querySelectorAll('.report-pane').forEach(p => p.classList.toggle('active', p.id === 'reportPane-' + name));
  
  const body = document.body;
  body.classList.remove('analytics-active', 'elementary-active', 'high-active', 'yearly-active');
  
  if (name === 'analytics') body.classList.add('analytics-active');
  if (name === 'elementary') body.classList.add('elementary-active');
  if (name === 'high') body.classList.add('high-active');
  if (name === 'yearly') body.classList.add('yearly-active');

  // Принудительно управляем плашкой класса
  const toolbar = document.querySelector('.ux-class-toolbar');
  if (toolbar) {
    if (['analytics', 'elementary', 'high', 'yearly'].includes(name)) {
      toolbar.style.setProperty('display', 'none', 'important');
    } else {
      toolbar.style.setProperty('display', 'flex', 'important');
    }
  }
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

// --- БЛОК СВОДНЫХ ОТЧЁТОВ ---

let allAbsencesData = null;

async function loadAllDataForSummary() {
  const { data: classes, error: errClasses } = await sb.from('classes').select('*');
  if (errClasses) { toast(errClasses.message); return null; }
  
  const { data: settings, error: errSettings } = await sb.from('class_settings').select('*');
  if (errSettings) { toast(errSettings.message); return null; }
  
  const { data: students, error: errStudents } = await sb.from('students').select('*').order('position');
  if (errStudents) { toast(errStudents.message); return null; }
  
  const { data: absences, error: errAbsences } = await sb.from('absences').select('*');
  if (errAbsences) { toast(errAbsences.message); return null; }

  const classMap = {};
  classes.forEach(c => {
    const cfg = (settings || []).find(s => s.class_id === c.id) || { schedule: {}, excluded_dates: [], special_days: [] };
    classMap[c.id] = {
      id: c.id,
      name: c.name || '',
      settings: cfg,
      students: (students || []).filter(s => s.class_id === c.id),
      absences: {}
    };
  });

  (absences || []).forEach(a => {
    const student = (students || []).find(s => s.id === a.student_id);
    if (student && classMap[student.class_id]) {
      if (!classMap[student.class_id].absences[a.date]) classMap[student.class_id].absences[a.date] = {};
      classMap[student.class_id].absences[a.date][student.id] = {
        reason: a.reason,
        full: a.is_full_day !== false,
        from: a.lesson_from,
        to: a.lesson_to,
        medical_reason: a.medical_reason || ''
      };
    }
  });

  allAbsencesData = classMap;
  return classMap;
}

function getClassGrade(className) {
  if (!className) return 0;
  const match = className.match(/^\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getDayLessonsForClass(settings, dateStr) {
  const sp = (settings.special_days || []).find(s => s.date === dateStr);
  if (sp) return sp.lessons;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  if (dow === 0 || dow === 6) return 0;
  if ((settings.excluded_dates || []).includes(dateStr)) return 0;
  return (settings.schedule || {})[dow] || 0;
}

async function runElementarySummary() {
  const from = document.getElementById('elemFrom').value;
  const to = document.getElementById('elemTo').value;
  if (!from || !to || from > to) { alert('Проверьте период'); return; }
  
  document.getElementById('elemOutput').innerHTML = '<div class="empty-state">Загрузка данных...</div>';
  const data = await loadAllDataForSummary();
  if (!data) return;

  const classes = Object.values(data).filter(c => {
    const grade = getClassGrade(c.name);
    return grade >= 1 && grade <= 4;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

  if (!classes.length) {
    document.getElementById('elemOutput').innerHTML = '<div class="report-block"><div class="empty-state">Нет классов начальной школы</div></div>';
    return;
  }

  const rows = [];
  const grades = [1, 2, 3, 4];
  
  grades.forEach(grade => {
    const gradeClasses = classes.filter(c => getClassGrade(c.name) === grade);
    if (!gradeClasses.length) return;

    rows.push({ type: 'grade', name: `${grade} классы`, data: {} });

    const gradeTotals = { total:0, medical:0, cold:0, infectious:0, skin:0, injury:0, hospital:0, examination:0, sanatorium:0, parents:0, sport:0, cultural:0, norespect:0, health_admin:0, survey:0 };

    gradeClasses.forEach(cls => {
      const rowData = { total:0, medical:0, cold:0, infectious:0, skin:0, injury:0, hospital:0, examination:0, sanatorium:0, parents:0, sport:0, cultural:0, norespect:0, health_admin:0, survey:0 };
      const eduDays = dateRange(from, to).filter(d => getDayLessonsForClass(cls.settings, d) > 0);
      
      eduDays.forEach(d => {
        const dayAbs = cls.absences[d] || {};
        Object.values(dayAbs).forEach(a => {
          if (!a.full) return;
          const lessons = getDayLessonsForClass(cls.settings, d);
          rowData.total += lessons;
          gradeTotals.total += lessons;

          if (a.reason === 'medical') { rowData.medical += lessons; gradeTotals.medical += lessons; }
          else if (a.reason === 'ozdorovlenie') { rowData.sanatorium += lessons; gradeTotals.sanatorium += lessons; }
          else if (a.reason === 'parents_family' || a.reason === 'parents_health') { rowData.parents += lessons; gradeTotals.parents += lessons; }
          else if (a.reason === 'sport') { rowData.sport += lessons; gradeTotals.sport += lessons; }
          else if (a.reason === 'cultural') { rowData.cultural += lessons; gradeTotals.cultural += lessons; }
          else if (a.reason === 'norespect') { rowData.norespect += lessons; gradeTotals.norespect += lessons; }
          else if (a.reason === 'health_admin') { rowData.health_admin += lessons; gradeTotals.health_admin += lessons; }
          else if (a.reason === 'survey') { rowData.survey += lessons; gradeTotals.survey += lessons; }

          if (a.reason === 'medical' && a.medical_reason) {
            if (a.medical_reason === 'cold') { rowData.cold += lessons; gradeTotals.cold += lessons; }
            else if (a.medical_reason === 'infectious') { rowData.infectious += lessons; gradeTotals.infectious += lessons; }
            else if (a.medical_reason === 'skin') { rowData.skin += lessons; gradeTotals.skin += lessons; }
            else if (a.medical_reason === 'injury') { rowData.injury += lessons; gradeTotals.injury += lessons; }
            else if (a.medical_reason === 'hospital') { rowData.hospital += lessons; gradeTotals.hospital += lessons; }
            else if (a.medical_reason === 'examination') { rowData.examination += lessons; gradeTotals.examination += lessons; }
          }
        });
      });

      rows.push({ type: 'class', name: cls.name, data: rowData });
    });

    rows.push({ type: 'total', name: 'Всего', data: gradeTotals });
  });

  const finalTotal = { total:0, medical:0, cold:0, infectious:0, skin:0, injury:0, hospital:0, examination:0, sanatorium:0, parents:0, sport:0, cultural:0, norespect:0, health_admin:0, survey:0 };
  rows.filter(r => r.type === 'total').forEach(r => {
    Object.keys(finalTotal).forEach(k => finalTotal[k] += r.data[k] || 0);
  });
  rows.push({ type: 'grandtotal', name: 'ИТОГО', data: finalTotal });

  lastElemSummary = rows;

  let html = '<div class="report-block"><h3>🏫 Сводный отчёт по начальной школе</h3>';
  html += `<p class="meta">Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b></p>`;
  html += '<div class="table-wrap"><table class="report-table exact-table" style="font-size:12px;">';
  html += '<thead><tr><th>Класс</th><th>Всего</th><th>По болезни</th><th>Простудные</th><th>Инфекц.</th><th>Кожные</th><th>Травмы</th><th>Больница</th><th>Обслед.</th><th>Санаторий</th><th>Заявление род.</th><th>Спорт</th><th>Культ-масс</th><th>Без уваж.</th><th>По сост. здор.</th><th>Посещ. врача</th></tr></thead><tbody>';
  
  rows.forEach(r => {
    const cls = r.type === 'grade' ? 'style="background:var(--card-hover);font-weight:700;"' : 
                r.type === 'total' ? 'style="font-weight:700;background:var(--input-bg);"' : 
                r.type === 'grandtotal' ? 'style="font-weight:800;background:var(--border);font-size:13px;"' : '';
    html += `<tr ${cls}>`;
    html += `<td style="text-align:left; padding-left:10px; white-space:nowrap;">${escapeHtml(r.name)}</td>`;
    html += `<td>${r.data.total || '—'}</td>`;
    html += `<td>${r.data.medical || '—'}</td>`;
    html += `<td>${r.data.cold || '—'}</td>`;
    html += `<td>${r.data.infectious || '—'}</td>`;
    html += `<td>${r.data.skin || '—'}</td>`;
    html += `<td>${r.data.injury || '—'}</td>`;
    html += `<td>${r.data.hospital || '—'}</td>`;
    html += `<td>${r.data.examination || '—'}</td>`;
    html += `<td>${r.data.sanatorium || '—'}</td>`;
    html += `<td>${r.data.parents || '—'}</td>`;
    html += `<td>${r.data.sport || '—'}</td>`;
    html += `<td>${r.data.cultural || '—'}</td>`;
    html += `<td>${r.data.norespect || '—'}</td>`;
    html += `<td>${r.data.health_admin || '—'}</td>`;
    html += `<td>${r.data.survey || '—'}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  document.getElementById('elemOutput').innerHTML = html;
}

async function runHighSummary() {
  const from = document.getElementById('highFrom').value;
  const to = document.getElementById('highTo').value;
  if (!from || !to || from > to) { alert('Проверьте период'); return; }
  
  document.getElementById('highOutput').innerHTML = '<div class="empty-state">Загрузка данных...</div>';
  const data = await loadAllDataForSummary();
  if (!data) return;

  const classes = Object.values(data).filter(c => {
    const grade = getClassGrade(c.name);
    return grade >= 5 && grade <= 11;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

  if (!classes.length) {
    document.getElementById('highOutput').innerHTML = '<div class="report-block"><div class="empty-state">Нет классов старшей школы</div></div>';
    return;
  }

  const rows = [];
  const totalData = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };
  const group59 = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };
  const group1011 = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };

  classes.forEach(cls => {
    const grade = getClassGrade(cls.name);
    const rowData = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };
    const eduDays = dateRange(from, to).filter(d => getDayLessonsForClass(cls.settings, d) > 0);
    
    eduDays.forEach(d => {
      const dayAbs = cls.absences[d] || {};
      Object.values(dayAbs).forEach(a => {
        if (!a.full) return;
        const lessons = getDayLessonsForClass(cls.settings, d);
        
        const add = (key, val) => { if (rowData[key] !== undefined) rowData[key] += val; };
        
        add('total', lessons);
        totalData.total += lessons;
        
        if (grade <= 9) group59.total += lessons; else group1011.total += lessons;

        const r = a.reason;
        if (r === 'medical') { add('medical', lessons); totalData.medical += lessons; if (grade <= 9) group59.medical += lessons; else group1011.medical += lessons; }
        else if (r === 'health_admin') { add('health_admin', lessons); totalData.health_admin += lessons; if (grade <= 9) group59.health_admin += lessons; else group1011.health_admin += lessons; }
        else if (r === 'survey') { add('survey', lessons); totalData.survey += lessons; if (grade <= 9) group59.survey += lessons; else group1011.survey += lessons; }
        else if (r === 'parents_family' || r === 'parents_health') { add('parents', lessons); totalData.parents += lessons; if (grade <= 9) group59.parents += lessons; else group1011.parents += lessons; }
        else if (r === 'sport') { add('sport', lessons); totalData.sport += lessons; if (grade <= 9) group59.sport += lessons; else group1011.sport += lessons; }
        else if (r === 'cultural') { add('cultural', lessons); totalData.cultural += lessons; if (grade <= 9) group59.cultural += lessons; else group1011.cultural += lessons; }
        else if (r === 'norespect') { add('norespect', lessons); totalData.norespect += lessons; if (grade <= 9) group59.norespect += lessons; else group1011.norespect += lessons; }
        else if (r === 'ozdorovlenie') { add('sanatorium', lessons); totalData.sanatorium += lessons; if (grade <= 9) group59.sanatorium += lessons; else group1011.sanatorium += lessons; }
        else if (r === 'other') { add('other', lessons); totalData.other += lessons; if (grade <= 9) group59.other += lessons; else group1011.other += lessons; }
      });
    });
    rows.push({ type: 'class', name: cls.name, data: rowData });
  });

  rows.push({ type: 'grandtotal', name: '5-9 класс', data: group59 });
  rows.push({ type: 'grandtotal', name: '10-11 кл', data: group1011 });
  rows.push({ type: 'grandtotal', name: 'Итого', data: totalData });

  lastHighSummary = rows;

  let html = '<div class="report-block"><h3>🏢 Сводный отчёт по старшей школе</h3>';
  html += `<p class="meta">Период: <b>${formatDateRu(from)}</b> — <b>${formatDateRu(to)}</b></p>`;
  html += '<div class="table-wrap"><table class="report-table exact-table" style="font-size:12px;">';
  html += '<thead><tr><th>Класс</th><th>Всего</th><th>По болезни</th><th>По сост. здор.</th><th>Посещ. врача</th><th>Заявление род.</th><th>Спорт</th><th>Культ-масс</th><th>Без уваж.</th><th>Иная</th><th>Санаторий</th></tr></thead><tbody>';
  
  rows.forEach(r => {
    const isTotal = r.type === 'grandtotal';
    const cls = isTotal ? 'style="font-weight:800;background:var(--border);font-size:13px;"' : '';
    html += `<tr ${cls}>`;
    html += `<td style="text-align:left; padding-left:10px; white-space:nowrap;">${escapeHtml(r.name)}</td>`;
    html += `<td>${r.data.total || '—'}</td>`;
    html += `<td>${r.data.medical || '—'}</td>`;
    html += `<td>${r.data.health_admin || '—'}</td>`;
    html += `<td>${r.data.survey || '—'}</td>`;
    html += `<td>${r.data.parents || '—'}</td>`;
    html += `<td>${r.data.sport || '—'}</td>`;
    html += `<td>${r.data.cultural || '—'}</td>`;
    html += `<td>${r.data.norespect || '—'}</td>`;
    html += `<td>${r.data.other || '—'}</td>`;
    html += `<td>${r.data.sanatorium || '—'}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  document.getElementById('highOutput').innerHTML = html;
}

function initYearlySelect() {
  const sel = document.getElementById('yearlyYear');
  if (!sel) return;
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  sel.innerHTML = years.map(y => `<option value="${y}">${y}-${y+1} учебный год</option>`).join('');
}

async function runYearlySummary() {
  const year = parseInt(document.getElementById('yearlyYear').value, 10);
  if (!year) return;
  
  document.getElementById('yearlyOutput').innerHTML = '<div class="empty-state">Загрузка данных...</div>';
  const data = await loadAllDataForSummary();
  if (!data) return;

  const classes = Object.values(data).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  if (!classes.length) {
    document.getElementById('yearlyOutput').innerHTML = '<div class="report-block"><div class="empty-state">Нет классов</div></div>';
    return;
  }

  const months = [
    { name: 'сентябрь', from: `${year}-09-01`, to: `${year}-09-30` },
    { name: 'октябрь',  from: `${year}-10-01`, to: `${year}-10-31` },
    { name: 'ноябрь',   from: `${year}-11-01`, to: `${year}-11-30` },
    { name: 'декабрь',  from: `${year}-12-01`, to: `${year}-12-31` },
    { name: 'январь',   from: `${year+1}-01-01`, to: `${year+1}-01-31` },
    { name: 'февраль',  from: `${year+1}-02-01`, to: `${year+1}-02-28` },
    { name: 'март',     from: `${year+1}-03-01`, to: `${year+1}-03-31` },
    { name: 'апрель',   from: `${year+1}-04-01`, to: `${year+1}-04-30` },
    { name: 'май',      from: `${year+1}-05-01`, to: `${year+1}-05-31` }
  ];

  const totalsByMonth = {};
  months.forEach(m => {
    totalsByMonth[m.name] = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };
  });
  const grandTotal = { total:0, medical:0, health_admin:0, survey:0, parents:0, sport:0, cultural:0, norespect:0, other:0, sanatorium:0 };

  classes.forEach(cls => {
    months.forEach(m => {
      const eduDays = dateRange(m.from, m.to).filter(d => getDayLessonsForClass(cls.settings, d) > 0);
      eduDays.forEach(d => {
        const dayAbs = cls.absences[d] || {};
        Object.values(dayAbs).forEach(a => {
          if (!a.full) return;
          const lessons = getDayLessonsForClass(cls.settings, d);
          
          totalsByMonth[m.name].total += lessons;
          grandTotal.total += lessons;

          const r = a.reason;
          if (r === 'medical') { totalsByMonth[m.name].medical += lessons; grandTotal.medical += lessons; }
          else if (r === 'health_admin') { totalsByMonth[m.name].health_admin += lessons; grandTotal.health_admin += lessons; }
          else if (r === 'survey') { totalsByMonth[m.name].survey += lessons; grandTotal.survey += lessons; }
          else if (r === 'parents_family' || r === 'parents_health') { totalsByMonth[m.name].parents += lessons; grandTotal.parents += lessons; }
          else if (r === 'sport') { totalsByMonth[m.name].sport += lessons; grandTotal.sport += lessons; }
          else if (r === 'cultural') { totalsByMonth[m.name].cultural += lessons; grandTotal.cultural += lessons; }
          else if (r === 'norespect') { totalsByMonth[m.name].norespect += lessons; grandTotal.norespect += lessons; }
          else if (r === 'ozdorovlenie') { totalsByMonth[m.name].sanatorium += lessons; grandTotal.sanatorium += lessons; }
          else if (r === 'other') { totalsByMonth[m.name].other += lessons; grandTotal.other += lessons; }
        });
      });
    });
  });

  lastYearlySummary = { months, totalsByMonth, grandTotal };

  let html = '<div class="report-block"><h3>📆 Годовой сводный отчёт</h3>';
  html += `<p class="meta">Учебный год: <b>${year}-${year+1}</b></p>`;
  html += '<div class="table-wrap"><table class="report-table exact-table" style="font-size:12px;">';
  html += '<thead><tr><th>Месяц</th><th>Всего</th><th>По болезни</th><th>По сост. здор.</th><th>Посещ. врача</th><th>Заявление род.</th><th>Спорт</th><th>Культ-масс</th><th>Без уваж.</th><th>Иная</th><th>Санаторий</th></tr></thead><tbody>';
  
  months.forEach(m => {
    const d = totalsByMonth[m.name];
    html += `<tr>`;
    html += `<td style="text-align:left; padding-left:10px;">${m.name}</td>`;
    html += `<td>${d.total || '—'}</td>`;
    html += `<td>${d.medical || '—'}</td>`;
    html += `<td>${d.health_admin || '—'}</td>`;
    html += `<td>${d.survey || '—'}</td>`;
    html += `<td>${d.parents || '—'}</td>`;
    html += `<td>${d.sport || '—'}</td>`;
    html += `<td>${d.cultural || '—'}</td>`;
    html += `<td>${d.norespect || '—'}</td>`;
    html += `<td>${d.other || '—'}</td>`;
    html += `<td>${d.sanatorium || '—'}</td>`;
    html += '</tr>';
  });

  html += `<tr style="font-weight:800;background:var(--border);font-size:13px;">`;
  html += `<td style="text-align:left; padding-left:10px;">за год</td>`;
  html += `<td>${grandTotal.total || '—'}</td>`;
  html += `<td>${grandTotal.medical || '—'}</td>`;
  html += `<td>${grandTotal.health_admin || '—'}</td>`;
  html += `<td>${grandTotal.survey || '—'}</td>`;
  html += `<td>${grandTotal.parents || '—'}</td>`;
  html += `<td>${grandTotal.sport || '—'}</td>`;
  html += `<td>${grandTotal.cultural || '—'}</td>`;
  html += `<td>${grandTotal.norespect || '—'}</td>`;
  html += `<td>${grandTotal.other || '—'}</td>`;
  html += `<td>${grandTotal.sanatorium || '—'}</td>`;
  html += '</tr>';

  html += '</tbody></table></div></div>';
  document.getElementById('yearlyOutput').innerHTML = html;
}

function exportSummaryExcel(type) {
  if (type === 'elem' && !lastElemSummary) { toast('Сначала сформируйте отчёт'); return; }
  if (type === 'high' && !lastHighSummary) { toast('Сначала сформируйте отчёт'); return; }
  if (type === 'yearly' && !lastYearlySummary) { toast('Сначала сформируйте отчёт'); return; }

  const wb = XLSX.utils.book_new();
  const wsData = [];

  if (type === 'elem') {
    wsData.push(['Класс', 'Всего', 'По болезни', 'Простудные', 'Инфекц.', 'Кожные', 'Травмы', 'Больница', 'Обслед.', 'Санаторий', 'Заявление род.', 'Спорт', 'Культ-масс', 'Без уваж.', 'По сост. здор.', 'Посещ. врача']);
    lastElemSummary.forEach(r => {
      wsData.push([
        r.name, r.data.total, r.data.medical, r.data.cold, r.data.infectious, 
        r.data.skin, r.data.injury, r.data.hospital, r.data.examination, r.data.sanatorium, 
        r.data.parents, r.data.sport, r.data.cultural, r.data.norespect, r.data.health_admin, r.data.survey
      ]);
    });
  } else if (type === 'high') {
    wsData.push(['Класс', 'Всего', 'По болезни', 'По сост. здор.', 'Посещ. врача', 'Заявление род.', 'Спорт', 'Культ-масс', 'Без уваж.', 'Иная', 'Санаторий']);
    lastHighSummary.forEach(r => {
      wsData.push([
        r.name, r.data.total, r.data.medical, r.data.health_admin, r.data.survey, 
        r.data.parents, r.data.sport, r.data.cultural, r.data.norespect, r.data.other, r.data.sanatorium
      ]);
    });
  } else if (type === 'yearly') {
    wsData.push(['Месяц', 'Всего', 'По болезни', 'По сост. здор.', 'Посещ. врача', 'Заявление род.', 'Спорт', 'Культ-масс', 'Без уваж.', 'Иная', 'Санаторий']);
    lastYearlySummary.months.forEach(m => {
      const d = lastYearlySummary.totalsByMonth[m.name];
      wsData.push([
        m.name, d.total, d.medical, d.health_admin, d.survey, 
        d.parents, d.sport, d.cultural, d.norespect, d.other, d.sanatorium
      ]);
    });
    const g = lastYearlySummary.grandTotal;
    wsData.push([
      'за год', g.total, g.medical, g.health_admin, g.survey, 
      g.parents, g.sport, g.cultural, g.norespect, g.other, g.sanatorium
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Свод');
  XLSX.writeFile(wb, `свод_${type}_${todayStr()}.xlsx`);
  toast('Excel скачан');
}

function initSummaryDates() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  
  // Первое и последнее число текущего месяца
  const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDayDate = new Date(y, m + 1, 0);
  const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

  const elemFrom = document.getElementById('elemFrom');
  const elemTo = document.getElementById('elemTo');
  const highFrom = document.getElementById('highFrom');
  const highTo = document.getElementById('highTo');

  if (elemFrom && !elemFrom.value) elemFrom.value = firstDay;
  if (elemTo && !elemTo.value) elemTo.value = lastDay;
  if (highFrom && !highFrom.value) highFrom.value = firstDay;
  if (highTo && !highTo.value) highTo.value = lastDay;
}

(async function init() {
  try {
    initSummaryDates();
    initYearlySelect();
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      await afterLogin(session.user);
    } else {
      document.getElementById('loginScreen').style.display = 'flex';
    }
  } catch (e) {
    console.error('init error:', e);
    document.getElementById('loginScreen').style.display = 'flex';
  }
})();
