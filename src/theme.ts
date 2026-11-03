import { useSyncExternalStore } from 'react';

// Light or dark colours, switched by `data-theme` on <html> (the dark values live in styles/theme.css). public/theme-boot.js
// sets the attribute before the first paint so a dark-mode student never sees a white flash; this module keeps it in
// step with the menu and with the device's own setting.

export type Theme = 'light' | 'dark';
/** What the student picked in the menu. 'system' follows the device. */
export type ThemeChoice = 'system' | Theme;

/** Keep in step with public/theme-boot.js. */
export const THEME_KEY = 'spark-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** The browser bar colour for each theme: --paper. */
const BAR_COLOR: Record<Theme, string> = { light: '#f7f2e8', dark: '#121826' };

export function parseThemeChoice(raw: string | null): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function resolveTheme(choice: ThemeChoice, deviceDark: boolean): Theme {
  if (choice !== 'system') return choice;
  return deviceDark ? 'dark' : 'light';
}

export interface ThemeInfo {
  choice: ThemeChoice;
  theme: Theme;
}

let info: ThemeInfo = { choice: 'system', theme: 'light' };
const listeners = new Set<() => void>();

function update(choice: ThemeChoice) {
  const deviceDark = typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
  const theme = resolveTheme(choice, deviceDark);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
  }
  if (choice === info.choice && theme === info.theme) return;
  info = { choice, theme };
  listeners.forEach((l) => l());
}

/** Read the saved choice, tag <html>, and follow the device's light/dark setting. Call once at start-up. */
export function startThemeWatch() {
  let choice: ThemeChoice = 'system';
  try {
    choice = parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    // Storage is blocked, so follow the device.
  }
  update(choice);
  matchMedia(DARK_QUERY).addEventListener('change', () => update(info.choice));
}

export function setThemeChoice(next: ThemeChoice) {
  try {
    if (next === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Not saved; the choice still lasts until the tab closes.
  }
  update(next);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): ThemeInfo {
  return useSyncExternalStore(subscribe, () => info);
}
