import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyNoticeDue } from './components/BuilderKey';
import { EMPTY_PLAYGROUND } from './components/canvas/saved';
import { decodeDesign, encodeDesign } from './engine/share';
import { EMPTY_PROFILE, useApp, type SavedDiagram } from './store';
import {
  createSync,
  forServer,
  isBuilderKey,
  mergeProgress,
  needsDesignChoice,
  normalizeKey,
  playgroundCode,
  sameProgress,
  type ProgressState,
  type Sync,
} from './sync';

const DESIGN: SavedDiagram = {
  nodes: [
    { id: 'u', service: 'users', pos: { x: 30, y: 260 }, label: 'Families', source: { demand: 120 } },
    { id: 'fn', service: 'lambda', pos: { x: 400, y: 260 }, note: 'Checks sign-ups' },
  ],
  edges: [],
};
const OTHER: SavedDiagram = { nodes: [{ id: 'db', service: 'dynamodb', pos: { x: 500, y: 100 } }], edges: [] };
const THIRD: SavedDiagram = { nodes: [{ id: 'b', service: 's3', pos: { x: 500, y: 100 } }], edges: [] };
/** A design whose share code is too big for the server to keep. */
const HUGE: SavedDiagram = {
  nodes: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, service: 'lambda' as const, pos: { x: i * 10, y: 0 }, note: `${'x'.repeat(390)}${i}` })),
  edges: [],
};
const code = (d: SavedDiagram) => playgroundCode(d)!;
const services = (d: SavedDiagram | null) => d?.nodes.map((n) => n.service);
const state = (s: Partial<ProgressState> = {}): ProgressState => ({ band: null, completed: [], playground: null, unlockAll: false, ...s });

describe('progress helpers', () => {
  it('keeps no code for an empty or untouched Playground', () => {
    expect(playgroundCode(null)).toBeNull();
    expect(playgroundCode(EMPTY_PLAYGROUND)).toBeNull();
    expect(decodeDesign(playgroundCode(DESIGN)!)?.nodes).toHaveLength(2);
  });

  it('never loses a finished level when merging', () => {
    const merged = mergeProgress(state({ completed: ['l1', 'l2'] }), state({ completed: ['l2', 'm1'] }));
    expect(merged.completed).toEqual(['l1', 'l2', 'm1']);
  });

  it('takes the rest from the server when continuing from a Builder Key', () => {
    const local = state({ band: 'builder', playground: 'LOCAL', unlockAll: true });
    expect(mergeProgress(local, state({ band: 'architect', playground: 'SERVER', unlockAll: false }))).toEqual(
      state({ band: 'architect', playground: 'SERVER', unlockAll: false }),
    );
    // The server has nothing for these, so this device's values stay.
    expect(mergeProgress(local, state({ unlockAll: true }))).toMatchObject({ band: 'builder', playground: 'LOCAL' });
  });

  it('with a last-sync snapshot, takes the server’s value for anything not changed here, even an empty one', () => {
    const base = state({ band: 'builder', playground: 'A' });
    expect(mergeProgress(state({ band: 'builder', playground: 'A' }), state({ band: 'architect' }), base)).toEqual(
      state({ band: 'architect', playground: null }),
    );
  });

  it('asks which design to keep only when both sides have a different one', () => {
    expect(needsDesignChoice(null, null)).toBe(false);
    expect(needsDesignChoice('LOCAL', null)).toBe(false);
    expect(needsDesignChoice(null, 'SERVER')).toBe(false);
    expect(needsDesignChoice('SAME', 'SAME')).toBe(false);
    expect(needsDesignChoice('LOCAL', 'SERVER')).toBe(true);
  });

  it('keeps a change made on this device after the request went out', () => {
    const sent = state({ band: 'builder', playground: 'A' });
    const local = state({ band: 'explorer', playground: 'A', completed: ['l3'] });
    const server = state({ band: 'builder', playground: 'A', completed: ['l1'] });
    expect(mergeProgress(local, server, sent)).toEqual(state({ band: 'explorer', playground: 'A', completed: ['l3', 'l1'] }));
  });

  it('sends only what the server accepts', () => {
    const p = state({ band: 'wizard' as never, completed: ['l1', 'l1', 'Bad Id', 'x'.repeat(40)], playground: 'Z'.repeat(20_000) });
    expect(forServer(p, 'OLD')).toEqual(state({ completed: ['l1'], playground: 'OLD' }));
  });

  it('compares finished levels as a set', () => {
    expect(sameProgress(state({ completed: ['a', 'b'] }), state({ completed: ['b', 'a'] }))).toBe(true);
    expect(sameProgress(state({ completed: ['a'] }), state({ completed: ['a', 'b'] }))).toBe(false);
  });

  it('tidies a typed Builder Key', () => {
    expect(normalizeKey('  maple otter 4821 ')).toBe('MAPLE-OTTER-4821');
    expect(normalizeKey('maple_otter__4821')).toBe('MAPLE-OTTER-4821');
    expect(normalizeKey('Maple--Otter--4821-')).toBe('MAPLE-OTTER-4821');
    expect(normalizeKey('MAPLE-OTTER4821')).toBe('MAPLE-OTTER-4821');
    expect(isBuilderKey(normalizeKey('mapleotter4821'))).toBe(false);
    expect(isBuilderKey(normalizeKey('MAPLE-OTTER-48'))).toBe(false);
  });
});

