import { describe, expect, it } from 'vitest';
import { decodeDesign } from '../../src/engine/share';
import { sha256Hex } from '../src/lib/auth';
import { BUILDER_KEY } from '../src/lib/codes';
import { MESSAGES } from '../src/lib/http';
import { keys, MemoryStore } from '../src/lib/store';
import type { ProgressState } from '../src/lib/validate';
import { designCode, NOW, setup } from './helpers';

const TWO_YEARS_S = 2 * 365 * 24 * 60 * 60;
const ttlAt = (d: Date) => Math.floor(d.getTime() / 1000) + TWO_YEARS_S;

const state = (s: Partial<ProgressState> = {}): ProgressState => ({
  band: null,
  completed: [],
  playground: null,
  unlockAll: false,
  ...s,
});

async function newProfile(ctx: ReturnType<typeof setup>) {
  const res = await ctx.call('POST', '/api/profiles', { body: {} });
  expect(res.status).toBe(201);
  return res.body as { profileId: string; token: string; builderKey: string; state: ProgressState; updatedAt: string };
}

describe('POST /api/profiles', () => {
  it('creates an empty profile and returns its token and Builder Key once', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    expect(p.profileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.builderKey).toMatch(BUILDER_KEY);
    expect(p.state).toEqual(state());
    expect(p.updatedAt).toBe(NOW.toISOString());
  });

  it('stores only hashes, with the TTL two years out', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const everything = JSON.stringify([...ctx.store.items.values()]);
    expect(everything).not.toContain(p.token);
    expect(everything).not.toContain(p.builderKey);
    expect(ctx.store.items.get(keys.profile(p.profileId).pk)).toEqual({
      pk: `PROFILE#${p.profileId}`,
      sk: 'META',
      tokens: [sha256Hex(p.token)],
      keyHash: sha256Hex(p.builderKey),
      state: JSON.stringify(state()),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      ttl: ttlAt(NOW),
    });
    expect(ctx.store.items.get(`KEY#${sha256Hex(p.builderKey)}`)).toEqual({
      pk: `KEY#${sha256Hex(p.builderKey)}`,
      sk: 'META',
      profileId: p.profileId,
      createdAt: NOW.toISOString(),
    });
    expect(ctx.store.items.get(`TOKEN#${sha256Hex(p.token)}`)).toEqual({
      pk: `TOKEN#${sha256Hex(p.token)}`,
      sk: 'META',
      profileId: p.profileId,
      createdAt: NOW.toISOString(),
      ttl: ttlAt(NOW),
    });
  });

  it('accepts no body at all', async () => {
    const { call } = setup();
    expect((await call('POST', '/api/profiles')).status).toBe(201);
  });

  it('tries another Builder Key when one is taken', async () => {
    const store = new MemoryStore();
    const real = store.createProfile.bind(store);
    let calls = 0;
    store.createProfile = async (profile, ttl) => (++calls === 1 ? 'key_taken' : real(profile, ttl));
    const { call } = setup({ store });
    expect((await call('POST', '/api/profiles', { body: {} })).status).toBe(201);
    expect(calls).toBe(2);
  });

  it('rejects any field', async () => {
    const { call } = setup();
    const res = await call('POST', '/api/profiles', { body: { name: 'Sam' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badRequest });
  });
});

describe('GET /api/profiles/me', () => {
  it('returns the profile for its token', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const res = await ctx.call('GET', '/api/profiles/me', { token: p.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profileId: p.profileId, state: state(), updatedAt: NOW.toISOString() });
  });

  it.each([
    ['no header', {}],
    ['an unknown token', { authorization: `Bearer ${'A'.repeat(43)}` }],
    ['a token of the wrong shape', { authorization: 'Bearer short' }],
    ['another scheme', { authorization: `Basic ${'A'.repeat(43)}` }],
  ])('answers 401 for %s', async (_, headers) => {
    const ctx = setup();
    await newProfile(ctx);
    const res = await ctx.call('GET', '/api/profiles/me', { headers });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized', message: MESSAGES.unauthorized });
  });
});

