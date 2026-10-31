import { randomInt } from 'node:crypto';
import { sha256Hex } from './auth';
import { WORDS } from './words';

export const BUILDER_KEY = /^[A-Z]{3,7}-[A-Z]{3,7}-[0-9]{4}$/;

/**
 * Number groups a middle schooler would snicker at, or that are hate symbols. Keys with them are never issued.
 * Any four digits are still accepted when a key is typed in, so this only shapes new keys.
 */
const UNLUCKY_NUMBERS = ['69', '420', '666', '911', '1312', '1488', '8008'];

/** A new Builder Key like `MAPLE-OTTER-4821`: two different words from the list, then four digits. */
export function newBuilderKey(): string {
  const first = randomInt(WORDS.length);
  let second = randomInt(WORDS.length - 1);
  if (second >= first) second += 1;
  let digits: string;
  do digits = String(randomInt(10_000)).padStart(4, '0');
  while (UNLUCKY_NUMBERS.some((n) => digits.includes(n)));
  return `${WORDS[first]}-${WORDS[second]}-${digits}`;
}

/** A typed Builder Key in its stored form: trimmed, uppercase, spaces and underscores as `-`, no repeated `-`. */
export function normalizeBuilderKey(input: string): string {
  return input.trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-{2,}/g, '-');
}

export const isBuilderKey = (s: string): boolean => BUILDER_KEY.test(s);

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHARE_ID = /^[A-Za-z0-9]{10}$/;

/**
 * The short id for a share code. It comes from the code itself, so the same design always gets the same link and
 * sending it again stores nothing new: SHA-256 of the code's UTF-8 bytes, read as a big-endian number, mod 62^10,
 * written as 10 base62 digits (0-9, A-Z, a-z), most significant first, padded with leading `0`s.
 * Attempt n > 0 hashes `<code>#<n>` instead, for the vanishingly rare id that already holds a different code
 * (`#` never appears in a code).
 */
export function shareIdFor(code: string, attempt = 0): string {
  let n = BigInt(`0x${sha256Hex(attempt ? `${code}#${attempt}` : code)}`);
  let id = '';
  for (let i = 0; i < 10; i++) {
    id = BASE62[Number(n % 62n)] + id;
    n /= 62n;
  }
  return id;
}
