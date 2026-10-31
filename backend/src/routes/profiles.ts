import { randomUUID } from 'node:crypto';
import { hashesEqual, newToken, parseBearer, sha256Hex } from '../lib/auth';
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

/** `POST /api/profiles`: a new anonymous profile. The token and Builder Key are returned this once, never stored. */
export async function createProfile(req: ApiRequest): Promise<Reply> {
  if (!parseCreateProfile(req.body).ok) return badRequest();
  const store = req.store();
  const createdAt = req.now.toISOString();
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const token = newToken();
    const builderKey = newBuilderKey();
    const profile: ProfileRecord = {
      profileId: randomUUID(),
      tokens: [sha256Hex(token)],
      keyHash: sha256Hex(builderKey),
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

  const store = req.store();
  const keyHash = sha256Hex(builderKey);
  const profileId = await store.getProfileIdByKey(keyHash);
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
