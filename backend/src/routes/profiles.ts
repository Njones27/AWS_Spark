import { randomUUID } from 'node:crypto';
import {
  builderKeyHash,
  hashesEqual,
  legacyBuilderKeyHash,
  MIN_SECRET_LENGTH,
  newToken,
  parseBearer,
  sha256Hex,
} from '../lib/auth';
import { isBuilderKey, newBuilderKey, normalizeBuilderKey } from '../lib/codes';
import { fail, json, MESSAGES, type ApiRequest, type Reply } from '../lib/http';
import { mergeState } from '../lib/merge';
import { ttlFrom, WRITE_ATTEMPTS, type ProfileRecord, type Store } from '../lib/store';
import { parseCreateProfile, parsePutProfile, parseRecover, type ProgressState } from '../lib/validate';

const newState = (): ProgressState => ({ band: null, completed: [], playground: null, unlockAll: false });

const unauthorized = () => fail('unauthorized', MESSAGES.unauthorized);
const badRequest = () => fail('bad_request', MESSAGES.badRequest);

const view = (p: ProfileRecord) => ({ profileId: p.profileId, state: p.state, updatedAt: p.updatedAt });

/** The profile this token belongs to, if the token is still in its list (not evicted). */
async function profileFor(store: Store, tokenHash: string): Promise<ProfileRecord | null> {
  const profileId = await store.getProfileIdByToken(tokenHash);
  const profile = profileId ? await store.getProfile(profileId) : null;
  return profile?.tokens.some((hash) => hashesEqual(hash, tokenHash)) ? profile : null;
}

const bearerHash = (req: ApiRequest): string | null => {
  const token = parseBearer(req.headers);
  return token ? sha256Hex(token) : null;
};

/** The stage's Builder Key pepper. A deploy without one is broken, so this throws (a logged 500) rather than guess. */
function pepperOf(req: ApiRequest): string {
  const pepper = req.env.BUILDER_KEY_PEPPER ?? '';
  if (pepper.length < MIN_SECRET_LENGTH) throw new Error('BUILDER_KEY_PEPPER is missing or too short');
  return pepper;
}

/** The signed-in profile and this request's token hash, or null when the token doesn't (or no longer) work. */
async function signedIn(req: ApiRequest): Promise<{ store: Store; tokenHash: string; profile: ProfileRecord } | null> {
  const tokenHash = bearerHash(req);
  if (!tokenHash) return null;
  const store = req.store();
  const profile = await profileFor(store, tokenHash);
  return profile ? { store, tokenHash, profile } : null;
}

/**
 * The profile a Builder Key opens, looked up by its peppered hash. A key filed under the old plain SHA-256 is found
 * too and moved to the peppered hash on the spot, so the table stops holding hashes anyone could reverse.
 */
async function profileIdForKey(store: Store, builderKey: string, pepper: string, now: Date): Promise<string | null> {
  const keyHash = builderKeyHash(builderKey, pepper);
  const found = await store.getProfileIdByKey(keyHash);
  if (found) return found;
  const legacyHash = legacyBuilderKeyHash(builderKey);
  const legacyId = await store.getProfileIdByKey(legacyHash);
  const legacy = legacyId ? await store.getProfile(legacyId) : null;
  if (!legacy || !hashesEqual(legacy.keyHash, legacyHash)) return null;
  await store.upgradeKeyHash(legacy.profileId, { from: legacyHash, to: keyHash, createdAt: now.toISOString() });
  // Upgraded now, or by another recovery a moment ago: either way the key is filed under the new hash.
  return store.getProfileIdByKey(keyHash);
}

/** `POST /api/profiles`: a new anonymous profile. The token and Builder Key are returned this once, never stored. */
export async function createProfile(req: ApiRequest): Promise<Reply> {
  if (!parseCreateProfile(req.body).ok) return badRequest();
  const pepper = pepperOf(req);
  const store = req.store();
  const createdAt = req.now.toISOString();
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const token = newToken();
    const builderKey = newBuilderKey();
    const profile: ProfileRecord = {
      profileId: randomUUID(),
      tokens: [sha256Hex(token)],
      keyHash: builderKeyHash(builderKey, pepper),
      state: newState(),
      createdAt,
      updatedAt: createdAt,
    };
    if ((await store.createProfile(profile, ttlFrom(req.now))) === 'ok') {
      return json(201, { profileId: profile.profileId, token, builderKey, state: profile.state, updatedAt: createdAt });
    }
  }
  throw new Error(`No free Builder Key after ${WRITE_ATTEMPTS} tries`);
}

/** `GET /api/profiles/me` */
export async function getMe(req: ApiRequest): Promise<Reply> {
  const tokenHash = bearerHash(req);
  const profile = tokenHash ? await profileFor(req.store(), tokenHash) : null;
  return profile ? json(200, view(profile)) : unauthorized();
}

