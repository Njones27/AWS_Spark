// Runs before the page paints, so a student whose device (or menu choice) is dark never sees a white flash.
// A file rather than an inline script because Spark's Content-Security-Policy allows only 'self' scripts.
// src/theme.ts takes over once the app loads; keep the key and colours in step with it.
(function () {
  var choice = null;
  try {
    choice = localStorage.getItem('spark-theme');
  } catch (e) {
    // Storage is blocked, so follow the device.
  }
  var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var bar = document.querySelector('meta[name="theme-color"]');
  if (bar) bar.setAttribute('content', dark ? '#121826' : '#f7f2e8');
})();
