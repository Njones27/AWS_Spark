import { SHARE_ID, shareIdFor } from '../lib/codes';
import { fail, json, MESSAGES, type ApiRequest, type Reply } from '../lib/http';
import { ttlFrom, WRITE_ATTEMPTS } from '../lib/store';
import { parseShare } from '../lib/validate';

/**
 * `POST /api/shares`: keeps a Playground design's share code, unchanged, behind a short id made from the code.
 * Sharing the same design again answers with the same id and changes nothing.
 */
export async function createShare(req: ApiRequest): Promise<Reply> {
  const parsed = parseShare(req.body);
  if (!parsed.ok) {
    if (parsed.error === 'too_large') return fail('payload_too_large', MESSAGES.designTooLarge);
    return fail('bad_request', parsed.error === 'bad_design' ? MESSAGES.badDesign : MESSAGES.badRequest);
  }
  const store = req.store();
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const id = shareIdFor(parsed.value, attempt);
    const saved = await store.putShare({ id, code: parsed.value, createdAt: req.now.toISOString() }, ttlFrom(req.now));
    if (saved === 'ok') return json(201, { id });
  }
  throw new Error(`Share id still taken by other codes after ${WRITE_ATTEMPTS} tries`);
}

/** `GET /api/shares/{id}`. An id that can't exist is simply not found. */
export async function getShare(req: ApiRequest): Promise<Reply> {
  const id = req.params.id ?? '';
  const share = SHARE_ID.test(id) ? await req.store().getShare(id) : null;
  return share ? json(200, { id: share.id, code: share.code }) : fail('not_found', MESSAGES.shareNotFound);
}
