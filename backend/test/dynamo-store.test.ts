import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
  TransactionConflictException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { createHandler } from '../src/handler';
import { sha256Hex } from '../src/lib/auth';
import { addTokenHash, DynamoStore, MAX_TOKENS, type ProfileRecord } from '../src/lib/store';
import { event } from './helpers';

// DynamoStore against a fake client: checks the requests it sends and how it reads DynamoDB's answers and errors.

type Command = GetCommand | PutCommand | UpdateCommand | TransactWriteCommand;

function fakeClient(answer: (command: Command) => unknown = () => ({})) {
  const sent: Command[] = [];
  const client = {
    send: async (command: Command) => {
      sent.push(command);
      const out = answer(command);
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, sent };
}

const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
const conditionFailed = () => new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
const writeConflict = () =>
  new TransactionConflictException({ message: 'Transaction is ongoing for the item', $metadata: {} });

const profile: ProfileRecord = {
  profileId: 'p-1',
  tokens: ['t'.repeat(64)],
  keyHash: 'k'.repeat(64),
  state: { band: 'builder', completed: ['ch1-l1'], playground: null, unlockAll: false },
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
};

describe('DynamoStore', () => {
  it('drops undefined values when marshalling', () => {
    const store = new DynamoStore('table');
    const db = (store as unknown as { db: DynamoDBDocumentClient }).db;
    expect(db.config.translateConfig?.marshallOptions?.removeUndefinedValues).toBe(true);
  });

  it('creates the profile, key and token items in one transaction, each only if new', async () => {
    const { client, sent } = fakeClient();
    expect(await new DynamoStore('table', client).createProfile(profile, 1_900_000_000)).toBe('ok');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(TransactWriteCommand);
    expect((sent[0] as TransactWriteCommand).input.TransactItems).toEqual([
      {
        Put: {
          TableName: 'table',
          ConditionExpression: 'attribute_not_exists(pk)',
          Item: {
            pk: 'PROFILE#p-1',
            sk: 'META',
            tokens: profile.tokens,
            keyHash: profile.keyHash,
            state: JSON.stringify(profile.state),
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            ttl: 1_900_000_000,
          },
        },
      },
      {
        Put: {
          TableName: 'table',
          ConditionExpression: 'attribute_not_exists(pk)',
          Item: { pk: `KEY#${profile.keyHash}`, sk: 'META', profileId: 'p-1', createdAt: profile.createdAt },
        },
      },
      {
        Put: {
          TableName: 'table',
          ConditionExpression: 'attribute_not_exists(pk)',
          Item: {
            pk: `TOKEN#${profile.tokens[0]}`,
            sk: 'META',
            profileId: 'p-1',
            createdAt: profile.createdAt,
            ttl: 1_900_000_000,
          },
        },
      },
    ]);
  });

  it('reports a taken Builder Key, and passes on any other failure', async () => {
    const taken = fakeClient(() => cancelled('None', 'ConditionalCheckFailed', 'None'));
    expect(await new DynamoStore('table', taken.client).createProfile(profile, 1)).toBe('key_taken');
    const other = fakeClient(() => cancelled('None', 'None', 'ConditionalCheckFailed'));
    await expect(new DynamoStore('table', other.client).createProfile(profile, 1)).rejects.toThrow('Transaction cancelled');
    const throttled = fakeClient(() => new Error('ThrottlingException'));
    await expect(new DynamoStore('table', throttled.client).createProfile(profile, 1)).rejects.toThrow('ThrottlingException');
  });

  it('reads profiles and lookups with strongly consistent reads', async () => {
    const item = {
      pk: 'PROFILE#p-1',
      sk: 'META',
      tokens: profile.tokens,
      keyHash: profile.keyHash,
      state: JSON.stringify(profile.state),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      ttl: 1,
    };
    const answers: Record<string, unknown> = { 'PROFILE#p-1': { Item: item }, 'TOKEN#abc': { Item: { profileId: 'p-1' } } };
    const { client, sent } = fakeClient((c) => answers[String((c as GetCommand).input.Key?.pk)] ?? {});
    const store = new DynamoStore('table', client);
    expect(await store.getProfile('p-1')).toEqual(profile);
    expect(await store.getProfile('nobody')).toBeNull();
    expect(await store.getProfileIdByToken('abc')).toBe('p-1');
    expect(await store.getProfileIdByKey('abc')).toBeNull();
    for (const c of sent) {
      expect(c).toBeInstanceOf(GetCommand);
      expect((c as GetCommand).input).toMatchObject({ TableName: 'table', ConsistentRead: true });
    }
    expect((sent[2] as GetCommand).input).toMatchObject({ Key: { pk: 'TOKEN#abc', sk: 'META' }, ProjectionExpression: 'profileId' });
    expect((sent[3] as GetCommand).input.Key).toEqual({ pk: 'KEY#abc', sk: 'META' });
  });

  it('saves state only over the state it read, and refreshes the TTL', async () => {
    const { client, sent } = fakeClient();
    const next = { ...profile.state, completed: ['ch1-l1', 'ch1-l2'] };
    const change = { expected: profile.state, next, updatedAt: 'later', ttl: 2_000_000_000 };
    expect(await new DynamoStore('table', client).putProfile('p-1', change)).toBe('ok');
    expect(sent[0]).toBeInstanceOf(UpdateCommand);
    expect((sent[0] as UpdateCommand).input).toEqual({
      TableName: 'table',
      Key: { pk: 'PROFILE#p-1', sk: 'META' },
      UpdateExpression: 'SET #state = :next, updatedAt = :updatedAt, #ttl = :ttl',
      ConditionExpression: 'attribute_exists(pk) AND #state = :expected',
      ExpressionAttributeNames: { '#state': 'state', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':next': JSON.stringify(next),
        ':expected': JSON.stringify(profile.state),
        ':updatedAt': 'later',
        ':ttl': 2_000_000_000,
      },
    });
    const raced = fakeClient(conditionFailed);
    expect(await new DynamoStore('table', raced.client).putProfile('p-1', change)).toBe('conflict');
  });

  it('adds a token in one transaction, over the list it read, keeping the others', async () => {
    const { client, sent } = fakeClient();
    const change = { expected: ['a', 'b'], tokenHash: 'c', createdAt: 'now', ttl: 3 };
    expect(await new DynamoStore('table', client).addToken('p-1', change)).toBe('ok');
    expect((sent[0] as TransactWriteCommand).input.TransactItems).toEqual([
      {
        Update: {
          TableName: 'table',
          Key: { pk: 'PROFILE#p-1', sk: 'META' },
          UpdateExpression: 'SET #tokens = :tokens, #ttl = :ttl',
          ConditionExpression: '#tokens = :expected',
          ExpressionAttributeNames: { '#tokens': 'tokens', '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':tokens': ['a', 'b', 'c'], ':expected': ['a', 'b'], ':ttl': 3 },
        },
      },
      {
        Put: {
          TableName: 'table',
          Item: { pk: 'TOKEN#c', sk: 'META', profileId: 'p-1', createdAt: 'now', ttl: 3 },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ]);
    const raced = fakeClient(() => cancelled('ConditionalCheckFailed', 'None'));
    expect(await new DynamoStore('table', raced.client).addToken('p-1', change)).toBe('conflict');
  });

  it('removes the oldest token and its lookup in the same transaction once there are 8', async () => {
    const { client, sent } = fakeClient();
    const full = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    await new DynamoStore('table', client).addToken('p-1', { expected: full, tokenHash: 't9', createdAt: 'now', ttl: 3 });
    const items = (sent[0] as TransactWriteCommand).input.TransactItems ?? [];
    expect(items).toHaveLength(3);
    expect(items[0].Update?.ExpressionAttributeValues?.[':tokens']).toEqual([...full.slice(1), 't9']);
    expect(items[2]).toEqual({ Delete: { TableName: 'table', Key: { pk: 'TOKEN#t1', sk: 'META' } } });
  });

  it('plans token lists: newest last, at most 8', () => {
    expect(MAX_TOKENS).toBe(8);
    expect(addTokenHash([], 'a')).toEqual({ tokens: ['a'], evicted: [] });
    const seven = ['1', '2', '3', '4', '5', '6', '7'];
    expect(addTokenHash(seven, '8')).toEqual({ tokens: [...seven, '8'], evicted: [] });
    expect(addTokenHash([...seven, '8'], '9')).toEqual({ tokens: [...seven.slice(1), '8', '9'], evicted: ['1'] });
  });

  it('treats a write that collided with a transaction as a conflict to retry', async () => {
    const change = { expected: profile.state, next: profile.state, updatedAt: 'later', ttl: 1 };
    expect(await new DynamoStore('table', fakeClient(writeConflict).client).putProfile('p-1', change)).toBe('conflict');

    const add = { expected: profile.tokens, tokenHash: 'new', createdAt: 'now', ttl: 1 };
    const cancelledByConflict = fakeClient(() => cancelled('TransactionConflict', 'None'));
    expect(await new DynamoStore('table', cancelledByConflict.client).addToken('p-1', add)).toBe('conflict');
    expect(await new DynamoStore('table', fakeClient(writeConflict).client).addToken('p-1', add)).toBe('conflict');

    const otherFailure = fakeClient(() => cancelled('None', 'ConditionalCheckFailed'));
    await expect(new DynamoStore('table', otherFailure.client).addToken('p-1', add)).rejects.toThrow('Transaction cancelled');
  });

  it('stores a share if its id is new or already holds the same code, keeping createdAt and ttl', async () => {
    const { client, sent } = fakeClient();
    const share = { id: 'AbCdEfGh12', code: 'code', createdAt: 'now' };
    expect(await new DynamoStore('table', client).putShare(share, 4)).toBe('ok');
    expect(sent[0]).toBeInstanceOf(UpdateCommand);
    expect((sent[0] as UpdateCommand).input).toEqual({
      TableName: 'table',
      Key: { pk: 'SHARE#AbCdEfGh12', sk: 'META' },
      UpdateExpression:
        'SET #code = :code, createdAt = if_not_exists(createdAt, :createdAt), #ttl = if_not_exists(#ttl, :ttl)',
      ConditionExpression: 'attribute_not_exists(pk) OR #code = :code',
      ExpressionAttributeNames: { '#code': 'code', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':code': 'code', ':createdAt': 'now', ':ttl': 4 },
    });
    expect(await new DynamoStore('table', fakeClient(conditionFailed).client).putShare(share, 4)).toBe('id_taken');

    const read = fakeClient(() => ({ Item: { pk: 'SHARE#AbCdEfGh12', sk: 'META', code: 'code', createdAt: 'now', ttl: 4 } }));
    expect(await new DynamoStore('table', read.client).getShare('AbCdEfGh12')).toEqual(share);
  });
});

// The whole path, handler to DynamoStore, when DynamoDB reports a conflict once: re-read, merge, retry, then 200.
describe('write conflicts through the handler', () => {
  const token = 'A'.repeat(43);
  const tokenHash = sha256Hex(token);
  const builderKey = 'MAPLE-OTTER-4821';
  const stored = { ...profile, tokens: [tokenHash], keyHash: sha256Hex(builderKey) };
  const profileItem = {
    pk: 'PROFILE#p-1',
    sk: 'META',
    tokens: stored.tokens,
    keyHash: stored.keyHash,
    state: JSON.stringify(stored.state),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    ttl: 1,
  };

  /** A table with one profile. The first write of `kind` fails with `error`; everything after succeeds. */
  function tableFailingOnce(kind: typeof UpdateCommand | typeof TransactWriteCommand, error: () => Error) {
    let failed = false;
    const fake = fakeClient((c) => {
      if (c instanceof GetCommand) {
        const pk = c.input.Key?.pk;
        if (pk === `TOKEN#${tokenHash}`) return { Item: { profileId: 'p-1' } };
        if (pk === `KEY#${stored.keyHash}`) return { Item: { profileId: 'p-1' } };
        if (pk === 'PROFILE#p-1') return { Item: profileItem };
        return {};
      }
      if (c instanceof kind && !failed) {
        failed = true;
        return error();
      }
      return {};
    });
    const handler = createHandler({ env: {}, store: new DynamoStore('table', fake.client), logError: () => {} });
    return { handler, sent: fake.sent };
  }

  it('retries a progress save after a TransactionConflictException', async () => {
    const { handler, sent } = tableFailingOnce(UpdateCommand, writeConflict);
    const body = { state: { band: 'architect', completed: ['ch2-l1'], playground: null, unlockAll: false } };
    const res = await handler(event('PUT', '/api/profiles/me', { token, body }));
    expect(res.statusCode).toBe(200);
    const merged = { band: 'architect', completed: ['ch1-l1', 'ch2-l1'], playground: null, unlockAll: false };
    expect(JSON.parse(res.body).state).toEqual(merged);
    expect(sent.filter((c) => c instanceof UpdateCommand)).toHaveLength(2);
  });

  it('retries a sign-in after a transaction cancelled by a conflict', async () => {
    const { handler, sent } = tableFailingOnce(TransactWriteCommand, () => cancelled('TransactionConflict', 'None'));
    const res = await handler(event('POST', '/api/profiles/recover', { body: { builderKey } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ profileId: 'p-1', builderKey, state: stored.state });
    expect(sent.filter((c) => c instanceof TransactWriteCommand)).toHaveLength(2);
  });
});
