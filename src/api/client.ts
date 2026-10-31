import { useApp } from '../store';

// Spark's API lives on the same site as the app, under /api (see docs/aws/CONTRACT.md), so there is no CORS.
const BASE = '/api';
const TIMEOUT_MS = 5000;

/** An API call that didn't succeed. `status` is 0 when there was no answer at all (no network, or a timeout). */
export class ApiError extends Error {
  readonly status: number;
  /** The server's error code (`not_found`, `unauthorized`, …), or `offline`, `timeout`, `throttled`, `unavailable`. */
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /**
   * True when trying again later may work: no network, a timeout, throttling (429), a server error, or an answer that
   * didn't come from Spark's API (for example a static host with no backend). Callers treat this as "offline for now".
   */
  get offline(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500 || this.code === 'unavailable';
  }
}

export interface ApiInit extends Omit<RequestInit, 'body' | 'signal'> {
  /** Sent as JSON. */
  body?: unknown;
  /** The bearer token. Defaults to the one saved on this device; pass null to send none. */
  token?: string | null;
  /** For tests. Defaults to the browser's fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const isErrorBody = (v: unknown): v is { error: string; message?: string } =>
  !!v && typeof v === 'object' && typeof (v as { error?: unknown }).error === 'string';

/** Calls Spark's API with JSON in and out. Every failure becomes an ApiError. */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const {
    body,
    token = useApp.getState().profile.token,
    fetch: doFetch = globalThis.fetch,
    timeoutMs = TIMEOUT_MS,
    headers,
    ...rest
  } = init;
  const h = new Headers(headers);
  // Asking for JSON also keeps the Vite dev server from answering with index.html when there is no API.
  h.set('accept', 'application/json');
  if (body !== undefined) h.set('content-type', 'application/json');
  if (token) h.set('authorization', `Bearer ${token}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await doFetch(BASE + path, {
      ...rest,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    text = await res.text();
  } catch {
    throw new ApiError(0, ctrl.signal.aborted ? 'timeout' : 'offline');
  } finally {
    clearTimeout(timer);
  }

  let data: unknown;
  let json = true;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      json = false;
    }
  }
  if (res.ok) {
    if (!json) throw new ApiError(res.status, 'unavailable');
    return data as T;
  }
  if (isErrorBody(data)) throw new ApiError(res.status, data.error, data.message);
  throw new ApiError(res.status, res.status === 429 ? 'throttled' : 'unavailable');
}
