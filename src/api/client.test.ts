import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, useApp } from '../store';
import { ApiError, apiFetch } from './client';
import { createShare, getShare, MAX_SHARE_CODE } from './shares';

type Seen = { url: string; method: string; headers: Headers; body: unknown };

/** A fetch that answers every call with one canned reply, and remembers what it was asked. */
function answer(status: number, body?: unknown, raw?: string) {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push({
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(raw ?? (body === undefined ? '' : JSON.stringify(body)), { status });
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected the call to fail');
};

describe('api client', () => {
  it('sends JSON to /api with the saved token', async () => {
    useApp.setState({ profile: { ...EMPTY_PROFILE, profileId: 'p', token: 'saved-token' } });
    const api = answer(200, { ok: true });
    await expect(apiFetch('/profiles/me', { method: 'PUT', body: { state: 1 }, fetch: api.fetch })).resolves.toEqual({ ok: true });
    const [call] = api.seen;
    expect(call.url).toBe('/api/profiles/me');
    expect(call.method).toBe('PUT');
    expect(call.body).toEqual({ state: 1 });
    expect(call.headers.get('authorization')).toBe('Bearer saved-token');
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('accept')).toBe('application/json');
  });

  it('sends no token when asked not to, or when there is none', async () => {
    const api = answer(200, {});
    await apiFetch('/health', { fetch: api.fetch, token: null });
    useApp.setState({ profile: EMPTY_PROFILE });
    await apiFetch('/health', { fetch: api.fetch });
    expect(api.seen.map((c) => c.headers.get('authorization'))).toEqual([null, null]);
  });

  it('turns a Spark error body into its code', async () => {
    const e = await failure(apiFetch('/profiles/recover', { fetch: answer(404, { error: 'not_found', message: 'No key' }).fetch }));
    expect(e).toMatchObject({ status: 404, code: 'not_found', message: 'No key', offline: false });
    const bad = await failure(apiFetch('/profiles/me', { fetch: answer(401, { error: 'unauthorized', message: '' }).fetch }));
    expect(bad).toMatchObject({ status: 401, code: 'unauthorized', offline: false });
  });

  it('treats no network, throttling, server errors, and non-Spark answers as offline for now', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof globalThis.fetch;
    expect(await failure(apiFetch('/x', { fetch: down }))).toMatchObject({ status: 0, code: 'offline', offline: true });
    expect(await failure(apiFetch('/x', { fetch: answer(429, { message: 'Too Many Requests' }).fetch }))).toMatchObject({
      status: 429,
      code: 'throttled',
      offline: true,
    });
    expect(await failure(apiFetch('/x', { fetch: answer(500, { error: 'internal', message: '' }).fetch }))).toMatchObject({
      code: 'internal',
      offline: true,
    });
    // A static host with no API answers with a page, not JSON.
    expect(await failure(apiFetch('/x', { fetch: answer(404, undefined, '<html></html>').fetch }))).toMatchObject({
      status: 404,
      code: 'unavailable',
      offline: true,
    });
    expect(await failure(apiFetch('/x', { fetch: answer(200, undefined, '<html></html>').fetch }))).toMatchObject({
      code: 'unavailable',
      offline: true,
    });
  });

  it('gives up after the timeout', async () => {
    const hang = ((_: RequestInfo | URL, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof globalThis.fetch;
    expect(await failure(apiFetch('/x', { fetch: hang, timeoutMs: 10 }))).toMatchObject({ status: 0, code: 'timeout', offline: true });
  });
});

describe('share api', () => {
  it('posts a code and reads it back by id', async () => {
    const post = answer(201, { id: 'Ab3dE5fG7h' });
    await expect(createShare('CODE', { fetch: post.fetch })).resolves.toBe('Ab3dE5fG7h');
    expect(post.seen[0]).toMatchObject({ url: '/api/shares', method: 'POST', body: { code: 'CODE' } });
    expect(post.seen[0].headers.get('authorization')).toBeNull();

    const get = answer(200, { id: 'Ab3dE5fG7h', code: 'CODE' });
    await expect(getShare('Ab3dE5fG7h', { fetch: get.fetch })).resolves.toBe('CODE');
    expect(get.seen[0].url).toBe('/api/shares/Ab3dE5fG7h');
  });

  it('keeps the long link for a design too big to store, without asking the server', async () => {
    const api = answer(201, { id: 'x' });
    const e = await failure(createShare('A'.repeat(MAX_SHARE_CODE + 1), { fetch: api.fetch }));
    expect(e.status).toBe(413);
    expect(api.seen).toHaveLength(0);
  });

  it('reports a missing short link as not found', async () => {
    const e = await failure(getShare('nope', { fetch: answer(404, { error: 'not_found', message: '' }).fetch }));
    expect(e).toMatchObject({ code: 'not_found', offline: false });
  });
});