describe('PUT /api/profiles/me', () => {
  it('merges finished levels as a union and takes the rest from the request', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const code = designCode();

    const first = await ctx.call('PUT', '/api/profiles/me', {
      token: p.token,
      body: { state: state({ band: 'builder', completed: ['ch1-l1', 'ch1-l2'], playground: code, unlockAll: true }) },
    });
    expect(first.status).toBe(200);
    expect(first.body.state).toEqual({ band: 'builder', completed: ['ch1-l1', 'ch1-l2'], playground: code, unlockAll: true });

    // Another computer that never saw ch1-l2: it is kept, and its own band, design and switch win.
    ctx.clock.now = new Date(NOW.getTime() + 60_000);
    const second = await ctx.call('PUT', '/api/profiles/me', {
      token: p.token,
      body: { state: state({ band: 'architect', completed: ['ch2-l1', 'ch1-l1', 'ch2-l1'] }) },
    });
    expect(second.status).toBe(200);
    const merged = { band: 'architect', completed: ['ch1-l1', 'ch1-l2', 'ch2-l1'], playground: null, unlockAll: false };
    expect(second.body).toEqual({ profileId: p.profileId, state: merged, updatedAt: ctx.clock.now.toISOString() });

    const got = await ctx.call('GET', '/api/profiles/me', { token: p.token });
    expect(got.body.state).toEqual(merged);
    expect(ctx.store.items.get(keys.profile(p.profileId).pk)?.ttl).toBe(ttlAt(ctx.clock.now));
  });

  it('merges again when another computer saves at the same moment', async () => {
    const store = new MemoryStore();
    const ctx = setup({ store });
    const p = await newProfile(ctx);
    // Just before this save lands, another computer finishes ch3-l1.
    const real = store.putProfile.bind(store);
    let raced = false;
    store.putProfile = async (id, change) => {
      if (!raced) {
        raced = true;
        const { expected } = change;
        await real(id, { ...change, next: { ...expected, completed: [...expected.completed, 'ch3-l1'] } });
      }
      return real(id, change);
    };
    const res = await ctx.call('PUT', '/api/profiles/me', { token: p.token, body: { state: state({ completed: ['ch1-l1'] }) } });
    expect(res.status).toBe(200);
    expect((res.body.state as ProgressState).completed).toEqual(['ch3-l1', 'ch1-l1']);
  });

  it('needs a valid token', async () => {
    const ctx = setup();
    await newProfile(ctx);
    const res = await ctx.call('PUT', '/api/profiles/me', { token: 'B'.repeat(43), body: { state: state() } });
    expect(res.status).toBe(401);
  });

  const tooManyLevels = Array.from({ length: 501 }, (_, i) => `level-${i}`);
  // A real design, just too big: a 13,000-letter title makes a code over 16 KB.
  const bigDesign = designCode('x'.repeat(13_000));
  it('builds an oversized design that would otherwise open', () => {
    expect(bigDesign.length).toBeGreaterThan(16 * 1024);
    expect(decodeDesign(bigDesign)).not.toBeNull();
  });
  it.each([
    ['an unknown top-level field', { state: state(), name: 'Sam' }],
    ['no state', {}],
    ['a state that is not an object', { state: 'all done' }],
    ['an array body', [state()]],
    ['an unknown field inside state', { state: { ...state(), nickname: 'Sam' } }],
    ['a missing field inside state', { state: { band: null, completed: [], playground: null } }],
    ['an unknown band', { state: state({ band: 'wizard' as ProgressState['band'] }) }],
    ['completed that is not a list', { state: { ...state(), completed: 'ch1-l1' } }],
    ['a level id with capitals', { state: state({ completed: ['Ch1-L1'] }) }],
    ['a level id with spaces', { state: state({ completed: ['ch1 l1'] }) }],
    ['a level id over 32 characters', { state: state({ completed: ['a'.repeat(33)] }) }],
    ['an empty level id', { state: state({ completed: [''] }) }],
    ['a level id that is a number', { state: { ...state(), completed: [7] } }],
    ['more than 500 levels', { state: state({ completed: tooManyLevels }) }],
    ['a playground that is not a design', { state: state({ playground: 'bm90IGEgZGVzaWdu' }) }],
    ['a playground over 16 KB', { state: state({ playground: bigDesign }) }],
    ['a playground that is not a string', { state: { ...state(), playground: { nodes: [] } } }],
    ['unlockAll that is not a boolean', { state: { ...state(), unlockAll: 'yes' } }],
  ])('rejects %s with 400', async (_, body) => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const res = await ctx.call('PUT', '/api/profiles/me', { token: p.token, body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badRequest });
    // Nothing was saved.
    expect((await ctx.call('GET', '/api/profiles/me', { token: p.token })).body.state).toEqual(state());
  });

  it('accepts 500 levels exactly', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const completed = Array.from({ length: 500 }, (_, i) => `level-${i}`);
    const res = await ctx.call('PUT', '/api/profiles/me', { token: p.token, body: { state: state({ completed }) } });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/profiles/recover', () => {
  const recoverWith = async (ctx: ReturnType<typeof setup>, builderKey: string) => {
    const res = await ctx.call('POST', '/api/profiles/recover', { body: { builderKey } });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };

  it('returns the progress with a new token, and the first computer stays signed in', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const progress = state({ band: 'explorer', completed: ['ch1-l1'] });
    await ctx.call('PUT', '/api/profiles/me', { token: p.token, body: { state: progress } });

    ctx.clock.now = new Date(NOW.getTime() + 86_400_000);
    // Typed on another computer: lower case, spaces, an underscore and a doubled dash.
    const typed = `  ${p.builderKey.toLowerCase().replace('-', ' ').replace('-', '_-')}  `;
    const res = await ctx.call('POST', '/api/profiles/recover', { body: { builderKey: typed } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ profileId: p.profileId, builderKey: p.builderKey, state: progress, updatedAt: NOW.toISOString() });
    const token = res.body.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toBe(p.token);

    // Both computers keep saving, and neither loses the other's levels.
    const fromOld = await ctx.call('PUT', '/api/profiles/me', { token: p.token, body: { state: state({ completed: ['ch1-l2'] }) } });
    expect(fromOld.status).toBe(200);
    const fromNew = await ctx.call('PUT', '/api/profiles/me', { token, body: { state: state({ completed: ['ch2-l1'] }) } });
    expect((fromNew.body.state as ProgressState).completed).toEqual(['ch1-l1', 'ch1-l2', 'ch2-l1']);

    // Both hashes are listed, newest last, the new lookup keeps its own TTL, and the profile's TTL moved.
    expect(ctx.store.items.get(keys.profile(p.profileId).pk)).toMatchObject({
      tokens: [sha256Hex(p.token), sha256Hex(token)],
      ttl: ttlAt(ctx.clock.now),
    });
    expect(ctx.store.items.get(keys.token(sha256Hex(token)).pk)).toMatchObject({ ttl: ttlAt(ctx.clock.now) });
    expect(ctx.store.items.get(keys.token(sha256Hex(p.token)).pk)).toMatchObject({ ttl: ttlAt(NOW) });
  });

  it('signs out the oldest computer at the ninth token', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    const tokens = [p.token];
    for (let i = 0; i < 8; i++) tokens.push(await recoverWith(ctx, p.builderKey));
    expect(tokens).toHaveLength(9);

    const res = await ctx.call('GET', '/api/profiles/me', { token: tokens[0] });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized', message: MESSAGES.unauthorized });
    expect(ctx.store.items.has(keys.token(sha256Hex(tokens[0])).pk)).toBe(false);
    for (const token of tokens.slice(1)) {
      expect((await ctx.call('GET', '/api/profiles/me', { token })).status).toBe(200);
    }
    expect(ctx.store.items.get(keys.profile(p.profileId).pk)?.tokens).toEqual(tokens.slice(1).map(sha256Hex));
  });

  it('refuses an evicted token even if its lookup item were still there', async () => {
    const ctx = setup();
    const p = await newProfile(ctx);
    for (let i = 0; i < 8; i++) await recoverWith(ctx, p.builderKey);
    const stale = keys.token(sha256Hex(p.token));
    ctx.store.items.set(stale.pk, { ...stale, profileId: p.profileId, createdAt: NOW.toISOString(), ttl: ttlAt(NOW) });
    expect((await ctx.call('GET', '/api/profiles/me', { token: p.token })).status).toBe(401);
    expect((await ctx.call('PUT', '/api/profiles/me', { token: p.token, body: { state: state() } })).status).toBe(401);
  });

  it('adds again when another computer signs in at the same moment', async () => {
    const store = new MemoryStore();
    const ctx = setup({ store });
    const p = await newProfile(ctx);
    const real = store.addToken.bind(store);
    let raced = false;
    store.addToken = async (id, change) => {
      if (!raced) {
        raced = true;
        await real(id, { ...change, tokenHash: sha256Hex('another computer') });
      }
      return real(id, change);
    };
    const token = await recoverWith(ctx, p.builderKey);
    expect(ctx.store.items.get(keys.profile(p.profileId).pk)?.tokens).toEqual([
      sha256Hex(p.token),
      sha256Hex('another computer'),
      sha256Hex(token),
    ]);
  });

  it('answers 404 with a kind message for a key nobody has', async () => {
    const { call } = setup();
    const res = await call('POST', '/api/profiles/recover', { body: { builderKey: 'MAPLE-OTTER-4821' } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: MESSAGES.keyNotFound });
    expect(MESSAGES.keyNotFound).toBe("That Builder Key didn't match. Check the letters and numbers and try again.");
  });

  it.each([['MAPLE-OTTER'], ['MAPLE-OTTER-48211'], ['MAPLE-4821'], ['MAPLE1-OTTER-4821'], ['']])(
    'answers 400 for %j, which is not shaped like a key',
    async (builderKey) => {
      const { call } = setup();
      const res = await call('POST', '/api/profiles/recover', { body: { builderKey } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'bad_request', message: MESSAGES.badKey });
    },
  );

  it.each([
    ['an extra field', { builderKey: 'MAPLE-OTTER-4821', profileId: 'x' }],
    ['a key that is not a string', { builderKey: 4821 }],
    ['no key', {}],
    ['a very long key', { builderKey: 'A'.repeat(65) }],
  ])('answers 400 for %s', async (_, body) => {
    const { call } = setup();
    const res = await call('POST', '/api/profiles/recover', { body });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });
});