/** `PUT /api/profiles/me`: merges (see lib/merge.ts) and returns the merged state for the client to adopt. */
export async function putMe(req: ApiRequest): Promise<Reply> {
  const tokenHash = bearerHash(req);
  const store = req.store();
  let profile = tokenHash ? await profileFor(store, tokenHash) : null;
  if (!tokenHash || !profile) return unauthorized();
  const incoming = parsePutProfile(req.body);
  if (!incoming.ok) return badRequest();

  const updatedAt = req.now.toISOString();
  const ttl = ttlFrom(req.now);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const state = mergeState(profile.state, incoming.value);
    const saved = await store.putProfile(profile.profileId, { expected: profile.state, next: state, updatedAt, ttl });
    if (saved === 'ok') return json(200, { profileId: profile.profileId, state, updatedAt });
    // Another computer saved in between. Merge with what it saved, so neither loses a finished level.
    profile = await profileFor(store, tokenHash);
    if (!profile) return unauthorized();
  }
  throw new Error(`Progress kept changing during ${WRITE_ATTEMPTS} saves`);
}

/**
 * `POST /api/profiles/recover`: continue on another computer. Adds a token for it; other computers stay signed in,
 * up to MAX_TOKENS, after which the oldest is signed out. There is no per-key backoff for guessing: the API Gateway
 * route throttle on this route is the guard for now (a key is one of about 10^10).
 */
export async function recover(req: ApiRequest): Promise<Reply> {
  const input = parseRecover(req.body);
  if (!input.ok) return badRequest();
  const builderKey = normalizeBuilderKey(input.value);
  if (!isBuilderKey(builderKey)) return fail('bad_request', MESSAGES.badKey);

  const pepper = pepperOf(req);
  const store = req.store();
  const keyHash = builderKeyHash(builderKey, pepper);
  const profileId = await profileIdForKey(store, builderKey, pepper, req.now);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const profile = profileId ? await store.getProfile(profileId) : null;
    if (!profile || !hashesEqual(profile.keyHash, keyHash)) return fail('not_found', MESSAGES.keyNotFound);
    const token = newToken();
    const added = await store.addToken(profile.profileId, {
      expected: profile.tokens,
      tokenHash: sha256Hex(token),
      createdAt: req.now.toISOString(),
      ttl: ttlFrom(req.now),
    });
    if (added === 'ok') {
      return json(200, {
        profileId: profile.profileId,
        token,
        builderKey,
        state: profile.state,
        updatedAt: profile.updatedAt,
      });
    }
  }
  throw new Error(`Tokens kept changing during ${WRITE_ATTEMPTS} recoveries`);
}

/**
 * `POST /api/profiles/me/key`: a new Builder Key for this profile, for when the old one was seen by someone else.
 * The old key stops working at once, and every other computer is signed out; this one stays signed in. The new key
 * is returned this once, never stored.
 */
export async function rotateKey(req: ApiRequest): Promise<Reply> {
  if (!parseCreateProfile(req.body).ok) return badRequest();
  const pepper = pepperOf(req);
  let session = await signedIn(req);
  if (!session) return unauthorized();
  const createdAt = req.now.toISOString();
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { store, tokenHash, profile } = session;
    const builderKey = newBuilderKey();
    const result = await store.rotateKey(profile.profileId, {
      expectedKeyHash: profile.keyHash,
      newKeyHash: builderKeyHash(builderKey, pepper),
      expectedTokens: profile.tokens,
      keepTokenHash: tokenHash,
      createdAt,
      ttl: ttlFrom(req.now),
    });
    if (result === 'ok') {
      return json(200, { profileId: profile.profileId, builderKey, state: profile.state, updatedAt: profile.updatedAt });
    }
    // Taken: the next try picks another key. Conflict: another computer changed the profile, so read it again.
    if (result === 'conflict') {
      session = await signedIn(req);
      if (!session) return unauthorized();
    }
  }
  throw new Error(`Key change kept failing during ${WRITE_ATTEMPTS} tries`);
}

/**
 * `DELETE /api/profiles/me`: removes the profile, its Builder Key and every computer's sign-in from Spark. The
 * progress saved on each computer itself is untouched; the next save there starts a new Builder Key.
 */
export async function deleteMe(req: ApiRequest): Promise<Reply> {
  let session = await signedIn(req);
  if (!session) return unauthorized();
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const { store, profile } = session;
    const result = await store.deleteProfile(profile.profileId, { keyHash: profile.keyHash, tokens: profile.tokens });
    if (result === 'ok') return json(200, { deleted: true });
    session = await signedIn(req);
    // Gone already (deleted from another computer a moment ago): this computer's token no longer works either.
    if (!session) return unauthorized();
  }
  throw new Error(`Profile kept changing during ${WRITE_ATTEMPTS} deletes`);
}
