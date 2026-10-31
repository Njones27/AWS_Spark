import { describe, expect, it } from 'vitest';
import { parseChoice, resolveDevice } from './device';

describe('device', () => {
  it('follows the screen on auto', () => {
    expect(resolveDevice('auto', true)).toBe('phone');
    expect(resolveDevice('auto', false)).toBe('laptop');
  });

  it('lets the student override the screen either way', () => {
    expect(resolveDevice('laptop', true)).toBe('laptop');
    expect(resolveDevice('phone', false)).toBe('phone');
  });

  it('treats a missing or unknown saved choice as auto', () => {
    expect(parseChoice(null)).toBe('auto');
    expect(parseChoice('tablet')).toBe('auto');
    expect(parseChoice('laptop')).toBe('laptop');
  });
});