// ── a fake Spark API that follows docs/aws/CONTRACT.md ──────

const KEY = 'MAPLE-OTTER-4821';

function fakeServer() {
  const s = {
    online: true,
    exists: false,
    knowsKey: true,
    token: '',
    tokens: 0,
    state: state(),
    calls: [] as { route: string; body: any; auth: string | null; keepalive?: boolean }[],
    /** When set, PUT waits for this before answering. */
    hold: null as Promise<void> | null,
  };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const session = (status: number) => {
    s.token = `token-${++s.tokens}`;
    return reply(status, { profileId: 'p1', token: s.token, builderKey: KEY, state: s.state, updatedAt: `t${s.tokens}` });
  };
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const route = `${init.method ?? 'GET'} ${String(input)}`;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init.headers).get('authorization');
    s.calls.push({ route, body, auth, keepalive: init.keepalive });
    if (!s.online) throw new TypeError('Failed to fetch');
    const signedIn = auth === `Bearer ${s.token}`;
    switch (route) {
      case 'POST /api/profiles':
        s.exists = true;
        return session(201);
      case 'POST /api/profiles/recover':
        return s.exists && s.knowsKey && body.builderKey === KEY ? session(200) : reply(404, { error: 'not_found', message: '' });
      case 'GET /api/profiles/me':
        if (!signedIn) return reply(401, { error: 'unauthorized', message: '' });
        return reply(200, { profileId: 'p1', state: s.state, updatedAt: 'then' });
      case 'PUT /api/profiles/me': {
        if (s.hold) await s.hold;
        if (!signedIn) return reply(401, { error: 'unauthorized', message: '' });
        const sent: ProgressState = body.state;
        s.state = { ...sent, completed: [...new Set([...s.state.completed, ...sent.completed])] };
        return reply(200, { profileId: 'p1', state: s.state, updatedAt: 'later' });
      }
      default:
        return reply(404, { error: 'not_found', message: '' });
    }
  }) as typeof globalThis.fetch;
  const routes = () => s.calls.map((c) => c.route);
  return Object.assign(s, { fetch, routes });
}

/** A clock the test moves by hand. */
function fakeClock() {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      timers.set(++next, { at: now + ms, fn });
      return next;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        timers.delete(id);
        t.fn();
      }
    },
  };
}

const app = () => useApp.getState();

