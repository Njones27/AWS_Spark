import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { secretsEqual } from './lib/auth';
import { fail, MESSAGES, type ApiRequest, type Env, type Reply } from './lib/http';
import { DynamoStore, type Store } from './lib/store';
import { health } from './routes/health';
import { createProfile, getMe, putMe, recover } from './routes/profiles';
import { createShare, getShare } from './routes/shares';

// One Lambda behind API Gateway (HTTP API, payload 2.0) behind CloudFront `/api/*`. Routes: docs/aws/CONTRACT.md.

export const MAX_BODY_BYTES = 64 * 1024;

interface Route {
  method: string;
  path: RegExp;
  run: (req: ApiRequest) => Reply | Promise<Reply>;
}

const ROUTES: readonly Route[] = [
  { method: 'GET', path: /^\/api\/health$/, run: health },
  { method: 'POST', path: /^\/api\/profiles$/, run: createProfile },
  { method: 'GET', path: /^\/api\/profiles\/me$/, run: getMe },
  { method: 'PUT', path: /^\/api\/profiles\/me$/, run: putMe },
  { method: 'POST', path: /^\/api\/profiles\/recover$/, run: recover },
  { method: 'POST', path: /^\/api\/shares$/, run: createShare },
  { method: 'GET', path: /^\/api\/shares\/(?<id>[^/]+)$/, run: getShare },
];

export interface Deps {
  /** Defaults to `process.env`. */
  env?: Env;
  /** Defaults to a DynamoStore on `TABLE_NAME`, built on first use and kept for the container's life. */
  store?: Store;
  now?: () => Date;
  /** Where unexpected errors go. Defaults to one JSON line on stderr (CloudWatch Logs). */
  logError?: (message: string, detail: Record<string, unknown>) => void;
}

export type Handler = (event: APIGatewayProxyEventV2) => Promise<Reply>;

const defaultLogError: NonNullable<Deps['logError']> = (message, detail) =>
  // Lambda's JSON log format nests this object under the record, so the Ops metric filter can match on level.
  console.error({ level: 'error', message, ...detail });

/** Payload 2.0 already lower-cases header names; this keeps tests and other callers honest. */
const lowerCaseKeys = (headers: APIGatewayProxyEventV2['headers'] | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, value]) => [name.toLowerCase(), value]),
  );

/** The request body as text, `null` when it is over the size cap, or undefined when there is none. */
function bodyText(event: APIGatewayProxyEventV2): string | null | undefined {
  const raw = event.body;
  if (raw === undefined || raw === null || raw === '') return undefined;
  // Cheap first check on the encoded length, so a huge body is never decoded.
  if (raw.length > (event.isBase64Encoded ? Math.ceil((MAX_BODY_BYTES * 4) / 3) + 4 : MAX_BODY_BYTES)) return null;
  const bytes = Buffer.from(raw, event.isBase64Encoded ? 'base64' : 'utf8');
  return bytes.length > MAX_BODY_BYTES ? null : bytes.toString('utf8');
}

export function createHandler(deps: Deps = {}): Handler {
  const env: Env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const logError = deps.logError ?? defaultLogError;
  let store = deps.store;
  const getStore = (): Store => {
    if (!store) {
      if (!env.TABLE_NAME) throw new Error('TABLE_NAME is not set');
      store = new DynamoStore(env.TABLE_NAME);
    }
    return store;
  };

  return async (event) => {
    const method = event.requestContext?.http?.method?.toUpperCase() ?? '';
    const path = event.rawPath ?? '';
    try {
      const headers = lowerCaseKeys(event.headers);
      const secret = env.ORIGIN_VERIFY_SECRET ?? '';
      if (secret && !secretsEqual(headers['x-origin-verify'] ?? '', secret)) {
        return fail('forbidden', MESSAGES.forbidden);
      }

      const text = bodyText(event);
      if (text === null) return fail('payload_too_large', MESSAGES.tooLarge);
      let body: unknown;
      if (text !== undefined && text.trim() !== '') {
        try {
          body = JSON.parse(text);
        } catch {
          return fail('bad_request', MESSAGES.badRequest);
        }
      }

      for (const route of ROUTES) {
        const match = route.method === method ? route.path.exec(path) : null;
        if (!match) continue;
        const params = { ...match.groups, ...event.pathParameters };
        return await route.run({ body, headers, params, now: now(), env, store: getStore });
      }
      return fail('not_found', MESSAGES.notFound);
    } catch (err) {
      // Details stay in the log. The student only ever sees the friendly message.
      logError('Unhandled error', {
        route: `${method} ${path}`,
        requestId: event.requestContext?.requestId,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      return fail('internal', MESSAGES.internal);
    }
  };
}

export const handler: APIGatewayProxyHandlerV2 = createHandler();
