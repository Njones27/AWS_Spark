import { SHARE_ID, shareIdFor } from '../lib/codes';
import { fail, json, MESSAGES, type ApiRequest, type Reply } from '../lib/http';
import { ttlFrom, WRITE_ATTEMPTS } from '../lib/store';
import { cleanDesign, parseShare } from '../lib/validate';

/**
 * `POST /api/shares`: keeps a Playground design's share code behind a short id made from the code. The code is
 * cleaned first (see cleanDesign), so only the design itself is stored. Sharing the same design again answers with
 * the same id and changes nothing.
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

/** `GET /api/shares/{id}`. An id that can't exist, or a stored code that is no longer a design, is simply not found. */
export async function getShare(req: ApiRequest): Promise<Reply> {
  const id = req.params.id ?? '';
  const share = SHARE_ID.test(id) ? await req.store().getShare(id) : null;
  // Cleaned again on the way out, so a share saved before codes were cleaned can't hand out anything but a design.
  const code = share ? cleanDesign(share.code) : null;
  return share && code?.ok ? json(200, { id: share.id, code: code.value }) : fail('not_found', MESSAGES.shareNotFound);
}
