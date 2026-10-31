import { describe, expect, it } from 'vitest';
import { hashesEqual, newToken, parseBearer, secretsEqual, sha256Hex } from '../src/lib/auth';
import { BUILDER_KEY, isBuilderKey, newBuilderKey, normalizeBuilderKey, SHARE_ID, shareIdFor } from '../src/lib/codes';
import { mergeState } from '../src/lib/merge';
import { WORDS } from '../src/lib/words';

describe('Builder Keys', () => {
  it('are two different listed words and four digits, never with a snicker-worthy number', () => {
    for (let i = 0; i < 2000; i++) {
      const key = newBuilderKey();
      expect(key).toMatch(BUILDER_KEY);
      const [a, b, digits] = key.split('-');
      expect(WORDS).toContain(a);
      expect(WORDS).toContain(b);
      expect(a).not.toBe(b);
      expect(digits).not.toMatch(/69|420|666|911|1312|1488|8008/);
    }
  });

  it.each([
    ['MAPLE-OTTER-4821', 'MAPLE-OTTER-4821'],
    ['maple-otter-4821', 'MAPLE-OTTER-4821'],
    ['  Maple Otter 4821  ', 'MAPLE-OTTER-4821'],
    ['maple_otter_4821', 'MAPLE-OTTER-4821'],
    ['maple--otter---4821', 'MAPLE-OTTER-4821'],
    ['maple - otter _ 4821', 'MAPLE-OTTER-4821'],
    ['maple\totter\n4821', 'MAPLE-OTTER-4821'],
  ])('normalises %j to %s', (input, expected) => {
    expect(normalizeBuilderKey(input)).toBe(expected);
    expect(isBuilderKey(normalizeBuilderKey(input))).toBe(true);
  });

  it.each([['MAPLE-OTTER'], ['MAPLE-OTTER-482'], ['MAPLE-OTTER-48210'], ['MA-OTTER-4821'], ['MAPLE-OTTER-48A1'], ['maple-otter-4821'], ['-MAPLE-OTTER-4821']])(
    'does not take %j as a key',
    (s) => {
      expect(isBuilderKey(s)).toBe(false);
    },
  );
});

describe('share ids', () => {
  it('match the documented derivation: base62 of sha256(code) mod 62^10', () => {
    // Worked out separately (Python) from the rule in docs/aws/CONTRACT.md.
    expect(shareIdFor('hello')).toBe('IbYLeK5ySK');
    expect(shareIdFor('hello', 1)).toBe('xa3mgaG2Dg');
    expect(shareIdFor('hello', 1)).toBe(shareIdFor('hello#1'));
    expect(shareIdFor('')).toBe('jWEepHLxI5');
  });

  it('are 10 letters and digits, the same for the same code and different for different codes', () => {
    const codes = Array.from({ length: 500 }, (_, i) => `code-${i}`);
    const ids = codes.map((code) => shareIdFor(code));
    expect(new Set(ids).size).toBe(500);
    for (const id of ids) expect(id).toMatch(SHARE_ID);
    expect(codes.map((code) => shareIdFor(code))).toEqual(ids);
  });
});

describe('tokens', () => {
  it('are 43 base64url characters and different every time', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it('are read from a Bearer header only when well formed', () => {
    const token = newToken();
    expect(parseBearer({ authorization: `Bearer ${token}` })).toBe(token);
    expect(parseBearer({ authorization: `bearer ${token}` })).toBe(token);
    expect(parseBearer({ authorization: `Bearer ${token}x` })).toBeNull();
    expect(parseBearer({ authorization: `Bearer  ${token}` })).toBeNull();
    expect(parseBearer({ authorization: token })).toBeNull();
    expect(parseBearer({})).toBeNull();
  });

  it('hash to 64 hex characters, compared in constant time', () => {
    const h = sha256Hex('MAPLE-OTTER-4821');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashesEqual(h, sha256Hex('MAPLE-OTTER-4821'))).toBe(true);
    expect(hashesEqual(h, sha256Hex('MAPLE-OTTER-4822'))).toBe(false);
    expect(hashesEqual(h, h.slice(0, 62))).toBe(false);
    expect(hashesEqual(h, `${h.slice(0, 63)}z`)).toBe(false);
    expect(hashesEqual('', '')).toBe(false);
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
  });
});

describe('mergeState', () => {
  const base = { band: null, completed: [], playground: null, unlockAll: false } as const;

  it('keeps every finished level, stored ones first, with no repeats', () => {
    const merged = mergeState(
      { ...base, completed: ['b', 'a'], band: 'explorer' },
      { band: 'architect', completed: ['c', 'a', 'c'], playground: 'code', unlockAll: true },
    );
    expect(merged).toEqual({ band: 'architect', completed: ['b', 'a', 'c'], playground: 'code', unlockAll: true });
  });

  it('takes band, design and unlockAll from the request even when they are empty', () => {
    const merged = mergeState({ band: 'builder', completed: ['a'], playground: 'code', unlockAll: true }, { ...base, completed: [] });
    expect(merged).toEqual({ band: null, completed: ['a'], playground: null, unlockAll: false });
  });

  it('caps the union at 500, keeping stored levels', () => {
    const stored = Array.from({ length: 400 }, (_, i) => `s${i}`);
    const incoming = Array.from({ length: 400 }, (_, i) => `n${i}`);
    const merged = mergeState({ ...base, completed: stored }, { ...base, completed: incoming });
    expect(merged.completed).toHaveLength(500);
    expect(merged.completed.slice(0, 400)).toEqual(stored);
  });
});
