import { describe, expect, it } from 'vitest';
import { decodeDesign } from '../../src/engine/share';
import { MESSAGES } from '../src/lib/http';
import { keys, MemoryStore } from '../src/lib/store';
import { shareIdFor } from '../src/lib/codes';
import { designCode, NOW, setup } from './helpers';

describe('shares', () => {
  it('keeps a design behind a short id and gives the same code back', async () => {
    const ctx = setup();
    const code = designCode();
    const created = await ctx.call('POST', '/api/shares', { body: { code } });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{10}$/) });

    const id = created.body.id as string;
    const got = await ctx.call('GET', `/api/shares/${id}`, { pathParameters: { id } });
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ id, code });
    expect(decodeDesign(got.body.code as string)?.plan?.title).toBe('Bakery website');

    expect(ctx.store.items.get(keys.share(id).pk)).toEqual({
      pk: `SHARE#${id}`,
      sk: 'META',
      code,
      createdAt: NOW.toISOString(),
      ttl: Math.floor(NOW.getTime() / 1000) + 2 * 365 * 24 * 60 * 60,
    });
  });

  it('reads the id from the path when API Gateway sends no path parameters', async () => {
    const ctx = setup();
    const { id } = (await ctx.call('POST', '/api/shares', { body: { code: designCode() } })).body as { id: string };
    expect((await ctx.call('GET', `/api/shares/${id}`)).status).toBe(200);
  });

  it('gives the same design the same id again, and stores nothing new', async () => {
    const ctx = setup();
    const code = designCode();
    const first = await ctx.call('POST', '/api/shares', { body: { code } });
    expect(first.body).toEqual({ id: shareIdFor(code) });
    const stored = structuredClone(ctx.store.items.get(keys.share(shareIdFor(code)).pk));

    ctx.clock.now = new Date(NOW.getTime() + 86_400_000);
    const again = await ctx.call('POST', '/api/shares', { body: { code } });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(ctx.store.items.size).toBe(1);
    expect(ctx.store.items.get(keys.share(shareIdFor(code)).pk)).toEqual(stored);
  });

  it('gives a different design a different id', async () => {
    const { call } = setup();
    const a = await call('POST', '/api/shares', { body: { code: designCode('Bakery website') } });
    const b = await call('POST', '/api/shares', { body: { code: designCode('Library website') } });
    expect(a.body.id).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(b.body.id).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('moves to the next id when its id already holds a different design', async () => {
    const store = new MemoryStore();
    const code = designCode();
    const other = { ...keys.share(shareIdFor(code)), code: designCode('Someone else'), createdAt: 'earlier', ttl: 1 };
    store.items.set(other.pk, other);
    const { call } = setup({ store });
    const res = await call('POST', '/api/shares', { body: { code } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: shareIdFor(code, 1) });
    expect(store.items.get(other.pk)).toEqual(other);
  });

  it.each([
    ['plain text', 'hello'],
    ['base64 of something else', Buffer.from(JSON.stringify({ v: 2, n: [], e: [] })).toString('base64url')],
    ['a design with no known pieces', Buffer.from(JSON.stringify({ v: 1, n: [['dragon', 0, 0]], e: [] })).toString('base64url')],
    ['characters outside base64url', `${designCode()}==`],
    ['an empty code', ''],
  ])('answers 400 for %s', async (_, code) => {
    const { call } = setup();
    const res = await call('POST', '/api/shares', { body: { code } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badDesign });
  });

  it.each([
    ['an extra field', { code: designCode(), author: 'Sam' }],
    ['a code that is not a string', { code: 42 }],
    ['no code', {}],
  ])('answers 400 for %s', async (_, body) => {
    const { call } = setup();
    const res = await call('POST', '/api/shares', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badRequest });
  });

  it('answers 413 for a code over 16 KB', async () => {
    const { call } = setup();
    const code = designCode('x'.repeat(13_000));
    expect(code.length).toBeGreaterThan(16 * 1024);
    const res = await call('POST', '/api/shares', { body: { code } });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large', message: MESSAGES.designTooLarge });
  });

  it.each([['AbCdEfGh12'], ['short'], ['has-a-dash'], ['AbCdEfGh123']])('answers 404 for unknown id %s', async (id) => {
    const { call } = setup();
    const res = await call('GET', `/api/shares/${id}`, { pathParameters: { id } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: MESSAGES.shareNotFound });
  });
});
