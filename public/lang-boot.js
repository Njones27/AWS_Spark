// Runs before the page paints, so an Arabic page is laid out right to left from the start instead of flipping after
// the app loads. A file rather than an inline script because Spark's Content-Security-Policy allows only 'self' scripts.
// src/i18n/index.ts takes over once the app loads; keep the key, the language list, and the tags in step with it.
(function () {
  var tags = { en: 'en', es: 'es', fr: 'fr', de: 'de', pt: 'pt-BR', it: 'it', ru: 'ru', ar: 'ar', hi: 'hi', zh: 'zh-Hans', ja: 'ja', ko: 'ko' };
  var lang = null;
  try {
    lang = localStorage.getItem('spark-lang');
  } catch (e) {
    // Storage is blocked, so follow the browser.
  }
  if (!tags[lang]) {
    lang = 'en';
    var wanted = navigator.languages || [navigator.language];
    for (var i = 0; i < wanted.length; i++) {
      var main = String(wanted[i]).toLowerCase().split('-')[0];
      if (tags[main]) {
        lang = main;
        break;
      }
    }
  }
  document.documentElement.lang = tags[lang];
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
})();
