import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectLang, LANG_KEY, LANGUAGES, MESSAGES, parseLang, translate } from '.';
import { en, type MessageKey } from './strings/en';

const keys = Object.keys(en) as MessageKey[];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('languages', () => {
  it('has a word list for every language in the menu', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual(LANGUAGES.map((l) => l.id).sort());
  });

  it.each(LANGUAGES.map((l) => l.id))('%s gives every key, with the same {placeholders}', (lang) => {
    for (const key of keys) {
      const text = MESSAGES[lang][key];
      expect(text, key).toBeTruthy();
      expect(placeholders(text), key).toEqual(placeholders(en[key]));
    }
  });

  it.each(LANGUAGES.map((l) => l.id))('%s keeps AWS names in English', (lang) => {
    for (const key of keys) {
      for (const name of ['AWS', 'Amazon Web Services', 'Crumb & Co.', 'Maple Hollow']) {
        if (en[key].includes(name)) expect(MESSAGES[lang][key], key).toContain(name);
      }
    }
  });

  it('only Arabic reads right to left', () => {
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.id)).toEqual(['ar']);
  });
});

describe('translate', () => {
  it('fills in placeholders', () => {
    expect(translate('en', 'home.levelsDone', { done: 3, total: 15 })).toBe('3 of 15 levels done');
    expect(translate('es', 'home.levelsDone', { done: 3, total: 15 })).toBe('3 de 15 niveles completados');
  });
});

describe('picking a language', () => {
  it('matches the browser on the main part of its tag', () => {
    expect(detectLang(['pt-BR', 'en'])).toBe('pt');
    expect(detectLang(['zh-TW'])).toBe('zh');
    expect(detectLang(['nl-NL', 'fr-CA'])).toBe('fr');
  });

  it('falls back to English', () => {
    expect(detectLang(['nl'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });

  it('ignores an unknown saved choice', () => {
    expect(parseLang('klingon')).toBeNull();
    expect(parseLang(null)).toBeNull();
    expect(parseLang('ar')).toBe('ar');
  });

  it('shares its storage key and language list with the pre-paint script', () => {
    const boot = readFileSync(new URL('../../public/lang-boot.js', import.meta.url), 'utf8');
    expect(boot).toContain(`'${LANG_KEY}'`);
    for (const l of LANGUAGES) expect(boot, l.id).toContain(`${l.id}: '${l.tag}'`);
  });
});
