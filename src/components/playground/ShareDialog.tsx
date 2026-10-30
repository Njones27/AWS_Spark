import { useEffect, useRef, useState } from 'react';
import { encodeDesign } from '../../engine/share';
import type { SavedDiagram } from '../../store';

/** The link that opens this design, on whatever site Spark is hosted. */
export function shareLink(d: SavedDiagram): string {
  return `${window.location.origin}${window.location.pathname}#/playground?d=${encodeDesign(d)}`;
}

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
}

/** "Send this to your team": a link that carries the whole design. */
export function ShareDialog({ design, onClose }: { design: SavedDiagram; onClose: () => void }) {
  const [link] = useState(() => shareLink(design));
  const [status, setStatus] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEscape(onClose);

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
        <p className="eyebrow">Share your design</p>
        <h2 id="share-title">Send this to your team</h2>
        <p className="muted">
          Anyone with the link gets their own copy of this map, your notes, and your plan. Their changes don’t change
          yours. Nothing is saved on a server.
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
        <p className="share-warn">Keep names and personal details out of your notes, since the link carries them.</p>
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

/** Asks before a teammate's link replaces the map that's already here. */
export function OpenShared({ ok, onOpen, onClose }: { ok: boolean; onOpen: () => void; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="modal-backdrop">
      <div className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="open-title">
        <p className="eyebrow">Shared design</p>
        {ok ? (
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
            <h2 id="open-title">That link didn’t work</h2>
            <p className="muted">Part of it may be missing. Ask your teammate to copy the whole link again.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose} autoFocus>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
