/*
 * ATTEND NOVA — progressive UI enhancements (no database operations).
 * Works with legacy globally-defined handlers. No framework, no build step.
 */
(function () {
  'use strict';
  var isTeacher = document.body.classList.contains('teacher-app');
  var isViewer = document.body.classList.contains('viewer-app');
  var storageKey = 'attendance_theme_v1';
  var preference = null;
  try {
    preference = localStorage.getItem(storageKey);
    // New installs open in the bright SaaS presentation. Saved choices win.
    if (!preference) {
      preference = 'light';
      localStorage.setItem(storageKey, preference);
    }
  } catch (_) { preference = 'light'; }

  var icons = {
    brand: '<path d="M4 5.5h6.5l2 2 2-2H21v13H14l-1.5 2L11 18.5H4z"/><path d="M12.5 7.5v11M6.5 9h3.5M16 9h2.5M16 12h2.5"/>',
    attendance: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11.5l2 2 4-4M8 17h7"/>',
    reports: '<path d="M5 20V11m5 9V6m5 14v-8m5 8V4"/><path d="M3 20h19"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15.1l1.4 1.1-2 3.4-1.7-.7a8.9 8.9 0 0 1-2.1 1.2l-.3 1.9h-4l-.3-1.9a9 9 0 0 1-2.1-1.2l-1.7.7-2-3.4L6 15.1a8.9 8.9 0 0 1 0-2.3l-1.4-1.1 2-3.4 1.7.7a9 9 0 0 1 2.1-1.2l.3-1.9h4l.3 1.9a9 9 0 0 1 2.1 1.2l1.7-.7 2 3.4-1.4 1.1a8.9 8.9 0 0 1 0 2.3z" transform="translate(-.5 -1) scale(1.04)"/>',
    analytics: '<path d="M4 17l5-5 4 3 7-9"/><path d="M16 6h4v4"/><path d="M4 21h16"/>',
    'admin-summary': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    '1':'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5M10 12h6M10 16h6"/>',
    '2':'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 14v3m5-7v7m5-10v10"/>',
    year:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M8 15h4m-4 3h7"/>',
    elementary:'<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-7h6v7M8 10h1m6 0h1"/>',
    high:'<path d="M4 21V5l8-3 8 3v16M2 21h20M9 8h.5m5 0h.5M9 12h.5m5 0h.5M10 21v-5h4v5"/>',
    yearly:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 2v4m10-4v4M3 10h18m-12 4h2m4 0h2m-8 4h2"/>'
    
  };
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  function putIcons() {
    document.querySelectorAll('.side-btn').forEach(function (button) {
      var name = button.getAttribute(isTeacher ? 'data-tab' : 'data-report');
      var holder = button.querySelector('.side-icon');
      if (holder && icons[name]) holder.innerHTML = svg(icons[name]);
    });
    var logo = document.querySelector('.side-brand-icon');
    if (logo) logo.innerHTML = svg(icons.brand);
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }
  function setThemeVisual(theme) {
    var selected = theme;
    if (selected === 'auto') {
      selected = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (isTeacher && typeof window.setTheme === 'function') {
      window.setTheme(theme);
    } else {
      document.body.classList.toggle('light-theme', selected === 'light');
      try { localStorage.setItem(storageKey, theme); } catch (_) { /* private browsing */ }
    }
    updateThemeButton();
  }
  function updateThemeButton() {
    var button = document.querySelector('[data-ux-action="theme"]');
    if (!button) return;
    var light = document.body.classList.contains('light-theme');
    button.innerHTML = light
      ? svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5m0-14.2-1.5 1.5M6.4 17.6l-1.5 1.5"/>')
      : svg('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>');
    button.title = light ? 'Тёмная тема' : 'Светлая тема';
  }
  function syncAccent() {
    // Keep existing user-selected accent working in both visual themes.
    try {
      var accent = JSON.parse(localStorage.getItem('attendance_accent_v1') || 'null');
      if (!accent || !accent.hex || !accent.rgbStr) return;
      ['--primary','--primary-hover','--primary-dark'].forEach(function (key) {document.body.style.setProperty(key,accent.hex);});
      document.body.style.setProperty('--primary-rgb',accent.rgbStr);
    } catch (_) { /* Optional preference */ }
  }
  function syncUser() {
    var email = document.getElementById('userEmail');
    if (!email) return;
    var value = (email.textContent || '').trim();
    setText('uxProfileEmail', value && value !== '—' ? value : 'Личный кабинет');
  }
    function syncClass() {
    var indicator = document.getElementById('uxClassIndicator');
    if (!indicator) return;
    
    if (isViewer) {
      var select = document.getElementById('classSelect');
      var value = select && select.selectedOptions.length ? select.selectedOptions[0].textContent.trim() : 'Все классы школы';
      if (!value || value === '—') value = 'Все классы школы';
      
      // Сохраняем точку, если она есть
      var dot = indicator.querySelector('.ux-indicator-dot');
      indicator.textContent = value;
      if (dot) indicator.insertBefore(dot, indicator.firstChild);
      else {
         var newDot = document.createElement('span');
         newDot.className='ux-indicator-dot';
         indicator.insertBefore(newDot,indicator.firstChild);
      }
    } else if (isTeacher) {
      // Для учителя текст ставит app.js, мы просто гарантируем наличие точки
      if (!indicator.querySelector('.ux-indicator-dot')) {
        var dot = document.createElement('span');
        dot.className='ux-indicator-dot';
        dot.setAttribute('aria-hidden','true');
        indicator.insertBefore(dot,indicator.firstChild);
      }
    }
  }
    function updateToday() {
    var now = new Date();
    var text = now.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    var el = document.getElementById('uxDateToday');
    if (el) el.textContent=text.charAt(0).toUpperCase()+text.slice(1);
  }
  function syncStats() {
    var stats = document.getElementById('stats');
    if (!stats) return;
    var totalEl = stats.querySelector('.stat.total .value');
    var presentEl = stats.querySelector('.stat.present .value');
    if (!totalEl || !presentEl) return;
    var total = Number(totalEl.textContent.replace(/\s/g,''));
    var present = Number(presentEl.textContent.replace(/\s/g,''));
    if (!Number.isFinite(total) || !Number.isFinite(present)) return;
    var percent = total > 0 ? Math.max(0,Math.min(100,Math.round(present / total * 100))) : 0;
    setText('uxAttendancePct',total ? percent+'%' : '—');
    setText('uxPresenceInfo',total ? present+' из '+total+' в классе' : 'Список пока пуст');
    var ring=document.querySelector('.ux-ring');
    if (ring) ring.setAttribute('aria-label',total ? 'Присутствуют '+present+' из '+total+' учеников, '+percent+' процентов' : 'Список класса пуст');
    var circle=document.querySelector('.ux-ring-progress');
    if (circle) circle.style.strokeDashoffset=String(2*Math.PI*49*(1-percent/100));
  }
  function updateHeading() {
    var title = document.querySelector('.ux-welcome h1');
    var subtitle = document.querySelector('.ux-welcome p');
    if (!title || !subtitle) return;
    var active = document.querySelector('.side-menu .side-btn.active');
    var section = active && active.getAttribute(isTeacher?'data-tab':'data-report');
    var entries = isTeacher ? {
      attendance:['Хорошего учебного дня!','Отмечайте посещаемость быстро. Всё важное — перед глазами.'],
      reports:['Отчёты без ручных подсчётов.','Точные данные вашего класса в официальных табличных формах.'],
      settings:['Всё настроено под ваш класс.','Управляйте учебным календарём, расписанием и списком учеников.']
    } : {
      analytics:['Данные, которые помогают.','Вся посещаемость школы: от общей картины до детального сравнения.'],
      '1':['Официальные отчёты.','Показатели класса за четверть и выгрузка в Excel.'],
      '2':['Ежемесячная отчётность.','Табличный отчёт за месяц в привычной структуре.'],
      year:['Результаты учебного года.','Сводка посещаемости по всем четвертям.'],
      elementary:['Начальная школа.','Сводный отчёт для 1–4 классов.'],
      high:['Средняя и старшая школа.','Сводный отчёт для 5–11 классов.'],
      yearly:['Годовая статистика.','Сводные показатели по месяцам учебного года.']
    };
    var item = entries[section];
    if (!item) return;
    title.textContent=item[0];
    subtitle.textContent=item[1];
    // A journal-wide bulk action must never appear while viewing reports/settings.
    var markAll = document.querySelector('.ux-hero-primary[data-ux-action="markall"]');
    if (markAll) markAll.hidden = section !== 'attendance';
    // The admin action is useful both as refresh on Overview and as a return link.
    var analyticsButton = document.querySelector('.ux-hero-primary[data-ux-action="analytics"]');
    if (analyticsButton) analyticsButton.textContent = section === 'analytics' ? '↻ Обновить аналитику' : '↗ К аналитике';
  }
  function focusSearch() {
    if (!isTeacher) return;
    var tab = document.querySelector('.side-btn[data-tab="attendance"]');
    if (tab && !tab.classList.contains('active')) tab.click();
    var search = document.getElementById('searchInput');
    if (search) {
      search.focus({preventScroll:true});
      search.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    }
  }
  function goAnalytics() {
    if (!isViewer) return;
    if (typeof window.switchReportPane === 'function') window.switchReportPane('analytics');
    if (typeof window.loadAnalytics === 'function') window.loadAnalytics();
    updateHeading();
  }
  function wireActions() {
    document.querySelectorAll('[data-ux-action]').forEach(function (button) {
      button.addEventListener('click',function () {
        switch (button.getAttribute('data-ux-action')) {
          case 'search': focusSearch(); break;
          case 'theme': setThemeVisual(document.body.classList.contains('light-theme')?'dark':'light'); break;
          case 'overview': case 'analytics': goAnalytics(); break;
          case 'markall': if (typeof window.markAllPresent === 'function') window.markAllPresent(); break;
        }
      });
    });
    document.addEventListener('keydown',function (event) {
      if (!isTeacher) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k') {
        event.preventDefault(); focusSearch();
      }
    });
    document.querySelectorAll('.side-menu .side-btn').forEach(function (button) {
      button.addEventListener('click',function () { setTimeout(updateHeading,0); });
    });
    document.querySelectorAll('.color-dot').forEach(function (dot) {
      dot.addEventListener('click',function () {setTimeout(syncAccent,0);});
    });
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.addEventListener('click',function () {setTimeout(updateThemeButton,0);});
    });
    if (isViewer) {
      var select=document.getElementById('classSelect');
      if (select) select.addEventListener('change',function () {setTimeout(syncClass,10);});
    }
  }
  function watchText(id,callback) {
    var el = document.getElementById(id);
    if (!el) return;
    var observer = new MutationObserver(callback);
    observer.observe(el,{childList:true,subtree:true,characterData:true});
  }
  function startAdminDashboard() {
    var login = document.getElementById('loginScreen');
    var select = document.getElementById('classSelect');
    if (!login || !select) return;
    var started = false;
    function startIfReady() {
      if (started || login.style.display !== 'none' || !select.options.length) return;
      started = true;
      // All metrics are calculated from real Supabase rows by analytics-dashboard.js.
      setTimeout(function () {
        if (document.getElementById('reportPane-analytics')?.classList.contains('active') && typeof window.loadAnalytics === 'function') {
          window.loadAnalytics();
        }
      }, 150);
    }
    var watchLogin=new MutationObserver(startIfReady);
    watchLogin.observe(login,{attributes:true,attributeFilter:['style']});
    var watchClasses=new MutationObserver(function () {syncClass();startIfReady();});
    watchClasses.observe(select,{childList:true,subtree:true});
    startIfReady();
  }
  function init() {
    // On first launch the visual shell defaults to the requested bright SaaS
    // layout. Saved light, dark and auto choices remain authoritative.
    setThemeVisual(preference || 'light');
    syncAccent();
    putIcons();updateToday();syncUser();syncClass();syncStats();updateHeading();wireActions();
    watchText('userEmail',syncUser);
    if (isTeacher) {
      watchText('sideClassName',syncClass);
      var stats=document.getElementById('stats');
      if (stats) new MutationObserver(syncStats).observe(stats,{childList:true});
    }
    if (isViewer) startAdminDashboard();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
    // Логика кнопки "Наверх"
  function initScrollToTop() {
    var btn = document.getElementById('scrollTopBtn');
    if (!btn) return;
    
    window.addEventListener('scroll', function() {
      if (window.scrollY > 300) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }, { passive: true });
    
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // Запускаем после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollToTop);
  } else {
    initScrollToTop();
  }
    // Секретный плеер (3 клика по кнопке "Наверх")
  function initSecretMusic() {
    // НЕ включаем плеер на мобильных и планшетах
    if (window.matchMedia('(max-width: 900px)').matches) return;

    var btn = document.getElementById('scrollTopBtn');
    var player = document.getElementById('secretMusicPlayer');
    var iframe = document.getElementById('yandexMusicIframe');
    if (!btn || !player || !iframe) return;

    var clicks = 0;
    var timer = null;

    btn.addEventListener('click', function(e) {
      clicks++;
      if (clicks === 1) {
        timer = setTimeout(function() { clicks = 0; }, 1000);
      }
      
      if (clicks >= 3) {
        clearTimeout(timer);
        clicks = 0;
        
        if (player.style.display === 'none' || player.style.display === '') {
          player.style.display = 'block';
          
          if (iframe.src === 'about:blank' || iframe.src === '') {
            // Твоя ссылка из Яндекс Музыки:
            iframe.src = 'https://music.yandex.ru/iframe/playlist/nikita.tarancko/3'; 
          }
        } else {
          player.style.display = 'none';
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSecretMusic);
  } else {
    initSecretMusic();
  }

    // --- Управление выпадающим меню профиля ---
  window.toggleProfileMenu = function() {
    var menu = document.getElementById('uxProfileMenu');
    var trigger = document.getElementById('uxProfileTrigger');
    if (!menu || !trigger) return;
    var isOpen = menu.classList.toggle('is-open');
    trigger.classList.toggle('is-open', isOpen);
  };
  
  window.closeProfileMenu = function() {
    var menu = document.getElementById('uxProfileMenu');
    var trigger = document.getElementById('uxProfileTrigger');
    if (menu) menu.classList.remove('is-open');
    if (trigger) trigger.classList.remove('is-open');
  };

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.ux-profile-dropdown-wrap')) {
      window.closeProfileMenu();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') window.closeProfileMenu();
  });
  
})();
