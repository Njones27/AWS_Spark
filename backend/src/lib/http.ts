import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { Store } from './store';

/** Every response is JSON and never cached: some carry a token, and CloudFront must not keep any of them. */
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } as const;

export interface Reply extends APIGatewayProxyStructuredResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const json = (statusCode: number, body: unknown): Reply => ({
  statusCode,
  headers: { ...HEADERS },
  body: JSON.stringify(body),
});

export type ErrorCode = 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'payload_too_large' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  payload_too_large: 413,
  internal: 500,
};

/**
 * What a student may see. Short, friendly, and never blaming them: when something fails, it's Spark's job to recover.
 * Each line has to make sense quoted on its own.
 */
export const MESSAGES = {
  badRequest: "Spark couldn't read that. Please try again.",
  badKey: 'A Builder Key is two words and four numbers, like MAPLE-OTTER-4821.',
  badDesign: "Spark couldn't open that design. Try sharing it again.",
  unauthorized: 'This computer needs to reconnect to Spark. Your progress here is safe.',
  forbidden: 'Please open Spark from its website.',
  notFound: "Spark couldn't find that.",
  keyNotFound: "That Builder Key didn't match. Check the letters and numbers and try again.",
  shareNotFound: "Spark couldn't find that design. The link may be too old.",
  tooLarge: "That's more than Spark can save at once.",
  designTooLarge: 'That design is too big for a short link. The long link still works.',
  internal: 'Something went wrong on our side. Please try again soon.',
} as const;

export const fail = (code: ErrorCode, message: string): Reply =>
  json(STATUS[code], { error: code, message });

/** Lambda environment (docs/aws/CONTRACT.md). */
export interface Env {
  TABLE_NAME?: string;
  STAGE?: string;
  APP_VERSION?: string;
  ORIGIN_VERIFY_SECRET?: string;
}

/** What a route gets: the parsed JSON body (undefined when there was none), lower-cased headers, and its tools. */
export interface ApiRequest {
  body: unknown;
  headers: Readonly<Record<string, string>>;
  params: Readonly<Record<string, string | undefined>>;
  now: Date;
  env: Env;
  /** The table, built on first use, so `/api/health` works without one. */
  store: () => Store;
}
