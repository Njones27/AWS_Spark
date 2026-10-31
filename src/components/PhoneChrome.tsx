import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { setLayoutChoice } from '../device';

/** The phone top bar's "⋯" menu: the buttons a laptop shows in the top bar, plus a way back to the laptop layout. */
export function PhoneMenu({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  // Picking an item closes the menu; opening a submenu (the level switch) keeps it open.
  const pick = (e: MouseEvent) => {
    if ((e.target as Element).closest('a, button:not([aria-haspopup])')) setOpen(false);
  };
  return (
    <div className="phone-menu" ref={ref}>
      <button className="btn btn-ghost btn-icon" aria-label="More" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="phone-menu-list" onClick={pick}>
          {children}
          <button className="btn btn-ghost phone-menu-layout" onClick={() => setLayoutChoice('laptop')}>
            <span aria-hidden="true">💻</span> Use the laptop layout
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A panel that slides up from the bottom of the map. `hidden` hides it without unmounting, so a piece being dragged out
 * of it keeps its pointer.
 */
export function Sheet({
  title,
  hint,
  hidden,
  onClose,
  children,
}: {
  title: string;
  hint?: ReactNode;
  hidden?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`sheet-backdrop ${hidden ? 'is-hidden' : ''}`} onClick={onClose} aria-hidden="true" />
      <section
        className={`sheet ${hidden ? 'is-hidden' : ''}`}
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        {/* A close button rather than a drag handle: swiping down on a phone page pulls to refresh. */}
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon sheet-close" aria-label={`Close ${title}`} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
          {hint && <p>{hint}</p>}
        </header>
        {children}
      </section>
    </>
  );
}

const TURN_TIP = 'spark-turn-tip';

/** Level maps run left to right, so an upright phone shows them small. Suggest turning sideways, once. */
export function TurnTip() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(TURN_TIP) === 'seen';
    } catch {
      return false;
    }
  });
  if (seen) return null;
  const dismiss = () => {
    setSeen(true);
    try {
      localStorage.setItem(TURN_TIP, 'seen');
    } catch {
      // Not saved; it comes back next visit.
    }
  };
  return (
    <div className="turn-tip" role="note">
      <span aria-hidden="true">📱</span>
      <span>Turn your phone sideways for a bigger map.</span>
      <button className="btn btn-ghost btn-sm" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
