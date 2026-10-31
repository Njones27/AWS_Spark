import { ApiError, apiFetch, type ApiInit } from './client';

/** The server keeps codes up to 16 KB. Bigger designs keep using the long link, which needs no server. */
export const MAX_SHARE_CODE = 16_000;

type Options = Pick<ApiInit, 'fetch'>;

/** Saves a share code and returns the short id for a `#/s/<id>` link. */
export async function createShare(code: string, opts: Options = {}): Promise<string> {
  if (code.length > MAX_SHARE_CODE) throw new ApiError(413, 'payload_too_large');
  const res = await apiFetch<{ id?: unknown }>('/shares', { ...opts, method: 'POST', body: { code }, token: null });
  if (typeof res?.id !== 'string' || !res.id) throw new ApiError(200, 'unavailable');
  return res.id;
}

/** Looks up the share code behind a short link. */
export async function getShare(id: string, opts: Options = {}): Promise<string> {
  const res = await apiFetch<{ code?: unknown }>(`/shares/${encodeURIComponent(id)}`, { ...opts, token: null });
  if (typeof res?.code !== 'string') throw new ApiError(200, 'unavailable');
  return res.code;
}
