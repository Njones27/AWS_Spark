import { ApiError, apiFetch, type ApiInit } from './api/client';
import { MAX_SHARE_CODE } from './api/shares';
import { isBlank } from './components/canvas/saved';
import type { Band } from './data/types';
import { decodeDesign, encodeDesign } from './engine/share';
import { useApp, type AppState, type ProgressState, type SavedDiagram } from './store';

// Background sync between this device and the student's Builder Key profile (docs/aws/CONTRACT.md).
// localStorage stays the source of truth: the app never waits for the API, and a failed call only changes the small
// status line. The next change (or the next visit) tries again.
//
// When this device learns the server's progress (at start-up, or after getting a new token), it merges three ways
// against `profile.lastSynced`, the server's progress at this device's last sync: a field that still matches it
// hasn't changed here, so the server's (possibly newer) value wins; a field that differs was changed on this device
// while offline, so it stays. Finished levels are always the union.

export type { ProgressState };

interface ProfileReply {
  profileId: string;
  state: unknown;
  updatedAt: string;
}
interface SessionReply extends ProfileReply {
  token: string;
  builderKey: string;
}

/** `device`: no Builder Key yet. `synced`: the server has this device's progress. `offline`: it will catch up later. */
export type SyncStatus = 'device' | 'synced' | 'offline';
export type RecoverResult = 'ok' | 'bad_key' | 'not_found' | 'offline';
/** Which Playground design to keep when this computer and the Builder Key each have a different one. */
export type DesignChoice = 'local' | 'server';

const BANDS: readonly string[] = ['explorer', 'builder', 'architect'];
const LEVEL_ID = /^[a-z0-9-]{1,32}$/;
const MAX_COMPLETED = 500;
const BUILDER_KEY = /^[A-Z]+-[A-Z]+-\d{4}$/;
const NOTHING: ProgressState = { band: null, completed: [], playground: null, unlockAll: false };

// ── pure helpers ────────────────────────────────────────────

/** The share code for a saved design, or null when there's nothing worth keeping (no design, or only the starting townsfolk). */
export function playgroundCode(d: SavedDiagram | null): string | null {
  if (!d || isBlank(d)) return null;
  const code = encodeDesign(d);
  return decodeDesign(code) ? code : null;
}

/** This device's progress, in the shape the server keeps. */
export function toProgress(s: Pick<AppState, 'band' | 'completed' | 'playground' | 'unlockAll'>): ProgressState {
  return { band: s.band, completed: s.completed, playground: playgroundCode(s.playground), unlockAll: s.unlockAll };
}

/**
 * Only what the server accepts (its schema is closed). A design too big to store sends `keepCode`, the server's
 * current design, so the server keeps what it has instead of losing it.
 */
export function forServer(p: ProgressState, keepCode: string | null): ProgressState {
  return {
    band: p.band && BANDS.includes(p.band) ? p.band : null,
    completed: [...new Set(p.completed.filter((id) => typeof id === 'string' && LEVEL_ID.test(id)))].slice(0, MAX_COMPLETED),
    playground: p.playground && p.playground.length > MAX_SHARE_CODE ? keepCode : p.playground,
    unlockAll: p.unlockAll === true,
  };
}

/** Reads a progress state from a server reply, or null if it isn't one. */
export function readProgress(v: unknown): ProgressState | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (!Array.isArray(s.completed) || typeof s.unlockAll !== 'boolean') return null;
  if (s.playground !== null && typeof s.playground !== 'string') return null;
  return {
    band: typeof s.band === 'string' && BANDS.includes(s.band) ? (s.band as Band) : null,
    completed: s.completed.filter((id): id is string => typeof id === 'string'),
    playground: s.playground,
    unlockAll: s.unlockAll,
  };
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

/** Same progress, ignoring the order of finished levels. */
export function sameProgress(a: ProgressState, b: ProgressState): boolean {
  const done = new Set(a.completed);
  return (
    a.band === b.band &&
    a.unlockAll === b.unlockAll &&
    a.playground === b.playground &&
    done.size === new Set(b.completed).size &&
    b.completed.every((id) => done.has(id))
  );
}

