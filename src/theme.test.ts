import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseThemeChoice, resolveTheme, THEME_KEY } from './theme';

describe('theme', () => {
  it('follows the device on system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets the student override the device either way', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('treats a missing or unknown saved choice as system', () => {
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('blue')).toBe('system');
    expect(parseThemeChoice('dark')).toBe('dark');
  });

  it('shares its storage key with the pre-paint script', () => {
    const boot = readFileSync(new URL('../public/theme-boot.js', import.meta.url), 'utf8');
    expect(boot).toContain(`'${THEME_KEY}'`);
  });
});
