const SUPABASE_URL = 'https://tzslxobwueqwecxpowqm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tcGF06S2ICA4NNw7T0S0xw_aRee02qV';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allClasses = [];
let currentClass = null;
let lastReport1 = null;
let lastReport2 = null;

const REASONS = {
  '': { label: 'Присутствует' },
  'medical': { label: 'Медицинская справка' },
  'ozdorovlenie': { label: 'Оздоровление в санаториях' },
  'health': { label: 'Заявление: здоровье' },
  'family': { label: 'Заявление: семейные' },
  'sport': { label: 'Соревнования' },
  'cultural': { label: 'Культ-массовые' },
  'norespect': { label: 'Без уважительной' },
  'other': { label: 'Иная причина' }
};
const REASON_KEYS = ['medical','ozdorovlenie','health','family','sport','cultural','norespect','other'];

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
  if (!email || !pass) { err.textContent = 'Введите email и пароль'; return; }
  btn.disabled = true; btn.textContent = 'Вход…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Войти';
  if (error) { err.textContent = error.message; return; }
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
}

async function loadClasses() {
  const { data: cls, error } = await sb.from('classes').select('*').order('name');
  if (error) { toast(error.message); console.error('classes error', error); return; }
  allClasses = cls || [];
  console.log('Загружено классов:', allClasses.length, allClasses);
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
  const row = allClasses.find(c => c.id === classId);
  if (!row) return;
  
  const { data: cfg, error: cfgErr } = await sb.from('class_settings').select('*').eq('class_id', classId).maybeSingle();
  if (cfgErr) console.error('class_settings error', cfgErr);
  
  const { data: st, error: stErr } = await sb.from('students').select('id, full_name, position').eq('class_id', classId).order('position');
  if (stErr) console.error('students error', stErr);
  console.log('Учеников загружено:', (st || []).length, st);
  
  const studentIds = (st || []).map(r => r.id);
  const studentNames = (st || []).map(r => r.full_name);

  const absencesRaw = {};
  if (studentIds.length) {
    const { data: ab, error: abErr } = await sb.from('absences').select('*').in('student_id', studentIds);
    if (abErr) console.error('absences error', abErr);
    console.log('Записей о пропусках:', (ab || []).length);
        const idToIdx = new Map();
    studentIds.forEach((id, i) => idToIdx.set(String(id), i));
    (ab || []).forEach(a => {
      const idx = idToIdx.get(String(a.student_id));
      if (idx === undefined) return;
      if (!absencesRaw[a.date]) absencesRaw[a.date] = {};
      absencesRaw[a.date][idx] = { reason: a.reason, full: a.is_full_day !== false, from: a.lesson_from, to: a.lesson_to, comment: a.comment || '' };
    });
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
  const analysis = currentClass.students.map((name, idx) => ({
    name,
    anyMax: maxConsecutiveFull(idx, eduDays),
    medMax: maxConsecutiveFull(idx, eduDays, 'medical'),
    healthMax: maxConsecutiveFull(idx, eduDays, 'health'),
    familyAny: hasFullReason(idx, 'family', eduDays),
    sportAny: hasFullReason(idx, 'sport', eduDays),
    culturalAny: hasFullReason(idx, 'cultural', eduDays),
    ozdAny: hasFullReason(idx, 'ozdorovlenie', eduDays),
    norespAny: hasFullReason(idx, 'norespect', eduDays),
    otherAny: hasFullReason(idx, 'other', eduDays)
  }));
  const f = pred => analysis.filter(pred).map(a => a.name);
  const respSet = new Set([...f(a => a.familyAny), ...f(a => a.sportAny), ...f(a => a.culturalAny), ...f(a => a.ozdAny)]);
  return { from, to, total: currentClass.students.length, s3plus: f(a => a.anyMax >= 3), med4: f(a => a.medMax >= 3), health4: f(a => a.healthMax >= 3), resp: [...respSet], noresp: f(a => a.norespAny), other: f(a => a.otherAny) };
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
    ['Пропустили 3 и более дня по заявлению (здоровье)', r.health4.length, r.health4],
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
  </div>`;
}

function buildReport2(from, to, eduDays) {
  const byReason = {}; REASON_KEYS.forEach(k => byReason[k] = 0);
  let total = 0;
  for (const d of eduDays) {
    const dayAbs = currentClass.absences[d] || {};
    const lessons = getDayLessons(d);
    for (const a of Object.values(dayAbs)) {
      let n = lessons;
      if (a.full === false) { const f = Math.max(1, a.from); const t = Math.min(lessons, a.to); n = (t >= f) ? (t - f + 1) : 0; }
      if (n > 0) { total += n; byReason[a.reason] = (byReason[a.reason] || 0) + n; }
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
        if (start !== null && (i - start) >= 5) longAbs.push({ name, from: eduDays[start], to: eduDays[i - 1], length: i - start, reasons: [...new Set(reasons)] });
        start = null; reasons = [];
      }
    }
  });
  return { from, to, total, byReason, longAbs };
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
  const labels = { medical: 'Мед. справка', ozdorovlenie: 'Санаторий', health: 'Заявление (здоровье)', family: 'Заявление (семья)', sport: 'Соревнования', cultural: 'Культ-массовые', norespect: 'Без уважительной', other: 'Иная' };
  const subRows = REASON_KEYS.map(k => `<tr class="sub"><td>${labels[k]}</td><td class="num">${r.byReason[k] || 0}</td></tr>`).join('');
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
    wsData.push(['3 и более дня по здоровью', r.health4.length, r.health4.join(', ')]);
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
    const labels = { medical: 'Мед. справка', ozdorovlenie: 'Санаторий', health: 'Заявление (здоровье)', family: 'Заявление (семья)', sport: 'Соревнования', cultural: 'Культ-массовые', norespect: 'Без уважительной', other: 'Иная' };
    REASON_KEYS.forEach(k => {
      if (r.byReason[k]) wsData.push([labels[k], r.byReason[k]]);
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
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    await afterLogin(session.user);
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }
})();