import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { setLayoutChoice } from '../device';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { useDismiss } from './useDismiss';

/** The phone top bar's "⋯" menu: the buttons a laptop shows in the top bar, plus a way back to the laptop layout. */
export function PhoneMenu({ children }: { children?: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  // Picking an item closes the menu; opening a submenu (the level switch) keeps it open.
  const pick = (e: MouseEvent) => {
    if ((e.target as Element).closest('a, button:not([aria-haspopup])')) setOpen(false);
  };
  return (
    <div className="phone-menu" ref={ref}>
      <button className="btn btn-ghost btn-icon" aria-label={t('chrome.more')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="phone-menu-list" onClick={pick}>
          {children}
          <button className="btn btn-ghost phone-menu-layout" onClick={() => setLayoutChoice('laptop')}>
            <Icon name="laptop" /> {t('chrome.laptopLayout')}
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
  const t = useT();
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
          {/* Focus starts here, so Escape and screen readers land in the sheet. */}
          <button
            className="btn btn-ghost btn-icon sheet-close"
            aria-label={t('chrome.close', { name: title })}
            onClick={onClose}
            autoFocus
          >
            <Icon name="close" />
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
  const t = useT();
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
      <Icon name="phone" />
      <span>{t('chrome.turnTip')}</span>
      <button className="btn btn-ghost btn-sm" onClick={dismiss}>
        {t('chrome.gotIt')}
      </button>
    </div>
  );
}
