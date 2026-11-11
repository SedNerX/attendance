/* Seasonal presentation only. No database access. Original holiday storage keys retained. */
(function () {
  'use strict';
  var LS_NEWYEAR = 'attendance_newyear_v1';
  var LS_LAST_DEC = 'attendance_newyear_last_dec_v1';
  var animation = 0;
  var flakes = [];
  var canvas, context, video;
  var width = 0, height = 0, lastTime = 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 900px)');
  var viewport = window.visualViewport;
  function enabled() { return document.body.classList.contains('newyear'); }
  function isReduced() { return reduced.matches; }
  function currentSeasonKey() {
    var d = new Date(), m = d.getMonth(), y = d.getFullYear();
    if (m === 11) return String(y);
    if (m === 0 && d.getDate() <= 15) return String(y - 1);
    return '';
  }
  function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function save(key,value) { try { localStorage.setItem(key,value); } catch (_) {} }
  function shouldEnableAuto() {
    var season = currentSeasonKey();
    if (!season) return read(LS_NEWYEAR) === '1';
    var choice = read(LS_NEWYEAR);
    if (read(LS_LAST_DEC) !== season) return choice !== '0';
    return choice === '1';
  }
  function buildGarland() {
    var nodes = document.querySelectorAll('.ny-garland');
    nodes.forEach(function (root) {
      root.replaceChildren();
      for (var i = 0, n = narrow.matches ? 12 : 14; i < n; i++) {
        var bulb = document.createElement('span');
        bulb.className = 'ny-bulb';
        const colors = [0, 45, 120, 210, 280, 330, 160, 50, 190, 300, 0, 120, 210, 45];
        bulb.style.setProperty('--hue', colors[i % colors.length] + 'deg');        bulb.style.animationDelay = (i * .16) + 's';
        root.appendChild(bulb);
      }
    });
  }
  function sizeCanvas() {
    if (!canvas || !context) return;
    width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    context.setTransform(dpr,0,0,dpr,0,0);
    var count = Math.min(78, Math.max(18, Math.round(width / (narrow.matches ? 28 : 22))));
    flakes = Array.from({length: count}, function () {
      return {x:Math.random()*width,y:Math.random()*height,r:.8+Math.random()*1.9,
        vy:.32+Math.random()*.75,vx:(Math.random()-.5)*.32,
        phase:Math.random()*Math.PI*2,alpha:.26+Math.random()*.48};
    });
  }
  function frame(now) {
    if (!enabled() || isReduced() || document.hidden) { animation=0; return; }
    var dt = Math.min(2.5,Math.max(.5,(now-lastTime)/16.67)); lastTime=now;
    context.clearRect(0,0,width,height);
    var light = document.body.classList.contains('light-theme');
    flakes.forEach(function (f) {
      f.phase += .013 * dt;
      f.x += (f.vx + Math.sin(f.phase)*.22)*dt;
      f.y += f.vy*dt;
      if (f.y > height + 5) { f.y=-5; f.x=Math.random()*width; }
      if (f.x < -5) f.x=width+5;
      if (f.x > width+5) f.x=-5;
      context.beginPath();
      context.fillStyle = light ? 'rgba(32,91,130,' + f.alpha + ')' : 'rgba(235,249,255,' + f.alpha + ')';
      context.arc(f.x,f.y,f.r,0,Math.PI*2); context.fill();
    });
    animation=requestAnimationFrame(frame);
  }
  function stopSnow() {
    if (animation) cancelAnimationFrame(animation);
    animation=0;
    if (canvas && context) context.clearRect(0,0,canvas.width,canvas.height);
  }
  function startSnow() {
    if (!canvas || isReduced() || document.hidden || animation) return;
    sizeCanvas(); lastTime=performance.now(); animation=requestAnimationFrame(frame);
  }
  function videoState() {
    if (!video) return;
    var play = enabled() && !isReduced() && !document.hidden;
    if (!play) { video.pause(); return; }
    var promise = video.play();
    if (promise && promise.catch) promise.catch(function () { /* poster is a safe fallback */ });
  }
  function syncControls() {
    document.querySelectorAll('[data-season-toggle]').forEach(function (button) {
      button.setAttribute('aria-checked', String(enabled()));
      button.setAttribute('aria-label', enabled() ? 'Выключить новогоднюю тему' : 'Включить новогоднюю тему');
      button.title = enabled() ? 'Выключить зимнее оформление' : 'Включить зимнее оформление';
    });
  }
    function apply(on) {
    document.body.classList.toggle('newyear',!!on);
    if (on) {
      // При включении зимы проверяем, какую тему выбрал пользователь
      var savedTheme = null;
      try { savedTheme = localStorage.getItem('attendance_theme_v1'); } catch(e) {}
      
      // Если тема "auto" или не выбрана, включаем тёмную (для лучшего вида видео)
      if (!savedTheme || savedTheme === 'auto') {
        document.body.classList.remove('light-theme');
        // Обновляем кнопки в интерфейсе, если они есть
        document.querySelectorAll('.theme-btn').forEach(function(btn, i) {
          var labels = ['dark', 'light', 'auto'];
          btn.classList.toggle('active', labels[i] === 'dark');
        });
      }
      
      buildGarland(); 
      startSnow(); 
    }
    else stopSnow();
    videoState(); syncControls();
    window.dispatchEvent(new CustomEvent('attendance:season-change',{detail:{enabled:!!on}}));
  }
  
  window.setNewYearTheme = function (on) {
    apply(!!on);
    save(LS_NEWYEAR,on?'1':'0');
    if (currentSeasonKey()) save(LS_LAST_DEC,currentSeasonKey());
  };
  window.toggleNewYear = function () { window.setNewYearTheme(!enabled()); };
  function setup() {
    canvas = document.getElementById('nySnow');
    context = canvas && canvas.getContext('2d');
    video = document.querySelector('.ny-video-bg');
    document.querySelectorAll('[data-season-toggle]').forEach(function (btn) {
      btn.addEventListener('click',window.toggleNewYear);
    });
    apply(shouldEnableAuto());
    if (currentSeasonKey()) save(LS_LAST_DEC,currentSeasonKey());
  }
  function resize() { if (enabled() && !isReduced()) sizeCanvas(); }
  window.addEventListener('resize',resize,{passive:true});
  if (viewport) viewport.addEventListener('resize',resize,{passive:true});
  narrow.addEventListener('change',function(){if(enabled())buildGarland();});
  reduced.addEventListener('change',function(){if (isReduced()) stopSnow(); else if (enabled()) startSnow(); videoState();});
  document.addEventListener('visibilitychange',function(){ if (document.hidden) stopSnow(); else if (enabled()) startSnow(); videoState(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
