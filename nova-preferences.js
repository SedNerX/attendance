/* New users start in the bright premium SaaS layout; existing choices stay. */
try {
  if (localStorage.getItem('attendance_theme_v1') === null) {
    localStorage.setItem('attendance_theme_v1', 'dark');
  }
} catch (_) {
  /* Storage-disabled browsers continue with the original app's fallback. */
}
