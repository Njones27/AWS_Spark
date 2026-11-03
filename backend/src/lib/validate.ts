import type { Band } from '../../../src/data/types';
import { decodeDesign, encodeDesign } from '../../../src/engine/share';

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

/**
 * The design in `code` as Spark keeps it: decoded, then encoded again. Decoding keeps only what Spark understands
 * (known services, allowed arrows, capped text), so re-encoding drops anything else a hand-edited code carried, and
 * the server never stores or hands back data that isn't part of a design. `bad_design`: not a design Spark can open.
 * `too_large`: over MAX_CODE, before or after cleaning.
 */
export function cleanDesign(code: string): Parsed<string> {
  if (code.length > MAX_CODE) return no('too_large');
  if (code.length === 0 || !CODE_CHARS.test(code)) return no('bad_design');
  let clean: string;
  try {
    const design = decodeDesign(code);
    if (!design) return no('bad_design');
    clean = encodeDesign(design);
  } catch {
    return no('bad_design');
  }
  return clean.length > MAX_CODE ? no('too_large') : ok(clean);
}

/** True when `code` is a design Spark can open: the right characters, small enough, and decodeDesign() accepts it. */
export const isDesignCode = (code: string): boolean => cleanDesign(code).ok;

const isBand = (v: unknown): v is Band => typeof v === 'string' && Object.hasOwn(BANDS, v);

export function parseProgress(v: unknown): Parsed<ProgressState> {
  if (!isPlain(v) || !hasExactly(v, ['band', 'completed', 'playground', 'unlockAll'])) return no('bad_request');
  const { band, completed, playground, unlockAll } = v;
  if (band !== null && !isBand(band)) return no('bad_request');
  if (!Array.isArray(completed) || completed.length > MAX_COMPLETED) return no('bad_request');
  if (!completed.every((id) => typeof id === 'string' && LEVEL_ID.test(id))) return no('bad_request');
  let design: string | null = null;
  if (playground !== null) {
    const cleaned = typeof playground === 'string' ? cleanDesign(playground) : no<string>('bad_request');
    if (!cleaned.ok) return no('bad_request');
    design = cleaned.value;
  }
  if (typeof unlockAll !== 'boolean') return no('bad_request');
  return ok({ band, completed: [...(completed as string[])], playground: design, unlockAll });
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

/**
 * `POST /api/shares` takes `{ code }` and gives back the cleaned code to store. Too long is `too_large` (413); not a
 * Spark design is `bad_design` (400).
 */
export function parseShare(body: unknown): Parsed<string> {
  if (!isPlain(body) || !hasExactly(body, ['code']) || typeof body.code !== 'string') return no('bad_request');
  return cleanDesign(body.code);
}
