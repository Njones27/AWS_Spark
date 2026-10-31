import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ProgressState } from './validate';

// Single-table layout from docs/aws/CONTRACT.md: partition key `pk`, sort key `sk` (always META), TTL attribute `ttl`.
// PROFILE#, KEY# and SHARE# items, plus TOKEN#<tokenHash> → profileId so a bearer token finds its profile without a
// scan or an index. A profile can have several tokens, one per computer, listed on the PROFILE# item (`tokens`, oldest
// first, at most MAX_TOKENS). That list is what counts: a TOKEN# item only works while its hash is in the list, so an
// evicted token stops working even if its lookup item lingers.

const TWO_YEARS_S = 2 * 365 * 24 * 60 * 60;

/** The `ttl` attribute (epoch seconds): two years from now. Profiles push it back on every write. */
export const ttlFrom = (now: Date): number => Math.floor(now.getTime() / 1000) + TWO_YEARS_S;

/** How many times a write is tried when it lost a race, or a random key or id turned out to be taken. */
export const WRITE_ATTEMPTS = 3;

/** Computers that can be signed in to one profile at once. A ninth sign-in signs out the oldest. */
export const MAX_TOKENS = 8;

/** The token list after adding `tokenHash` at the end, and the oldest hashes that drop off to make room. */
export function addTokenHash(tokens: readonly string[], tokenHash: string): { tokens: string[]; evicted: string[] } {
  const all = [...tokens, tokenHash];
  const cut = Math.max(0, all.length - MAX_TOKENS);
  return { tokens: all.slice(cut), evicted: all.slice(0, cut) };
}

export interface ProfileRecord {
  profileId: string;
  /** SHA-256 hex of each token that works, oldest first. */
  tokens: string[];
  keyHash: string;
  state: ProgressState;
  createdAt: string;
  updatedAt: string;
}

export interface ShareRecord {
  id: string;
  code: string;
  createdAt: string;
}

/** A state save: `next` replaces `expected`, the state the caller read. */
export interface StateChange {
  expected: ProgressState;
  next: ProgressState;
  updatedAt: string;
  ttl: number;
}

/** A new token for a profile: `tokenHash` joins `expected`, the token list the caller read. */
export interface TokenChange {
  expected: string[];
  tokenHash: string;
  createdAt: string;
  /** For the profile, which is pushed back, and for the new TOKEN# item, which keeps it. */
  ttl: number;
}

export interface Store {
  /** Writes the profile with its Builder Key and first token lookup, all or nothing. `key_taken`: pick another key. */
  createProfile(profile: ProfileRecord, ttl: number): Promise<'ok' | 'key_taken'>;
  getProfile(profileId: string): Promise<ProfileRecord | null>;
  /**
   * Saves `change.next` only if the stored state still equals `change.expected`, so two computers saving at
   * once can't drop each other's finished levels. `conflict`: read again, merge again, retry.
   */
  putProfile(profileId: string, change: StateChange): Promise<'ok' | 'conflict'>;
  getProfileIdByKey(keyHash: string): Promise<string | null>;
  getProfileIdByToken(tokenHash: string): Promise<string | null>;
  /**
   * Adds a token, if the list is still `change.expected`. The others keep working, except that the oldest is removed
   * (with its TOKEN# item) once there would be more than MAX_TOKENS. `conflict`: read again, retry.
   */
  addToken(profileId: string, change: TokenChange): Promise<'ok' | 'conflict'>;
  getShare(id: string): Promise<ShareRecord | null>;
  /**
   * Stores a share. `ok` also when the id already holds this same code (a replay): nothing changes, not even
   * `createdAt` or `ttl`. `id_taken`: a different code has this id.
   */
  putShare(share: ShareRecord, ttl: number): Promise<'ok' | 'id_taken'>;
}

const META = 'META';
const PROFILE = 'PROFILE#';
const SHARE = 'SHARE#';
export const keys = {
  profile: (profileId: string) => ({ pk: PROFILE + profileId, sk: META }),
  key: (keyHash: string) => ({ pk: `KEY#${keyHash}`, sk: META }),
  token: (tokenHash: string) => ({ pk: `TOKEN#${tokenHash}`, sk: META }),
  share: (id: string) => ({ pk: SHARE + id, sk: META }),
};

/** An item as DynamoDB holds it. */
export type Item = Record<string, unknown> & { pk: string; sk: string };

