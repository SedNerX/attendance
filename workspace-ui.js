/* Progressive enhancements; never handles attendance data. */
(function () {
  'use strict';
  const init = () => {
    const prefs = document.querySelector('.mobile-preferences');
    if (prefs && window.matchMedia('(max-width: 900px)').matches) prefs.open = false;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
