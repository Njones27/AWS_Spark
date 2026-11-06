import '@fontsource-variable/fredoka';
import '@fontsource-variable/lexend';
import '@xyflow/react/dist/style.css';
import './styles/theme.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startDeviceWatch } from './device';
import { STORAGE_NAME, useApp } from './store';
import { appSync } from './sync';
import { startThemeWatch } from './theme';

// After a deploy, a tab opened earlier can ask for a file that is gone. Reload once to get the new version.
// The sessionStorage mark makes sure a file that is still missing after the reload can't cause a reload loop.
const RELOAD_MARK = 'spark-reloaded';
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_MARK)) return;
    sessionStorage.setItem(RELOAD_MARK, '1');
  } catch {
    return; // Without storage there's no loop guard, so don't reload.
  }
  event.preventDefault();
  window.location.reload();
});
// Once the app has run a while after loading, clear the mark so a later deploy can reload this tab once too. Not right
// away: a file that is missing at start-up would then reload forever.
window.addEventListener(
  'load',
  () =>
    window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_MARK);
      } catch {
        // Storage is blocked, so there is no mark to clear.
      }
    }, 10_000),
  { once: true },
);

// Every tab keeps its own copy of the progress in memory and writes all of it back on each change. Without this, a tab
// left open in the background would put its older copy back the next time anything changed in it, erasing a design or
// level finished in another tab. When another tab saves, this one reads the new save instead.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_NAME && e.newValue !== null) void useApp.persist.rehydrate();
});

// Progress syncs to the student's Builder Key in the background. The app never waits for it.
appSync.start();

// Tags <html> with data-device="phone" or "laptop" before the first paint.
startDeviceWatch();
// Keeps data-theme="light" or "dark" on <html> in step with the Theme menu and the device setting.
startThemeWatch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
