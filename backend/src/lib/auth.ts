import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A bearer token: 32 random bytes as base64url, always 43 characters. Only its SHA-256 is ever stored. */
export const newToken = (): string => randomBytes(32).toString('base64url');

export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/i;

/** The token from `Authorization: Bearer <token>`, or null when there is none or it isn't shaped like Spark's. */
export function parseBearer(headers: Readonly<Record<string, string | undefined>>): string | null {
  const match = BEARER.exec(headers.authorization?.trim() ?? '');
  return match ? match[1] : null;
}

/** Compares two hex digests in constant time. Different lengths, or anything that isn't hex, never match. */
export function hashesEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b) || a.length !== b.length || a.length % 2) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Compares two secrets without leaking how much of them matched, whatever their lengths. */
export const secretsEqual = (a: string, b: string): boolean => hashesEqual(sha256Hex(a), sha256Hex(b));