describe('sync engine', () => {
  let server: ReturnType<typeof fakeServer>;
  let clock: ReturnType<typeof fakeClock>;
  let sync: Sync;
  const start = () => {
    sync = createSync({ store: useApp, fetch: server.fetch, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    sync.start();
    return sync.idle();
  };
  /** Lets the debounce run out, then waits for the API work. */
  const settle = async (ms = 2000) => {
    clock.advance(ms);
    await sync.idle();
  };
  /** This device already has a profile, with `snapshot` as the server's progress at its last sync. */
  const signedIn = (snapshot: ProgressState | null = null) => {
    server.exists = true;
    server.token = 'token-0';
    useApp.setState({
      profile: { profileId: 'p1', token: 'token-0', builderKey: KEY, lastSyncedAt: 't0', lastSynced: snapshot, builderKeySeen: true },
    });
  };

  beforeEach(() => {
    server = fakeServer();
    clock = fakeClock();
    useApp.setState({ band: 'builder', completed: [], playground: null, unlockAll: false, profile: EMPTY_PROFILE });
  });
  afterEach(() => sync?.stop());

  it('makes a Builder Key only after a level is finished, then sends the progress', async () => {
    await start();
    app().setBand('explorer');
    app().setUnlockAll(true);
    await settle();
    expect(server.calls).toHaveLength(0);
    expect(sync.getStatus()).toBe('device');

    app().complete('l1');
    await settle();
    expect(server.routes()).toEqual(['POST /api/profiles', 'PUT /api/profiles/me']);
    expect(server.calls[1].auth).toBe('Bearer token-1');
    expect(server.calls[1].body).toEqual({ state: state({ band: 'explorer', completed: ['l1'], unlockAll: true }) });
    expect(app().profile).toEqual({
      profileId: 'p1',
      token: 'token-1',
      builderKey: KEY,
      lastSyncedAt: 'later',
      lastSynced: state({ band: 'explorer', completed: ['l1'], unlockAll: true }),
      builderKeySeen: false,
    });
    expect(sync.getStatus()).toBe('synced');
  });

  it('makes a Builder Key for a real Playground design, not for the untouched starting map', async () => {
    await start();
    app().savePlayground(EMPTY_PLAYGROUND);
    await settle();
    expect(server.calls).toHaveLength(0);

    app().savePlayground(DESIGN);
    await settle();
    expect(server.routes()).toEqual(['POST /api/profiles', 'PUT /api/profiles/me']);
    expect(services(decodeDesign(server.calls[1].body.state.playground))).toEqual(['users', 'lambda']);
  });

  it('waits for a pause in changes, then sends them together', async () => {
    signedIn();
    await start();
    server.calls.length = 0;
    app().complete('l1');
    await settle(1500);
    app().complete('l2');
    await settle(1500);
    expect(server.calls).toHaveLength(0);
    await settle(500);
    expect(server.routes()).toEqual(['PUT /api/profiles/me']);
    expect(server.calls[0].body.state.completed).toEqual(['l1', 'l2']);
  });

  it('skips the call when nothing new needs saving', async () => {
    const same = state({ band: 'builder', playground: code(DESIGN) });
    signedIn(same);
    server.state = same;
    app().savePlayground(DESIGN);
    await start();
    expect(server.routes()).toEqual(['GET /api/profiles/me']);
    // The Playground saves an equal copy of the same design when it opens.
    app().savePlayground(decodeDesign(encodeDesign(DESIGN)));
    await settle();
    expect(server.calls).toHaveLength(1);
  });

  describe('at start-up', () => {
    const lastSync = state({ band: 'builder', completed: ['l1'], playground: code(DESIGN) });
    const newer = state({ band: 'architect', completed: ['l1', 'l2'], playground: code(OTHER), unlockAll: true });

    it('old device reopens and the server is newer: the server’s design and settings win', async () => {
      signedIn(lastSync);
      server.state = newer;
      useApp.setState({ band: 'builder', completed: ['l1'], playground: DESIGN, unlockAll: false });
      await start();
      expect(server.routes()).toEqual(['GET /api/profiles/me']); // nothing new to send
      expect(app()).toMatchObject({ band: 'architect', completed: ['l1', 'l2'], unlockAll: true });
      expect(services(app().playground)).toEqual(['dynamodb']);
      expect(app().profile.lastSynced).toEqual(newer);
      expect(server.state).toEqual(newer);
      expect(sync.getStatus()).toBe('synced');
    });

    it('device changed while offline: its change stays, the rest comes from the server, levels are combined', async () => {
      signedIn(lastSync);
      server.state = newer;
      useApp.setState({ band: 'builder', completed: ['l1', 'l3'], playground: THIRD, unlockAll: false });
      await start();
      expect(server.routes()).toEqual(['GET /api/profiles/me', 'PUT /api/profiles/me']);
      expect(services(app().playground)).toEqual(['s3']);
      expect(app()).toMatchObject({ band: 'architect', completed: ['l1', 'l3', 'l2'], unlockAll: true });
      expect(server.state).toEqual(state({ band: 'architect', completed: ['l1', 'l2', 'l3'], playground: code(THIRD), unlockAll: true }));
    });

    it('first run with no snapshot: the server wins except where it has nothing', async () => {
      signedIn(null);
      server.state = state({ band: null, completed: ['m1'], playground: code(OTHER), unlockAll: false });
      useApp.setState({ band: 'builder', completed: ['l1'], playground: DESIGN, unlockAll: true });
      await start();
      expect(app()).toMatchObject({ band: 'builder', completed: ['l1', 'm1'], unlockAll: false });
      expect(services(app().playground)).toEqual(['dynamodb']);
      expect(server.routes()).toEqual(['GET /api/profiles/me', 'PUT /api/profiles/me']);
      expect(server.state).toEqual(state({ band: 'builder', completed: ['m1', 'l1'], playground: code(OTHER) }));
    });

    it('a design too big to store keeps the server’s copy instead of erasing it', async () => {
      signedIn(state({ band: 'builder', playground: code(DESIGN) }));
      server.state = state({ band: 'builder', playground: code(DESIGN) });
      app().savePlayground(HUGE);
      await start();
      app().complete('l1');
      await settle();
      const put = server.calls.find((c) => c.route === 'PUT /api/profiles/me');
      expect(put?.body.state.playground).toBe(code(DESIGN));
      expect(services(app().playground)).toHaveLength(80); // still on this device
    });
  });

  it('stays quiet when the API is unreachable, and tries again on the next change', async () => {
    server.online = false;
    await start();
    app().complete('l1');
    await settle();
    expect(server.routes()).toEqual(['POST /api/profiles']);
    expect(app().profile).toEqual(EMPTY_PROFILE);
    expect(app().completed).toEqual(['l1']);
    expect(sync.getStatus()).toBe('device');

    server.online = true;
    app().setBand('architect');
    await settle();
    expect(server.routes()).toEqual(['POST /api/profiles', 'POST /api/profiles', 'PUT /api/profiles/me']);
    expect(server.state).toEqual(state({ band: 'architect', completed: ['l1'] }));
  });

  it('shows "for now" while a Builder Key can’t be reached, and catches up later', async () => {
    signedIn();
    server.online = false;
    await start();
    expect(sync.getStatus()).toBe('offline');
    app().complete('l1');
    await settle();
    expect(sync.getStatus()).toBe('offline');

    server.online = true;
    app().complete('l2');
    await settle();
    expect(sync.getStatus()).toBe('synced');
    expect(server.state.completed).toEqual(['l1', 'l2']);
  });

  it('sends the save that runs as the tab closes as a request that outlives the page', async () => {
    signedIn();
    await start();
    app().complete('l1');
    await sync.flush({ keepalive: true });
    app().complete('l2');
    await settle();
    const puts = server.calls.filter((c) => c.route === 'PUT /api/profiles/me');
    expect(puts.at(-2)?.keepalive).toBe(true);
    expect(puts.at(-1)?.keepalive).toBeFalsy();
  });

  it('after a 401, clears the token, keeps the key, and gets a new token with it on the next change', async () => {
    signedIn();
    server.token = 'token-from-another-computer';
    await start();
    expect(server.routes()).toEqual(['GET /api/profiles/me']);
    expect(app().profile).toMatchObject({ token: null, builderKey: KEY });
    expect(sync.getStatus()).toBe('offline');

    await settle(10_000);
    expect(server.calls).toHaveLength(1); // nothing until something changes

    app().complete('l4');
    await settle();
    expect(server.routes().slice(1)).toEqual(['POST /api/profiles/recover', 'PUT /api/profiles/me']);
    expect(server.calls[1].body).toEqual({ builderKey: KEY });
    expect(server.calls[2].auth).toBe(`Bearer ${server.token}`);
    expect(app().profile).toMatchObject({ token: server.token, builderKey: KEY });
    expect(sync.getStatus()).toBe('synced');
  });

  it('after a 401 with a key the server no longer knows, makes a new one lazily', async () => {
    signedIn();
    server.token = 'token-from-another-computer';
    server.knowsKey = false;
    await start();
    app().setBand('explorer');
    await settle();
    expect(server.routes()).toEqual(['GET /api/profiles/me', 'POST /api/profiles/recover']);
    expect(app().profile).toEqual(EMPTY_PROFILE);
    expect(sync.getStatus()).toBe('device');

    app().setBand('architect');
    await settle();
    expect(server.calls).toHaveLength(2); // not a real save yet

    app().complete('l1');
    await settle();
    expect(server.routes().slice(2)).toEqual(['POST /api/profiles', 'PUT /api/profiles/me']);
    expect(app().profile.token).toBe(server.token);
  });

  it('keeps a change made while a request was out, and sends it next', async () => {
    signedIn();
    await start();
    let release!: () => void;
    server.hold = new Promise<void>((r) => (release = r));
    app().complete('l1');
    clock.advance(2000);
    await Promise.resolve();
    app().setBand('explorer'); // while the PUT is waiting
    release();
    await sync.idle();
    expect(app().band).toBe('explorer');
    expect(server.state.band).toBe('builder');
    server.hold = null;
    await settle();
    expect(server.state).toEqual(state({ band: 'explorer', completed: ['l1'] }));
  });

  describe('continue my progress', () => {
    const fromKey = state({ band: 'architect', completed: ['m1'], playground: code(OTHER), unlockAll: true });
    let asked = 0;
    const choose = (c: 'local' | 'server') => async () => {
      asked++;
      return c;
    };
    beforeEach(() => {
      asked = 0;
      server.exists = true;
      server.state = fromKey;
    });

    it('keeps levels from both computers, takes the rest from the key, and sends the result once', async () => {
      useApp.setState({ band: 'builder', completed: ['l1'], playground: DESIGN });
      await start();

      await expect(sync.recover(' maple otter 4821 ', choose('server'))).resolves.toBe('ok');
      expect(asked).toBe(1);
      expect(server.routes()).toEqual(['POST /api/profiles/recover', 'PUT /api/profiles/me']);
      expect(server.calls[0].body).toEqual({ builderKey: KEY });
      expect(app()).toMatchObject({ band: 'architect', completed: ['l1', 'm1'], unlockAll: true });
      expect(services(app().playground)).toEqual(['dynamodb']);
      expect(app().profile).toMatchObject({ profileId: 'p1', token: server.token, builderKey: KEY, builderKeySeen: true });
      expect(server.calls[1].auth).toBe(`Bearer ${server.token}`);
      expect(server.state.completed).toEqual(['m1', 'l1']);
      expect(sync.getStatus()).toBe('synced');
    });

    it('keeps this computer’s design when the student picks it', async () => {
      useApp.setState({ completed: [], playground: DESIGN });
      await start();
      await expect(sync.recover(KEY, choose('local'))).resolves.toBe('ok');
      expect(asked).toBe(1);
      expect(services(app().playground)).toEqual(['users', 'lambda']);
      expect(server.state.playground).toBe(code(DESIGN));
      expect(app().band).toBe('architect');
    });

    it('doesn’t ask when only one side has a design', async () => {
      await start();
      await sync.recover(KEY, choose('local')); // nothing on this computer
      expect(asked).toBe(0);
      expect(services(app().playground)).toEqual(['dynamodb']);

      server.state = state({ completed: ['m1'] }); // nothing on the key
      useApp.setState({ playground: DESIGN });
      await sync.recover(KEY, choose('server'));
      expect(asked).toBe(0);
      expect(services(app().playground)).toEqual(['users', 'lambda']);
    });

    it('says so for a key the server doesn’t know, and changes nothing', async () => {
      server.knowsKey = false;
      app().complete('l1');
      await start();
      await expect(sync.recover('PLUM-CLOUD-0001')).resolves.toBe('not_found');
      expect(app().profile).toEqual(EMPTY_PROFILE);
      expect(app().completed).toEqual(['l1']);
    });

    it('says so when offline', async () => {
      server.online = false;
      await start();
      await expect(sync.recover(KEY)).resolves.toBe('offline');
    });

    it('checks the shape before asking the server', async () => {
      await start();
      await expect(sync.recover('maple otter')).resolves.toBe('bad_key');
      expect(server.calls).toHaveLength(0);
    });
  });
});

describe('the one-time Builder Key notice', () => {
  const profile = (builderKey: string | null, builderKeySeen: boolean) => ({ builderKey, builderKeySeen });

  it('is due once a key exists that the student hasn’t seen', () => {
    expect(keyNoticeDue(profile(null, false), 'home')).toBe(false);
    expect(keyNoticeDue(profile(KEY, false), 'home')).toBe(true);
    expect(keyNoticeDue(profile(KEY, false), 'map')).toBe(true);
    expect(keyNoticeDue(profile(KEY, false), 'playground')).toBe(true);
    expect(keyNoticeDue(profile(KEY, true), 'home')).toBe(false);
  });

  it('waits while a level is open, so it never covers the puzzle or the win card', () => {
    expect(keyNoticeDue(profile(KEY, false), 'level')).toBe(false);
  });

  describe('with the sync engine', () => {
    let server: ReturnType<typeof fakeServer>;
    let clock: ReturnType<typeof fakeClock>;
    let sync: Sync;
    const settle = async () => {
      clock.advance(2000);
      await sync.idle();
    };
    beforeEach(() => {
      server = fakeServer();
      clock = fakeClock();
      useApp.setState({ band: 'builder', completed: [], playground: null, unlockAll: false, profile: EMPTY_PROFILE });
      sync = createSync({ store: useApp, fetch: server.fetch, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
      sync.start();
    });
    afterEach(() => sync.stop());

    it('shows for a key made mid-level once the student leaves the level, and only until they close it', async () => {
      app().complete('l1'); // the win, while the level is still open
      await settle();
      expect(app().profile.builderKey).toBe(KEY);
      expect(keyNoticeDue(app().profile, 'level')).toBe(false);
      expect(keyNoticeDue(app().profile, 'map')).toBe(true);

      app().setProfile({ builderKeySeen: true }); // "Got it", or opening the dialog
      expect(keyNoticeDue(app().profile, 'map')).toBe(false);

      // A new token for the same key (after this key was used on another computer) doesn't show it again.
      server.token = 'token-from-another-computer';
      app().complete('l2');
      await settle();
      expect(app().profile.token).toBeNull();
      app().complete('l3');
      await settle();
      expect(app().profile).toMatchObject({ token: server.token, builderKey: KEY, builderKeySeen: true });
      expect(keyNoticeDue(app().profile, 'map')).toBe(false);
    });

    it('stays seen after a reload, because the flag is saved with the profile', async () => {
      app().complete('l1');
      await settle();
      app().setProfile({ builderKeySeen: true });
      const saved = await useApp.persist.getOptions().storage!.getItem('spark-cloud-builders');
      expect(saved).toMatchObject({ version: 3, state: { profile: { builderKey: KEY, builderKeySeen: true } } });
    });

    it('doesn’t announce a key the student typed in themselves', async () => {
      server.exists = true;
      await expect(sync.recover(KEY)).resolves.toBe('ok');
      expect(keyNoticeDue(app().profile, 'home')).toBe(false);
    });

    it('shows again for a brand-new key when the old one is gone', async () => {
      useApp.setState({
        profile: { ...EMPTY_PROFILE, profileId: 'p1', token: 'old', builderKey: KEY, lastSyncedAt: 't0', builderKeySeen: true },
      });
      server.exists = true;
      server.knowsKey = false;
      server.token = 'token-from-another-computer';
      app().complete('l1');
      await settle(); // 401
      app().complete('l2');
      await settle(); // the key is unknown, so the profile is cleared and a new one is made for this real save
      expect(server.routes().slice(-3)).toEqual(['POST /api/profiles/recover', 'POST /api/profiles', 'PUT /api/profiles/me']);
      expect(app().profile.builderKeySeen).toBe(false);
      expect(keyNoticeDue(app().profile, 'map')).toBe(true);
    });
  });
});
