import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/handler';
import { MESSAGES } from '../src/lib/http';
import { MemoryStore } from '../src/lib/store';
import { event, NOW, setup } from './helpers';

describe('GET /api/health', () => {
  it('reports stage, version and time as JSON', async () => {
    const { call } = setup();
    const res = await call('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toEqual({ ok: true, stage: 'test', version: 'abc123', time: NOW.toISOString() });
  });

  it('works without a table, and falls back to "local"', async () => {
    const handler = createHandler({ env: {}, logError: () => {} });
    const res = await handler(event('GET', '/api/health'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, stage: 'local', version: 'local' });
  });
});

describe('origin check', () => {
  const env = { STAGE: 'test', ORIGIN_VERIFY_SECRET: 'cloudfront-secret' };

  it.each([
    ['missing', {}],
    ['wrong', { 'x-origin-verify': 'guess' }],
    ['a prefix of the secret', { 'x-origin-verify': 'cloudfront' }],
  ])('answers 403 when the header is %s', async (_, headers) => {
    const { call } = setup({ env });
    const res = await call('GET', '/api/health', { headers });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: MESSAGES.forbidden });
  });

  it('checks before anything else, even unknown routes', async () => {
    const { call } = setup({ env });
    expect((await call('GET', '/api/nope')).status).toBe(403);
    expect((await call('POST', '/api/shares', { rawBody: '{not json' })).status).toBe(403);
  });

  it('lets the request through with the right header, in any letter case', async () => {
    const { call } = setup({ env });
    expect((await call('GET', '/api/health', { headers: { 'X-Origin-Verify': 'cloudfront-secret' } })).status).toBe(200);
  });

  it('is off when the secret is not set', async () => {
    const { call } = setup({ env: { STAGE: 'test', ORIGIN_VERIFY_SECRET: '' } });
    expect((await call('GET', '/api/health')).status).toBe(200);
  });
});

describe('routing and bodies', () => {
  it.each([
    ['GET', '/api/nope'],
    ['GET', '/'],
    ['DELETE', '/api/profiles/me'],
    ['GET', '/api/profiles'],
    ['PUT', '/api/shares'],
    ['GET', '/api/health/extra'],
    ['GET', '/api/shares/abc/def'],
  ])('answers 404 for %s %s', async (method, path) => {
    const { call } = setup();
    const res = await call(method, path);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: MESSAGES.notFound });
  });

  it('answers 413 for a body over 64 KB', async () => {
    const { call } = setup();
    const res = await call('POST', '/api/shares', { body: { code: 'x'.repeat(70_000) } });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large', message: MESSAGES.tooLarge });
  });

  it('measures the decoded size of a base64 body', async () => {
    const { call } = setup();
    const big = Buffer.from(JSON.stringify({ code: 'x'.repeat(66_000) })).toString('base64');
    expect((await call('POST', '/api/shares', { rawBody: big, isBase64Encoded: true })).status).toBe(413);
    const small = Buffer.from('{}').toString('base64');
    expect((await call('POST', '/api/profiles', { rawBody: small, isBase64Encoded: true })).status).toBe(201);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const { call } = setup();
    const res = await call('POST', '/api/profiles', { rawBody: '{"oops":' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badRequest });
  });

  it('answers 500 with a friendly message and logs the details when something breaks', async () => {
    const store = new MemoryStore();
    store.getShare = async () => {
      throw new Error('ProvisionedThroughputExceeded: table on fire');
    };
    const { call, errors } = setup({ store });
    const res = await call('GET', '/api/shares/AbCdEfGh12');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal', message: MESSAGES.internal });
    expect(JSON.stringify(res.body)).not.toContain('fire');
    expect(errors).toHaveLength(1);
    expect(errors[0].detail).toMatchObject({ route: 'GET /api/shares/AbCdEfGh12', requestId: 'req-1' });
    expect(String(errors[0].detail.error)).toContain('table on fire');
  });

  it('answers 500 for data routes when TABLE_NAME is missing', async () => {
    const logged: string[] = [];
    const handler = createHandler({ env: {}, logError: (m) => logged.push(m) });
    const res = await handler(event('POST', '/api/profiles', { body: {} }));
    expect(res.statusCode).toBe(500);
    expect(logged).toEqual(['Unhandled error']);
  });

  it('sends JSON and no-store on every response', async () => {
    const { call } = setup();
    for (const res of [await call('GET', '/api/health'), await call('GET', '/nope'), await call('GET', '/api/profiles/me')]) {
      expect(res.headers).toEqual({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    }
  });
});
