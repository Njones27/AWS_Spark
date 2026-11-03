import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { encodeDesign } from '../../src/engine/share';
import { createHandler, type Deps } from '../src/handler';
import { MemoryStore } from '../src/lib/store';

export const NOW = new Date('2026-10-30T12:00:00.000Z');

/** What CloudFront sends as `x-origin-verify` in tests, and the Lambda's matching env value. */
export const ORIGIN_SECRET = 'test-origin-secret-0123456789abcdef0123456789';
/** The Builder Key pepper in tests. */
export const PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef';
/** The env a deployed stage has. */
export const TEST_ENV = { STAGE: 'test', APP_VERSION: 'abc123', ORIGIN_VERIFY_SECRET: ORIGIN_SECRET, BUILDER_KEY_PEPPER: PEPPER };

interface EventInit {
  body?: unknown;
  /** Sent as is instead of JSON.stringify(body). */
  rawBody?: string;
  headers?: Record<string, string>;
  token?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string>;
  /** The `x-origin-verify` header CloudFront adds. Defaults to ORIGIN_SECRET; null sends none. */
  origin?: string | null;
}

/** A payload format 2.0 event, as API Gateway's HTTP API sends it. */
export function event(method: string, path: string, init: EventInit = {}): APIGatewayProxyEventV2 {
  const origin = init.origin === undefined ? ORIGIN_SECRET : init.origin;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(origin === null ? {} : { 'x-origin-verify': origin }),
    ...init.headers,
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers,
    body,
    isBase64Encoded: init.isBase64Encoded ?? false,
    pathParameters: init.pathParameters,
    requestContext: {
      accountId: '000000000000',
      apiId: 'test',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.1', userAgent: 'vitest' },
      requestId: 'req-1',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '30/Oct/2026:12:00:00 +0000',
      timeEpoch: NOW.getTime(),
    },
  };
}

/** A handler on a fresh MemoryStore, with a clock the test can move. */
export function setup(deps: Omit<Deps, 'store'> & { store?: MemoryStore } = {}) {
  const store = deps.store ?? new MemoryStore();
  const clock = { now: NOW };
  const errors: { message: string; detail: Record<string, unknown> }[] = [];
  const handler = createHandler({
    env: TEST_ENV,
    now: () => clock.now,
    logError: (message, detail) => errors.push({ message, detail }),
    store,
    ...deps,
  });
  const call = async (method: string, path: string, init?: EventInit) => {
    const res = await handler(event(method, path, init));
    return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body) as Record<string, unknown> };
  };
  return { handler, call, store, clock, errors };
}

/** A real share code: people visit CloudFront, which reads from S3. */
export const designCode = (title = 'Bakery website'): string =>
  encodeDesign({
    nodes: [
      { id: 'a', service: 'users', pos: { x: 0, y: 0 }, source: { demand: 50 } },
      { id: 'b', service: 'cloudfront', pos: { x: 200, y: 0 } },
      { id: 'c', service: 's3', pos: { x: 400, y: 0 } },
    ],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
    plan: { title, uses: {} },
  });
