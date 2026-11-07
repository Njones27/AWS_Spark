import { useSyncExternalStore } from 'react';
import { ar } from './strings/ar';
import { de } from './strings/de';
import { en, type MessageKey, type Messages } from './strings/en';
import { es } from './strings/es';
import { fr } from './strings/fr';
import { hi } from './strings/hi';
import { it } from './strings/it';
import { ja } from './strings/ja';
import { ko } from './strings/ko';
import { pt } from './strings/pt';
import { ru } from './strings/ru';
import { zh } from './strings/zh';

// The language the menus and title screen are shown in. Like the theme, it belongs to this device, not to the Builder
// Key, so it lives in its own localStorage key. public/lang-boot.js sets <html lang dir> before the first paint so an
// Arabic page never flashes left to right; this module keeps them in step with the menu.

export type { MessageKey } from './strings/en';

export type Lang = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ru' | 'ar' | 'hi' | 'zh' | 'ja' | 'ko';

export interface LanguageDef {
  id: Lang;
  /** The language's name in its own language, as the menu shows it. */
  name: string;
  /** The English name, for the menu's tooltip and for people who can't read the script. */
  english: string;
  dir: 'ltr' | 'rtl';
  /** The BCP 47 tag for <html lang>, which picks the right fonts and line breaking. */
  tag: string;
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'en', name: 'English', english: 'English', dir: 'ltr', tag: 'en' },
  { id: 'es', name: 'Español', english: 'Spanish', dir: 'ltr', tag: 'es' },
  { id: 'fr', name: 'Français', english: 'French', dir: 'ltr', tag: 'fr' },
  { id: 'de', name: 'Deutsch', english: 'German', dir: 'ltr', tag: 'de' },
  { id: 'pt', name: 'Português', english: 'Portuguese', dir: 'ltr', tag: 'pt-BR' },
  { id: 'it', name: 'Italiano', english: 'Italian', dir: 'ltr', tag: 'it' },
  { id: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr', tag: 'ru' },
  { id: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl', tag: 'ar' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi', dir: 'ltr', tag: 'hi' },
  { id: 'zh', name: '中文', english: 'Chinese', dir: 'ltr', tag: 'zh-Hans' },
  { id: 'ja', name: '日本語', english: 'Japanese', dir: 'ltr', tag: 'ja' },
  { id: 'ko', name: '한국어', english: 'Korean', dir: 'ltr', tag: 'ko' },
];

export const MESSAGES: Record<Lang, Messages> = { en, es, fr, de, pt, it, ru, ar, hi, zh, ja, ko };

/** Keep in step with public/lang-boot.js. */
export const LANG_KEY = 'spark-lang';

export function parseLang(raw: string | null | undefined): Lang | null {
  if (!raw) return null;
  return LANGUAGES.some((l) => l.id === raw) ? (raw as Lang) : null;
}

/** The first of the browser's languages Spark has, matched on the main part ("pt-BR" → pt, "zh-TW" → zh). */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const found = parseLang(tag.toLowerCase().split('-')[0]);
    if (found) return found;
  }
  return 'en';
}

export const langDef = (lang: Lang): LanguageDef => LANGUAGES.find((l) => l.id === lang)!;

/** The words for `key` in `lang`, with each {name} filled in from `vars`. Falls back to English. */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = MESSAGES[lang][key] ?? en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

let current: Lang = 'en';
const listeners = new Set<() => void>();

function apply(lang: Lang) {
  if (typeof document !== 'undefined') {
    const def = langDef(lang);
    document.documentElement.lang = def.tag;
    document.documentElement.dir = def.dir;
  }
  if (lang === current) return;
  current = lang;
  listeners.forEach((l) => l());
}

/** Read the saved choice (or the browser's language) and tag <html>. Call once at start-up. */
export function startLangWatch() {
  let saved: Lang | null = null;
  try {
    saved = parseLang(localStorage.getItem(LANG_KEY));
  } catch {
    // Storage is blocked, so follow the browser.
  }
  apply(saved ?? detectLang(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]));
}

export function setLang(next: Lang) {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Not saved; the choice still lasts until the tab closes.
  }
  apply(next);
}

export const getLang = () => current;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** `t('home.story')` in the language picked in the menu. Re-renders when the language changes. */
export function useT(): T {
  const lang = useLang();
  return (key, vars) => translate(lang, key, vars);
}