/**
 * Combines this device's progress with the server's. A finished level is never lost: `completed` is the union.
 * With a `base` (the server's progress when this device last synced, or what this device just sent), a field this
 * device changed since then stays, and any other field takes the server's value. With no `base` (first run, or
 * continuing from a Builder Key), the server wins wherever it has a value.
 */
export function mergeProgress(local: ProgressState, server: ProgressState, base: ProgressState | null = null): ProgressState {
  const pick = <K extends 'band' | 'playground' | 'unlockAll'>(k: K): ProgressState[K] =>
    base ? (local[k] !== base[k] ? local[k] : server[k]) : (server[k] ?? local[k]);
  return {
    completed: union(local.completed, server.completed),
    band: pick('band'),
    playground: pick('playground'),
    unlockAll: pick('unlockAll'),
  };
}

/** Ask which design to keep only when both sides have a real design and they differ. */
export function needsDesignChoice(localCode: string | null, serverCode: string | null): boolean {
  return !!localCode && !!serverCode && localCode !== serverCode;
}

/** Tidies a Builder Key while it's typed: capitals, and one dash for any space or mark between the parts. */
export function formatKeyInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-/, '');
}

/** A typed Builder Key in the server's form, like MAPLE-OTTER-4821. Also adds a missing dash before the numbers. */
export function normalizeKey(raw: string): string {
  return formatKeyInput(raw.trim())
    .replace(/([A-Z])(?=\d)/g, '$1-')
    .replace(/-+$/, '');
}

export const isBuilderKey = (key: string) => BUILDER_KEY.test(key);

const isSession = (v: unknown): v is SessionReply => {
  const r = v as Partial<SessionReply> | null;
  return !!r && typeof r.profileId === 'string' && typeof r.token === 'string' && typeof r.builderKey === 'string';
};

// ── the engine ──────────────────────────────────────────────

type SyncStore = Pick<typeof useApp, 'getState' | 'setState' | 'subscribe'>;

export interface SyncDeps {
  store: SyncStore;
  /** For tests. Defaults to the browser's fetch. */
  fetch?: typeof fetch;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  debounceMs?: number;
}

export type Sync = ReturnType<typeof createSync>;

