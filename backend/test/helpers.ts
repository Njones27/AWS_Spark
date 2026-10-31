import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { encodeDesign } from '../../src/engine/share';
import { createHandler, type Deps } from '../src/handler';
import { MemoryStore } from '../src/lib/store';

export const NOW = new Date('2026-10-30T12:00:00.000Z');

interface EventInit {
  body?: unknown;
  /** Sent as is instead of JSON.stringify(body). */
  rawBody?: string;
  headers?: Record<string, string>;
  token?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string>;
}

/** A payload format 2.0 event, as API Gateway's HTTP API sends it. */
export function event(method: string, path: string, init: EventInit = {}): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...init.headers };
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
    env: { STAGE: 'test', APP_VERSION: 'abc123' },
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
