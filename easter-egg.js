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

  var turboCleanup = null;
  function turboSnow() {
    var canvas = document.getElementById('eeTurboSnow');
    showBadge('🎁 Секретный снегопад!');
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (turboCleanup) turboCleanup();
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w, h, flakes, last, end, raf = 0;
    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      var count = Math.min(260, Math.round(w / 5));
      flakes = Array.from({length:count},function(_,i){return {
        x: Math.random()*w, y:Math.random()*h-h, r:1.5+Math.random()*3.2,
        vy:1.4+Math.random()*2.5,vx:(Math.random()-.5)*1.2,
        phase:Math.random()*Math.PI*2, alpha:.45+Math.random()*.45,
        color:i%11===0?'gold':(i%11===1?'cyan':'white')};});
    }
    function cleanup() {
      cancelAnimationFrame(raf); raf=0;
      window.removeEventListener('resize',resize);
      document.removeEventListener('visibilitychange',onVisibility);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      canvas.classList.remove('active'); turboCleanup=null;
    }
    function onVisibility() { if(document.hidden) cleanup(); }
    function frame(now) {
      if (now >= end || document.hidden) { cleanup(); return; }
      var dt=Math.min(2.5,Math.max(.5,(now-last)/16.667));last=now;
      ctx.clearRect(0,0,w,h);
      var light=document.body.classList.contains('light-theme');
      flakes.forEach(function(f){
        f.phase+=.02*dt; f.x+=(f.vx+Math.sin(f.phase)*.65)*dt;f.y+=f.vy*dt;
        if(f.y>h+6){f.y=-6;f.x=Math.random()*w;}
        if(f.x<-6)f.x=w+6;if(f.x>w+6)f.x=-6;
        ctx.beginPath();
        ctx.fillStyle=f.color==='gold'?'rgba(246,204,107,'+f.alpha+')':
          f.color==='cyan'?'rgba(101,220,245,'+f.alpha+')':
          light?'rgba(55,110,160,'+f.alpha+')':'rgba(255,255,255,'+f.alpha+')';
        ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
      });
      raf=requestAnimationFrame(frame);
    }
    turboCleanup=cleanup;
    resize();canvas.classList.add('active');
    window.addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',onVisibility);
    last=performance.now();end=last+15000;
    raf=requestAnimationFrame(frame);
  }

  function onKonami() {
    if (!inSeason()) return;
    turboSnow();
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.isContentEditable || e.target.closest('input, textarea, select, [contenteditable=\"true\"]'))) return;
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
    // The legacy sidebar class label stays secret-triggerable on desktop.
    // The redesigned class chip offers the same five-tap interaction on phones.
    var targets = [document.getElementById('sideClassName'), document.getElementById('uxClassIndicator')].filter(Boolean);
    if (!targets.length) return;
    var clicks = [];
    var timer = null;
    targets.forEach(function (target) {
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