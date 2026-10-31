import { useEffect, useRef, useState } from 'react';
import { createShare } from '../../api/shares';
import { encodeDesign } from '../../engine/share';
import { href } from '../../router';
import type { SavedDiagram } from '../../store';

/** This page's address without the route, on whatever site Spark is hosted. */
const siteUrl = () => `${window.location.origin}${window.location.pathname}`;

// Short ids already made this visit, by share code, so opening Share again for the same design reuses its link.
const shortIds = new Map<string, Promise<string>>();
function shortIdFor(code: string): Promise<string> {
  let id = shortIds.get(code);
  if (!id) {
    id = createShare(code);
    shortIds.set(code, id);
    // A failed try is forgotten, so the next Share tries again.
    id.catch(() => shortIds.delete(code));
  }
  return id;
}

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
}

/**
 * "Send this to your team". Shows a short link from Spark's API when it answers, and the long link (which carries the
 * whole design) while waiting or when the API can't be reached.
 */
export function ShareDialog({ design, onClose }: { design: SavedDiagram; onClose: () => void }) {
  const [code] = useState(() => encodeDesign(design));
  const [shortId, setShortId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEscape(onClose);
  useEffect(() => {
    let live = true;
    shortIdFor(code).then(
      (id) => {
        if (!live) return;
        setShortId(id);
        setStatus('');
      },
      () => undefined, // The long link keeps working.
    );
    return () => {
      live = false;
    };
  }, [code]);
  // The long link carries the whole design, so it works with no server at all.
  const link = `${siteUrl()}${shortId ? href.share(shortId) : `${href.playground}?d=${code}`}`;

  const copy = () =>
    navigator.clipboard
      .writeText(link)
      .then(() => setStatus('Copied! Paste it into an email or your class page.'))
      .catch(() => {
        box.current?.select();
        setStatus('Press Ctrl+C (or ⌘C) to copy the selected link.');
      });

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-scroll">
          <p className="eyebrow">Share your design</p>
          <h2 id="share-title">Send this to your team</h2>
          <p className="muted">
            Anyone with the link gets their own copy of this map, your notes, and your plan. Their changes don’t change
            yours.
          </p>
          <textarea
            id="share-link"
            ref={box}
            className="share-link"
            readOnly
            rows={3}
            value={link}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="share-warn">Keep names and personal details out of your notes, since anyone with the link can read them.</p>
        </div>
        <div className="share-actions">
          <p className="muted small" aria-live="polite">
            {status}
          </p>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={copy}>
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where a teammate's link stands: `loading` while a short link is looked up, `ready` to open, `broken` when the
 * design in it can't be read, `missing` when Spark has no design for a short link, `offline` when Spark's API can't
 * be reached.
 */
export type SharedState = 'loading' | 'ready' | 'broken' | 'missing' | 'offline';

const SHARED_PROBLEM: Record<'broken' | 'missing' | 'offline', { title: string; text: string }> = {
  broken: { title: 'That link didn’t work', text: 'Part of it may be missing. Ask your teammate to copy the whole link again.' },
  missing: { title: 'That link didn’t work', text: 'Spark couldn’t find this design. Ask your teammate to share it again.' },
  offline: { title: 'That link can’t open right now', text: 'Spark can’t reach the internet at the moment. Try the link again soon.' },
};

/** Asks before a teammate's link replaces the map that's already here. */
export function OpenShared({ state, onOpen, onClose }: { state: SharedState; onOpen: () => void; onClose: () => void }) {
  useEscape(onClose);
  const problem = state === 'broken' || state === 'missing' || state === 'offline' ? SHARED_PROBLEM[state] : null;
  return (
    <div className="modal-backdrop">
      <div className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="open-title">
        <div className="modal-scroll">
          <p className="eyebrow">Shared design</p>
          {state === 'loading' ? (
            <>
              <h2 id="open-title">Getting your teammate’s design…</h2>
              <p className="muted" aria-live="polite">
                This takes a moment.
              </p>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={onClose}>
                  Keep my map
                </button>
              </div>
            </>
          ) : !problem ? (
            <>
              <h2 id="open-title">Open your teammate’s design?</h2>
              <p className="muted">It replaces the map you have here. If you want to keep yours, share it first.</p>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={onClose}>
                  Keep my map
                </button>
                <button className="btn btn-primary" onClick={onOpen} autoFocus>
                  Open their design
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="open-title">{problem.title}</h2>
              <p className="muted">{problem.text}</p>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={onClose} autoFocus>
                  OK
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