// Both stores build and read items with the same functions, so the test store holds exactly what DynamoDB would.
const profileItem = (p: ProfileRecord, ttl: number): Item => ({
  ...keys.profile(p.profileId),
  tokens: [...p.tokens],
  keyHash: p.keyHash,
  state: JSON.stringify(p.state),
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  ttl,
});
const keyItem = (keyHash: string, profileId: string, createdAt: string): Item => ({
  ...keys.key(keyHash),
  profileId,
  createdAt,
});
/** Its TTL is set once and never pushed back: a computer unused for two years signs in again with its Builder Key. */
const tokenItem = (tokenHash: string, profileId: string, createdAt: string, ttl: number): Item => ({
  ...keys.token(tokenHash),
  profileId,
  createdAt,
  ttl,
});
const shareItem = (s: ShareRecord, ttl: number): Item => ({
  ...keys.share(s.id),
  code: s.code,
  createdAt: s.createdAt,
  ttl,
});

const toProfile = (item: Record<string, unknown>): ProfileRecord => ({
  profileId: String(item.pk).slice(PROFILE.length),
  tokens: Array.isArray(item.tokens) ? item.tokens.map(String) : [],
  keyHash: String(item.keyHash),
  state: JSON.parse(String(item.state)) as ProgressState,
  createdAt: String(item.createdAt),
  updatedAt: String(item.updatedAt),
});
const toShare = (item: Record<string, unknown>): ShareRecord => ({
  id: String(item.pk).slice(SHARE.length),
  code: String(item.code),
  createdAt: String(item.createdAt),
});
const profileIdOf = (item: Record<string, unknown> | undefined): string | null =>
  typeof item?.profileId === 'string' ? item.profileId : null;

const NOT_EXISTS = 'attribute_not_exists(pk)';

const named = (err: unknown, name: string) => err instanceof Error && err.name === name;

/** A cancelled transaction's reason code for each of its items, or null for any other error. */
function cancellationCodes(err: unknown): (string | undefined)[] | null {
  if (!named(err, 'TransactionCanceledException')) return null;
  const reasons = (err as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return reasons.map((r) => r.Code);
}

/** True when a cancelled transaction failed only the condition on item `index`. */
function onlyConditionFailed(err: unknown, index: number): boolean {
  const failed = (cancellationCodes(err) ?? []).flatMap((code, i) => (code === 'ConditionalCheckFailed' ? [i] : []));
  return failed.length === 1 && failed[0] === index;
}

/** Another write, or a transaction, touched the same item at the same moment. Reading again and retrying is safe. */
const isWriteConflict = (err: unknown): boolean =>
  named(err, 'TransactionConflictException') || (cancellationCodes(err)?.includes('TransactionConflict') ?? false);

const isConditionFailed = (err: unknown) => named(err, 'ConditionalCheckFailedException');

export class DynamoStore implements Store {
  private readonly db: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client?: DynamoDBDocumentClient,
  ) {
    const marshallOptions = { removeUndefinedValues: true };
    this.db = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions });
  }

  private async get(key: { pk: string; sk: string }, projection?: string) {
    const res = await this.db.send(
      new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true, ProjectionExpression: projection }),
    );
    return res.Item;
  }

  async createProfile(profile: ProfileRecord, ttl: number): Promise<'ok' | 'key_taken'> {
    const put = (Item: Item) => ({ Put: { TableName: this.tableName, Item, ConditionExpression: NOT_EXISTS } });
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            put(profileItem(profile, ttl)),
            put(keyItem(profile.keyHash, profile.profileId, profile.createdAt)),
            ...profile.tokens.map((hash) => put(tokenItem(hash, profile.profileId, profile.createdAt, ttl))),
          ],
        }),
      );
      return 'ok';
    } catch (err) {
      if (onlyConditionFailed(err, 1)) return 'key_taken';
      throw err;
    }
  }

  async getProfile(profileId: string): Promise<ProfileRecord | null> {
    const item = await this.get(keys.profile(profileId));
    return item ? toProfile(item) : null;
  }

  async putProfile(profileId: string, { expected, next, updatedAt, ttl }: StateChange) {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys.profile(profileId),
          UpdateExpression: 'SET #state = :next, updatedAt = :updatedAt, #ttl = :ttl',
          ConditionExpression: 'attribute_exists(pk) AND #state = :expected',
          ExpressionAttributeNames: { '#state': 'state', '#ttl': 'ttl' },
          ExpressionAttributeValues: {
            ':next': JSON.stringify(next),
            ':expected': JSON.stringify(expected),
            ':updatedAt': updatedAt,
            ':ttl': ttl,
          },
        }),
      );
      return 'ok' as const;
    } catch (err) {
      if (isConditionFailed(err) || isWriteConflict(err)) return 'conflict' as const;
      throw err;
    }
  }

  async getProfileIdByKey(keyHash: string): Promise<string | null> {
    return profileIdOf(await this.get(keys.key(keyHash), 'profileId'));
  }

  async getProfileIdByToken(tokenHash: string): Promise<string | null> {
    return profileIdOf(await this.get(keys.token(tokenHash), 'profileId'));
  }

  async addToken(profileId: string, { expected, tokenHash, createdAt, ttl }: TokenChange) {
    const { tokens, evicted } = addTokenHash(expected, tokenHash);
    try {
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.tableName,
                Key: keys.profile(profileId),
                UpdateExpression: 'SET #tokens = :tokens, #ttl = :ttl',
                ConditionExpression: '#tokens = :expected',
                ExpressionAttributeNames: { '#tokens': 'tokens', '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':tokens': tokens, ':expected': expected, ':ttl': ttl },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: tokenItem(tokenHash, profileId, createdAt, ttl),
                ConditionExpression: NOT_EXISTS,
              },
            },
            ...evicted.map((hash) => ({ Delete: { TableName: this.tableName, Key: keys.token(hash) } })),
          ],
        }),
      );
      return 'ok' as const;
    } catch (err) {
      if (onlyConditionFailed(err, 0) || isWriteConflict(err)) return 'conflict' as const;
      throw err;
    }
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    const item = await this.get(keys.share(id));
    return item ? toShare(item) : null;
  }

  async putShare(share: ShareRecord, ttl: number): Promise<'ok' | 'id_taken'> {
    try {
      // New id: creates the item. Same code again: rewrites the same code and keeps createdAt and ttl.
      await this.db.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: keys.share(share.id),
          UpdateExpression:
            'SET #code = :code, createdAt = if_not_exists(createdAt, :createdAt), #ttl = if_not_exists(#ttl, :ttl)',
          ConditionExpression: 'attribute_not_exists(pk) OR #code = :code',
          ExpressionAttributeNames: { '#code': 'code', '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':code': share.code, ':createdAt': share.createdAt, ':ttl': ttl },
        }),
      );
      return 'ok';
    } catch (err) {
      if (isConditionFailed(err)) return 'id_taken';
      throw err;
    }
  }
}

