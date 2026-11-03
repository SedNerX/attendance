(function () {
  var LS_NEWYEAR = 'attendance_newyear_v1';
  var LS_LAST_DEC = 'attendance_newyear_last_dec_v1';
  var snowRAF = null;
  var snowFlakes = [];
  var snowResizeHandler = null;
  var garlandBuilt = false;
  var lastMobile = null;

  function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function buildGarland() {
    var root = document.querySelector('.ny-garland');
    if (!root) return;
    root.innerHTML = '';
    var N = isMobile() ? 12 : 14;
    for (var i = 0; i < N; i++) {
      var b = document.createElement('span');
      b.className = 'ny-bulb';
      b.style.setProperty('--hue', ((i * 41) % 360) + 'deg');
      b.style.animationDelay = (i * 0.18).toFixed(2) + 's';
      root.appendChild(b);
    }
    garlandBuilt = true;
    lastMobile = isMobile();
  }

  function rebuildGarlandIfNeeded() {
    if (!document.body.classList.contains('newyear')) return;
    if (!garlandBuilt || lastMobile !== isMobile()) buildGarland();
  }

    function startSnow() {
    if (snowRAF) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var canvas = document.getElementById('nySnow');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = 1, w = 0, h = 0;
    var dprMediaQuery = null;

    function resize() {
      var vv = window.visualViewport;
      var cssW = vv ? vv.width : window.innerWidth;
      var cssH = vv ? vv.height : window.innerHeight;

      // Для браузерного зума (Ctrl+колесо) меняется devicePixelRatio.
      // Для pinch-зума меняется visualViewport.scale.
      // Берем максимум, чтобы покрыть оба случая.
      var dprVal = window.devicePixelRatio || 1;
      var scaleVal = vv ? vv.scale : 1;
      var ratio = Math.max(dprVal, scaleVal);

      w = cssW;
      h = cssH;

      canvas.width = Math.floor(cssW * ratio);
      canvas.height = Math.floor(cssH * ratio);
      
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      
      // Сбрасываем трансформацию перед установкой новой, чтобы не накапливалось
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (!snowFlakes.length) seed();
      else if (w > 0 && h > 0) {
        // Пересоздаем снежинки под новый размер, чтобы они не выходили за границы
        seed();
      }
    }

    function seed() {
      var count = Math.max(40, Math.min(90, Math.round(w / 18)));
      snowFlakes = [];
      for (var i = 0; i < count; i++) {
        snowFlakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.8 + Math.random() * 2.2,
          vy: 0.25 + Math.random() * 0.85,
          vx: (Math.random() - 0.5) * 0.35,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.45 + Math.random() * 0.55
        });
      }
    }

    // Слушатель для обычного ресайза и pinch-зума
    snowResizeHandler = function () { resize(); };
    window.addEventListener('resize', snowResizeHandler, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', snowResizeHandler, { passive: true });
    }

    // Слушатель для браузерного зума (Ctrl +/-) — отслеживаем изменение DPR
    var listenDprChange = function() {
      if (dprMediaQuery) dprMediaQuery.removeEventListener('change', onDprChange);
      dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprMediaQuery.addEventListener('change', onDprChange);
    };
    var onDprChange = function() {
      resize();
      listenDprChange(); // Переподписываемся на новое значение DPR
    };
    listenDprChange();

    // Сохраняем ссылку на отписку для stopSnow
    snowResizeHandler._cleanupDpr = function() {
      if (dprMediaQuery) dprMediaQuery.removeEventListener('change', onDprChange);
    };

    resize();
    
    var last = performance.now();

    function loop(now) {
      snowRAF = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      var dt = Math.min(48, now - last) / 16.667;
      last = now;
      ctx.clearRect(0, 0, w, h);
      var light = document.body.classList.contains('light-theme');
      var rgb = light ? '100,130,180' : '255,255,255';
      for (var i = 0; i < snowFlakes.length; i++) {
        var f = snowFlakes[i];
        f.phase += 0.01 * dt;
        f.x += (f.vx + Math.sin(f.phase) * 0.5) * dt;
        f.y += f.vy * dt;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        if (f.x < -4) f.x = w + 4;
        if (f.x > w + 4) f.x = -4;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + rgb + ',' + f.alpha.toFixed(3) + ')';
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    snowRAF = requestAnimationFrame(loop);
  }

      function stopSnow() {
    if (snowResizeHandler) {
      window.removeEventListener('resize', snowResizeHandler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', snowResizeHandler);
      }
      if (snowResizeHandler._cleanupDpr) {
        snowResizeHandler._cleanupDpr();
      }
      snowResizeHandler = null;
    }
    if (snowRAF) {
      cancelAnimationFrame(snowRAF);
      snowRAF = null;
    }
    var canvas = document.getElementById('nySnow');
    if (canvas) {
      var ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    snowFlakes = [];
  }

  function applyNewYear(on) {
    document.body.classList.toggle('newyear', !!on);
    if (on) {
      buildGarland();
      startSnow();
    } else {
      stopSnow();
      garlandBuilt = false;
    }
  }

  function currentSeasonKey() {
    var d = new Date();
    var m = d.getMonth();
    var y = d.getFullYear();
    if (m === 11) return String(y);
    if (m === 0 && d.getDate() <= 15) return String(y - 1);
    return '';
  }

  function shouldEnableAuto() {
    var season = currentSeasonKey();
    if (!season) return false;
    try {
      if (localStorage.getItem(LS_NEWYEAR) === '0') return false;
    } catch (e) {}
    var lastSeason = '';
    try { lastSeason = localStorage.getItem(LS_LAST_DEC) || ''; } catch (e) {}
    if (lastSeason === season) {
      try { return localStorage.getItem(LS_NEWYEAR) === '1'; } catch (e) { return false; }
    }
    return true;
  }

  function markDecemberApplied() {
    var season = currentSeasonKey();
    if (!season) return;
    try { localStorage.setItem(LS_LAST_DEC, season); } catch (e) {}
  }

  window.setNewYearTheme = function (on) {
    applyNewYear(on);
    try { localStorage.setItem(LS_NEWYEAR, on ? '1' : '0'); } catch (e) {}
    if (on) markDecemberApplied();
  };

  window.toggleNewYear = function () {
    window.setNewYearTheme(!document.body.classList.contains('newyear'));
  };

  window.addEventListener('resize', function () {
    rebuildGarlandIfNeeded();
  }, { passive: true });

  if (shouldEnableAuto()) {
    applyNewYear(true);
    markDecemberApplied();
  }
})();