/* Read-only analytics built from the same Supabase data as summary reports.
   No changes to official reports, exports, authentication, or RLS. */
(function () {
  'use strict';
  const monthNames = ['Сен','Окт','Ноя','Дек','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг'];
  let cache = null;
  const $ = id => document.getElementById(id);
  const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function initYear() {
    const select = $('analyticsYear');
    if (!select || select.options.length) return;
    const d = new Date();
    const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    for (let offset = -3; offset <= 1; offset++) {
      const year = y + offset;
      const opt = document.createElement('option');
      opt.value = String(year);
      opt.textContent = `${year} / ${year + 1}`;
      select.appendChild(opt);
    }
    select.value = String(y);
  }
  function grade(name) { const match = String(name).match(/^\s*(\d+)/); return match ? Number(match[1]) : 0; }
  function countLessons(a, date, settings) {
    const special = (settings.special_days || []).find(s => s.date === date);
    let lessons;
    if (special) lessons = Number(special.lessons || 0);
    else {
      const day = new Date(date + 'T00:00:00').getDay();
      lessons = day === 0 || day === 6 || (settings.excluded_dates || []).includes(date) ? 0 : Number((settings.schedule || {})[day] || 0);
    }
    if (!lessons) return 0;
    if (a.full) return lessons;
    const from = Number(a.from), to = Number(a.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
    return Math.max(0, Math.min(lessons, to) - Math.max(1, from) + 1);
  }
  function metric(value, label, note) { return `<div class="analytics-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
  function render(map) {
    const firstYear = Number($('analyticsYear').value);
    const scope = $('analyticsScope').value;
    const from = `${firstYear}-09-01`;
    const to = `${firstYear + 1}-08-31`;
    let classes = Object.values(map);
    if (scope === 'elementary') classes = classes.filter(c => grade(c.name) >= 1 && grade(c.name) <= 4);
    else if (scope === 'high') classes = classes.filter(c => grade(c.name) >= 5 && grade(c.name) <= 11);
    else if (scope === 'current') classes = classes.filter(c => currentClass && String(c.id) === String(currentClass.id));
    const monthCounts = Array(12).fill(0);
    const byReason = Object.create(null);
    const classRows = [];
    let records = 0, lessons = 0, studentDays = new Set(), studentCount = 0;
    classes.forEach(c => {
      studentCount += c.students.length;
      let classLessons = 0, classRecords = 0;
      Object.entries(c.absences).forEach(([date, day]) => {
        if (date < from || date > to) return;
        Object.entries(day).forEach(([studentId, a]) => {
          if (!a || !a.reason) return;
          const n = countLessons(a, date, c.settings || {});
          if (n <= 0) return;
          records++; classRecords++;
          lessons += n; classLessons += n;
          studentDays.add(String(c.id) + ':' + studentId + ':' + date);
          const [y, m] = date.split('-').map(Number);
          const idx = (y - firstYear) * 12 + m - 9;
          if (idx >= 0 && idx < 12) monthCounts[idx] += n;
          byReason[a.reason] = (byReason[a.reason] || 0) + n;
        });
      });
      classRows.push({ name:c.name || 'Без названия', students:c.students.length, records:classRecords, lessons:classLessons });
    });
    const reasonNames = {
      medical:'Медицинская справка', health_admin:'С разрешения медработника / администрации',
      parents_family:'Семейные обстоятельства', parents_health:'Заявление родителей (здоровье)',
      survey:'Посещение врача', sport:'Соревнования', cultural:'Культурные мероприятия',
      ozdorovlenie:'Санаторий', norespect:'Без уважительной причины', other:'Другие уважительные'
    };
    const maxMonthly = Math.max(1, ...monthCounts);
    const maxReason = Math.max(1, ...Object.values(byReason));
    const bars = monthCounts.map((n, i) => `<div class="analytics-bar-item" title="${monthNames[i]}: ${n} пропущенных уроков"><small>${n || '—'}</small><div class="analytics-bar" style="--bar-height:${Math.max(n ? 3 : 0, Math.round(n / maxMonthly * 155))}px"></div><b>${monthNames[i]}</b></div>`).join('');
    const reasons = Object.entries(byReason).sort((a,b) => b[1] - a[1]).map(([reason,n]) => `<div class="analytics-reason"><div class="analytics-reason-header"><span>${safe(reasonNames[reason] || reason)}</span><b>${n}</b></div><div class="analytics-track"><div style="width:${n/maxReason*100}%"></div></div></div>`).join('') || '<p class="analytics-empty">Нет записей за выбранный период</p>';
    const trs = classRows.sort((a,b) => b.lessons - a.lessons).map(row => `<tr><td>${safe(row.name)}</td><td>${row.students}</td><td>${row.records}</td><td><b>${row.lessons}</b></td></tr>`).join('');
    $('analyticsContent').innerHTML = `
      <div class="analytics-kpis">${metric(classes.length,'Классов','В выбранной выборке')}${metric(studentCount,'Учеников','По спискам классов')}${metric(studentDays.size,'Дней отсутствия','Уникальных сочетаний ученик / дата')}${metric(lessons,'Пропущено уроков',`${records} записей о пропусках`)}</div>
      <div class="analytics-grid"><div class="analytics-panel"><h3>Динамика пропусков</h3><p>Пропущенные уроки по месяцам учебного года</p><div class="analytics-bars" role="img" aria-label="Пропущенные уроки: ${monthCounts.map((n,i)=>monthNames[i]+' '+n).join(', ')}">${bars}</div></div>
      <div class="analytics-panel"><h3>Причины отсутствия</h3><p>Количество пропущенных уроков по каждой причине</p>${reasons}</div></div>
      <div class="analytics-panel analytics-classes"><h3>Сравнение классов</h3><p>Ранжирование по числу пропущенных уроков (без нормализации по численности класса)</p><div class="table-wrap"><table><thead><tr><th>Класс</th><th>Учеников</th><th>Записей</th><th>Уроков</th></tr></thead><tbody>${trs || '<tr><td colspan="4">Нет данных</td></tr>'}</tbody></table></div></div>
      <p class="analytics-disclaimer" style="font-size:11px;color:var(--muted);margin-top:12px">Учитываются пропуски в учебные дни согласно текущим настройкам расписания; неполные пропуски пересчитаны в уроки. Данные доступны в пределах RLS-политик текущей учётной записи. Показатели не заменяют официальные отчёты.</p>`;
  }
  window.loadAnalytics = async function () {
    initYear();
    const panel = $('analyticsContent');
    if (!panel) return;
    panel.innerHTML = '<div class="analytics-panel">Загрузка данных из Supabase…</div>';
    try {
      // Reuses the existing report-module loader and its authorization policies.
      const data = await loadAllDataForSummary();
      if (!data) { panel.innerHTML = '<div class="analytics-panel">Не удалось получить данные. Проверьте права доступа и соединение.</div>'; return; }
      cache = data;
      render(cache);
    } catch (err) {
      panel.textContent = 'Не удалось построить аналитику: ' + (err && err.message ? err.message : String(err));
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    initYear();
    ['analyticsYear', 'analyticsScope'].forEach(id => $(id)?.addEventListener('change', () => {
      if (cache) render(cache);
    }));
  });
})();