/** The same behaviour in memory, for tests. `items` holds what DynamoDB would, keyed by `pk`. */
export class MemoryStore implements Store {
  readonly items = new Map<string, Item>();

  private read(key: { pk: string }): Item | undefined {
    const item = this.items.get(key.pk);
    return item && structuredClone(item);
  }
  private write(item: Item): void {
    this.items.set(item.pk, structuredClone(item));
  }

  async createProfile(profile: ProfileRecord, ttl: number) {
    const all = [
      profileItem(profile, ttl),
      keyItem(profile.keyHash, profile.profileId, profile.createdAt),
      ...profile.tokens.map((hash) => tokenItem(hash, profile.profileId, profile.createdAt, ttl)),
    ];
    const taken = all.map((item) => this.items.has(item.pk));
    if (taken[1] && taken.filter(Boolean).length === 1) return 'key_taken' as const;
    if (taken.some(Boolean)) throw new Error('TransactionCanceledException');
    all.forEach((item) => this.write(item));
    return 'ok' as const;
  }

  async getProfile(profileId: string) {
    const item = this.read(keys.profile(profileId));
    return item ? toProfile(item) : null;
  }

  async putProfile(profileId: string, { expected, next, updatedAt, ttl }: StateChange) {
    const item = this.read(keys.profile(profileId));
    if (!item || item.state !== JSON.stringify(expected)) return 'conflict' as const;
    this.write({ ...item, state: JSON.stringify(next), updatedAt, ttl });
    return 'ok' as const;
  }

  async getProfileIdByKey(keyHash: string) {
    return profileIdOf(this.read(keys.key(keyHash)));
  }

  async getProfileIdByToken(tokenHash: string) {
    return profileIdOf(this.read(keys.token(tokenHash)));
  }

  async addToken(profileId: string, { expected, tokenHash, createdAt, ttl }: TokenChange) {
    const item = this.read(keys.profile(profileId));
    if (!item || JSON.stringify(item.tokens) !== JSON.stringify(expected)) return 'conflict' as const;
    if (this.items.has(keys.token(tokenHash).pk)) throw new Error('TransactionCanceledException');
    const { tokens, evicted } = addTokenHash(expected, tokenHash);
    this.write({ ...item, tokens, ttl });
    this.write(tokenItem(tokenHash, profileId, createdAt, ttl));
    evicted.forEach((hash) => this.items.delete(keys.token(hash).pk));
    return 'ok' as const;
  }

  async getShare(id: string) {
    const item = this.read(keys.share(id));
    return item ? toShare(item) : null;
  }

  async putShare(share: ShareRecord, ttl: number) {
    const existing = this.read(keys.share(share.id));
    if (existing) return existing.code === share.code ? ('ok' as const) : ('id_taken' as const);
    this.write(shareItem(share, ttl));
    return 'ok' as const;
  }
}
