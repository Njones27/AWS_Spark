import type { Band } from '../../../src/data/types';
import { decodeDesign } from '../../../src/engine/share';

/** What the server keeps for a profile (docs/aws/CONTRACT.md). `playground` is a share code from encodeDesign(). */
export interface ProgressState {
  band: Band | null;
  completed: string[];
  playground: string | null;
  unlockAll: boolean;
}

export const MAX_COMPLETED = 500;
/** Longest share code kept, for shares and the saved Playground design. Codes are ASCII: characters = bytes. */
export const MAX_CODE = 16 * 1024;
const MAX_KEY_INPUT = 64;
const LEVEL_ID = /^[a-z0-9-]{1,32}$/;
/** encodeDesign() output: base64url without padding. */
const CODE_CHARS = /^[A-Za-z0-9_-]+$/;
/** A Record, so the compiler insists every Band is listed and nothing else is. */
const BANDS: Record<Band, true> = { explorer: true, builder: true, architect: true };

export type Invalid = 'bad_request' | 'bad_design' | 'too_large';
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: Invalid };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const no = <T>(error: Invalid): Parsed<T> => ({ ok: false, error });

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Closed schema: exactly these keys, no more and no fewer. */
const hasExactly = (v: Plain, keys: readonly string[]): boolean => {
  const own = Object.keys(v);
  return own.length === keys.length && own.every((k) => keys.includes(k));
};

/** True when `code` is a design Spark can open: the right characters, small enough, and decodeDesign() accepts it. */
export function isDesignCode(code: string): boolean {
  if (code.length === 0 || code.length > MAX_CODE || !CODE_CHARS.test(code)) return false;
  try {
    return decodeDesign(code) !== null;
  } catch {
    return false;
  }
}

const isBand = (v: unknown): v is Band => typeof v === 'string' && Object.hasOwn(BANDS, v);

export function parseProgress(v: unknown): Parsed<ProgressState> {
  if (!isPlain(v) || !hasExactly(v, ['band', 'completed', 'playground', 'unlockAll'])) return no('bad_request');
  const { band, completed, playground, unlockAll } = v;
  if (band !== null && !isBand(band)) return no('bad_request');
  if (!Array.isArray(completed) || completed.length > MAX_COMPLETED) return no('bad_request');
  if (!completed.every((id) => typeof id === 'string' && LEVEL_ID.test(id))) return no('bad_request');
  if (playground !== null && (typeof playground !== 'string' || !isDesignCode(playground))) return no('bad_request');
  if (typeof unlockAll !== 'boolean') return no('bad_request');
  return ok({ band, completed: [...(completed as string[])], playground, unlockAll });
}

/** `POST /api/profiles` takes `{}`. A missing body counts as `{}`. */
export const parseCreateProfile = (body: unknown): Parsed<null> =>
  body === undefined || (isPlain(body) && hasExactly(body, [])) ? ok(null) : no('bad_request');

/** `PUT /api/profiles/me` takes `{ state }`. */
export const parsePutProfile = (body: unknown): Parsed<ProgressState> =>
  isPlain(body) && hasExactly(body, ['state']) ? parseProgress(body.state) : no('bad_request');

/** `POST /api/profiles/recover` takes `{ builderKey }`, as typed. Its format is checked after normalising. */
export function parseRecover(body: unknown): Parsed<string> {
  if (!isPlain(body) || !hasExactly(body, ['builderKey'])) return no('bad_request');
  const { builderKey } = body;
  return typeof builderKey === 'string' && builderKey.length <= MAX_KEY_INPUT ? ok(builderKey) : no('bad_request');
}

/** `POST /api/shares` takes `{ code }`. Too long is `too_large` (413); not a Spark design is `bad_design` (400). */
export function parseShare(body: unknown): Parsed<string> {
  if (!isPlain(body) || !hasExactly(body, ['code']) || typeof body.code !== 'string') return no('bad_request');
  if (body.code.length > MAX_CODE) return no('too_large');
  return isDesignCode(body.code) ? ok(body.code) : no('bad_design');
}
