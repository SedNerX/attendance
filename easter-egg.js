(function () {
  var NOV_JAN = true;
  var konamiBuffer = [];
  var konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var turboRAF = null;

  function inSeason() {
    if (!NOV_JAN) return true;
    var m = new Date().getMonth();
    return m === 10 || m === 11 || m === 0;
  }

  function showBadge(text) {
    var el = document.getElementById('eeTurboBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'eeTurboBadge';
      el.className = 'ee-turbo-badge';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2200);
  }

  function turboSnow() {
    var canvas = document.getElementById('nySnow');
    if (!canvas) {
      showBadge('🎁 Секретный снегопад!');
      return;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var flakes = [];
    var count = Math.min(400, Math.round(w / 4));
    for (var i = 0; i < count; i++) {
      flakes.push({
        x: Math.random() * w,
        y: Math.random() * h - h,
        r: 2 + Math.random() * 5,
        vy: 1.6 + Math.random() * 3.2,
        vx: (Math.random() - 0.5) * 1.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.7 + Math.random() * 0.3,
        color: i % 9 === 0 ? 'gold' : (i % 9 === 1 ? 'cyan' : 'white')
      });
    }

    var start = performance.now();
    var DURATION = 15000;
    var last = start;

    function frame(now) {
      var dt = Math.min(48, now - last) / 16.667;
      last = now;
      var elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      var light = document.body.classList.contains('light-theme');
      var whiteRgb = light ? '100,130,180' : '255,255,255';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.phase += 0.02 * dt;
        f.x += (f.vx + Math.sin(f.phase) * 1.8) * dt;
        f.y += f.vy * dt;
        if (f.y > h + 8) { f.y = -8; f.x = Math.random() * w; }
        if (f.x < -8) f.x = w + 8;
        if (f.x > w + 8) f.x = -8;
        var fill;
        if (f.color === 'gold') fill = 'rgba(245, 215, 110, ' + f.alpha.toFixed(3) + ')';
        else if (f.color === 'cyan') fill = 'rgba(120, 220, 255, ' + f.alpha.toFixed(3) + ')';
        else fill = 'rgba(' + whiteRgb + ',' + f.alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.fillStyle = fill;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (elapsed < DURATION) {
        turboRAF = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, w, h);
        turboRAF = null;
      }
    }
    if (turboRAF) cancelAnimationFrame(turboRAF);
    turboRAF = requestAnimationFrame(frame);
    showBadge('🎁 Секретный снегопад!');
  }

  function onKonami() {
    if (!inSeason()) return;
    turboSnow();
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiBuffer.push(key);
    if (konamiBuffer.length > konamiSeq.length) konamiBuffer.shift();
    var match = konamiBuffer.length === konamiSeq.length
      && konamiBuffer.every(function (k, i) { return k === konamiSeq[i]; });
    if (match) {
      konamiBuffer = [];
      onKonami();
    }
  });

  var discoTimer = null;
  var discoOn = false;

  function inDiscoSeason() {
    var m = new Date().getMonth();
    return m === 10 || m === 11 || m === 0;
  }

  function showDiscoBadge() {
    var el = document.getElementById('eeDiscoBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'eeDiscoBadge';
      el.className = 'disco-badge';
      document.body.appendChild(el);
    }
    el.textContent = 'ААА Дискотека!';
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2200);
  }

  function toggleDisco() {
    if (!inDiscoSeason()) return;
    if (document.hidden) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      showDiscoBadge();
      return;
    }
    discoOn = true;
    document.body.classList.add('disco');
    showDiscoBadge();
    clearTimeout(discoTimer);
    discoTimer = setTimeout(function () {
      document.body.classList.remove('disco');
      discoOn = false;
    }, 10000);
  }

  function attachDiscoWatcher() {
    var target = document.getElementById('sideClassName');
    if (!target) return;
    target.style.cursor = 'pointer';
    var clicks = [];
    var timer = null;
    target.addEventListener('click', function () {
      if (!inDiscoSeason()) return;
      clicks.push(Date.now());
      if (clicks.length > 5) clicks.shift();
      if (clicks.length === 5 && (clicks[4] - clicks[0]) < 2000) {
        clicks = [];
        clearTimeout(timer);
        toggleDisco();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(function () { clicks = []; }, 2200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachDiscoWatcher);
  } else {
    attachDiscoWatcher();
  }
    function inSleighSeason() {
    var d = new Date();
    var m = d.getMonth();
    return m === 11 || (m === 0 && d.getDate() <= 15);
  }

  function sleighDone() {
    try { return sessionStorage.getItem('ee_sleigh_done') === '1'; } catch (e) { return false; }
  }

  function markSleighDone() {
    try { sessionStorage.setItem('ee_sleigh_done', '1'); } catch (e) {}
  }

  function buildSleighOverlay() {
    var overlay = document.getElementById('eeSleighOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'eeSleighOverlay';
    overlay.className = 'sleigh-overlay';
    overlay.innerHTML =
      '<div class="sleigh">' +
        '<div class="sleigh-reindeer">' +
          '<span class="rn-body"></span>' +
          '<span class="rn-head"></span>' +
          '<span class="rn-antler rn-antler-l"></span>' +
          '<span class="rn-antler rn-antler-r"></span>' +
          '<span class="rn-legs"><i></i><i></i><i></i><i></i></span>' +
        '</div>' +
        '<div class="sleigh-body"></div>' +
        '<div class="santa">' +
          '<span class="santa-hat"></span>' +
          '<span class="santa-face"></span>' +
          '<span class="santa-beard"></span>' +
          '<span class="santa-body"></span>' +
        '</div>' +
        '<div class="sleigh-runner"></div>' +
        '<div class="sleigh-trail"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function launchSleigh() {
    if (document.hidden) return;
    showBadge('🎅 Дед Мороз приехал!');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var overlay = buildSleighOverlay();
    overlay.classList.remove('active');
    void overlay.offsetWidth;
    overlay.classList.add('active');
    clearTimeout(overlay._hideTimer);
    overlay._hideTimer = setTimeout(function () {
      overlay.classList.remove('active');
    }, 4200);
  }

  var statsClicks = [];
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#stats')) return;
    if (!inSleighSeason()) return;
    if (sleighDone()) return;
    var now = Date.now();
    statsClicks.push(now);
    statsClicks = statsClicks.filter(function (t) { return now - t <= 2500; });
    if (statsClicks.length >= 5) {
      statsClicks = [];
      markSleighDone();
      launchSleigh();
    }
  });
})();