export function createSync({
  store,
  fetch,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  debounceMs = 2000,
}: SyncDeps) {
  let timer: unknown = null;
  // One API job at a time, in order, so a sync never races a recovery with an old token.
  let queue: Promise<unknown> = Promise.resolve();
  let syncQueued = false;
  // The next sync is the last chance before the tab closes, so its request must outlive the page.
  let keepalive = false;
  // True while this module writes the server's progress into the store, so that write doesn't trigger another sync.
  let applying = false;
  // A level was finished or a design saved, so it's time to make a Builder Key (profiles are made lazily).
  let wantsProfile = false;
  // What the server holds right now, as far as this page knows. Null until a reply says (start-up, after a 401).
  let serverState: ProgressState | null = null;
  let unsubscribe: (() => void) | null = null;

  const listeners = new Set<() => void>();
  const profileNow = () => store.getState().profile;
  let status: SyncStatus = profileNow().builderKey ? (profileNow().lastSyncedAt ? 'synced' : 'offline') : 'device';
  const setStatus = (next: SyncStatus) => {
    if (next === status) return;
    status = next;
    listeners.forEach((l) => l());
  };
  const settled = () => setStatus(profileNow().builderKey ? 'offline' : 'device');

  const call = <T>(path: string, init: ApiInit) => apiFetch<T>(path, { ...init, fetch });

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = () => {
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const p = queue.then(job);
    queue = p.catch(() => undefined);
    return p;
  };

  /** Writes merged progress into the store, touching only what changed. */
  function apply(local: ProgressState, merged: ProgressState) {
    const s = store.getState();
    const patch: Partial<AppState> = {};
    const have = new Set(s.completed);
    if (merged.completed.some((id) => !have.has(id))) patch.completed = union(s.completed, merged.completed);
    if (merged.band !== s.band) patch.band = merged.band;
    if (merged.unlockAll !== s.unlockAll) patch.unlockAll = merged.unlockAll;
    if (merged.playground !== local.playground) {
      const design = merged.playground ? decodeDesign(merged.playground) : null;
      if (design || !merged.playground) patch.playground = design;
    }
    if (!Object.keys(patch).length) return;
    applying = true;
    try {
      store.setState(patch);
    } finally {
      applying = false;
    }
  }

  /** Takes in the server's progress: a three-way merge against this device's last sync, then remembers it. */
  function reconcile(server: ProgressState) {
    serverState = server;
    const local = toProgress(store.getState());
    apply(local, mergeProgress(local, server, profileNow().lastSynced));
    store.getState().setProfile({ lastSynced: server });
  }

  function onChange(s: AppState, prev: AppState) {
    if (applying) return;
    if (s.band === prev.band && s.completed === prev.completed && s.playground === prev.playground && s.unlockAll === prev.unlockAll) {
      return;
    }
    const p = s.profile;
    // Without a token, note whether this was a real save: if the saved key turns out to be gone, it makes a new one.
    if (!p.token && !wantsProfile) {
      const finished = s.completed.some((id) => !prev.completed.includes(id));
      const code = s.playground !== prev.playground ? playgroundCode(s.playground) : null;
      wantsProfile = finished || (code !== null && code !== playgroundCode(prev.playground));
    }
    if (p.token || p.builderKey || wantsProfile) schedule();
  }

  /** Gets a token: with the saved Builder Key if there is one, or by making a new profile after a real save. */
  async function connect(): Promise<boolean> {
    const { builderKey } = profileNow();
    if (builderKey) {
      try {
        // The token was replaced because this key was used on another computer. Same key, new token.
        const res = await call<SessionReply>('/profiles/recover', { method: 'POST', body: { builderKey }, token: null });
        const server = isSession(res) ? readProgress(res.state) : null;
        if (!server) throw new ApiError(200, 'unavailable');
        store.getState().setProfile({ profileId: res.profileId, token: res.token, builderKey: res.builderKey });
        wantsProfile = false;
        reconcile(server);
        return true;
      } catch (e) {
        if (!(e instanceof ApiError) || e.offline || e.status !== 404) throw e;
        // The server no longer knows this key. Start over with a new one at the next real save.
        store.getState().clearProfile();
        serverState = null;
      }
    }
    if (!wantsProfile) {
      settled();
      return false;
    }
    const res = await call<SessionReply>('/profiles', { method: 'POST', body: {}, token: null });
    if (!isSession(res)) throw new ApiError(200, 'unavailable');
    wantsProfile = false;
    // A new profile is empty, so everything on this device is sent as it is (no merge).
    serverState = readProgress(res.state) ?? NOTHING;
    // A brand-new key, so the one-time "You earned a Builder Key!" notice shows (see BuilderKey.tsx).
    store.getState().setProfile({
      profileId: res.profileId,
      token: res.token,
      builderKey: res.builderKey,
      lastSyncedAt: null,
      lastSynced: null,
      builderKeySeen: false,
    });
    return true;
  }

  /** Learns the server's progress if needed, then sends this device's progress if it differs. Never throws. */
  async function syncOnce(): Promise<void> {
    const outlive = keepalive;
    keepalive = false;
    try {
      if (!profileNow().token && !(await connect())) return;
      if (!serverState) {
        // First sync since this page loaded: get the server's progress before sending, so newer work from another
        // computer isn't replaced by an older copy here.
        const res = await call<ProfileReply>('/profiles/me', { token: profileNow().token });
        const server = readProgress(res?.state);
        if (!server) throw new ApiError(200, 'unavailable');
        reconcile(server);
      }
      const known: ProgressState = serverState!;
      const out = forServer(toProgress(store.getState()), known.playground);
      if (sameProgress(out, known)) {
        setStatus('synced');
        return;
      }
      const res = await call<ProfileReply>('/profiles/me', {
        method: 'PUT',
        body: { state: out },
        token: profileNow().token,
        keepalive: outlive,
      });
      const server = readProgress(res?.state);
      if (!server) throw new ApiError(200, 'unavailable');
      serverState = server;
      // The student may have kept playing while the request was out. Their newest changes stay.
      const now = toProgress(store.getState());
      apply(now, mergeProgress(now, server, out));
      store.getState().setProfile({
        lastSynced: server,
        lastSyncedAt: typeof res.updatedAt === 'string' ? res.updatedAt : new Date().toISOString(),
      });
      setStatus('synced');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Keep the Builder Key. The next sync gets a fresh token with it.
        store.getState().setProfile({ token: null });
        serverState = null;
      }
      settled();
    }
  }

  /** Syncs now instead of waiting for the debounce. Resolves when the API work queued so far is done. */
  function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    cancelTimer();
    if (opts.keepalive) keepalive = true;
    if (!syncQueued) {
      syncQueued = true;
      void enqueue(async () => {
        syncQueued = false;
        await syncOnce();
      });
    }
    return queue.then(() => undefined);
  }

  async function recoverOnce(builderKey: string, chooseDesign?: () => Promise<DesignChoice>): Promise<RecoverResult> {
    let res: SessionReply;
    try {
      res = await call<SessionReply>('/profiles/recover', { method: 'POST', body: { builderKey }, token: null });
    } catch (e) {
      return e instanceof ApiError && !e.offline && (e.status === 404 || e.status === 400) ? 'not_found' : 'offline';
    }
    const server = isSession(res) ? readProgress(res.state) : null;
    if (!server) return 'offline';
    // Nothing is saved until the student picks, so closing the page mid-question changes nothing.
    const choice =
      chooseDesign && needsDesignChoice(toProgress(store.getState()).playground, server.playground) ? await chooseDesign() : 'server';
    store.getState().setProfile({
      profileId: res.profileId,
      token: res.token,
      builderKey: res.builderKey,
      lastSyncedAt: typeof res.updatedAt === 'string' ? res.updatedAt : null,
      lastSynced: server,
      // The student just typed this key, so there's no need to announce it.
      builderKeySeen: true,
    });
    wantsProfile = false;
    serverState = server;
    // Levels finished on either computer are kept. Everything else comes from the Builder Key, except the design
    // when the student chose the one on this computer.
    const local = toProgress(store.getState());
    const merged = mergeProgress(local, server);
    if (choice === 'local') merged.playground = local.playground;
    apply(local, merged);
    return 'ok';
  }

  const onHidden = () => {
    // The tab is closing or the lid shut: send a waiting change now, in a request that outlives the page.
    if (document.visibilityState === 'hidden' && timer !== null) void flush({ keepalive: true });
  };

  return {
    /** Starts watching the store. With a profile already here, syncs once: pull the server's progress, then push. */
    start() {
      if (unsubscribe) return;
      unsubscribe = store.subscribe(onChange);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);
      const p = profileNow();
      if (p.token || p.builderKey) void flush();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      cancelTimer();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden);
    },
    flush,
    /** Resolves when no API work is waiting or running. */
    idle: (): Promise<void> => queue.then(() => undefined),
    /**
     * "Continue my progress": brings a Builder Key's progress to this device, then sends the combined result.
     * `chooseDesign` is asked only when this computer and the key each have a different Playground design.
     */
    async recover(input: string, chooseDesign?: () => Promise<DesignChoice>): Promise<RecoverResult> {
      const builderKey = normalizeKey(input);
      if (!isBuilderKey(builderKey)) return 'bad_key';
      // A change waiting on the debounce stays scheduled. The queue runs it after this, with the new token.
      const result = await enqueue(() => recoverOnce(builderKey, chooseDesign));
      if (result === 'ok') await flush();
      return result;
    },
    getStatus: () => status,
    subscribeStatus(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The app's one sync engine. main.tsx starts it. */
export const appSync = createSync({ store: useApp });
