import { useEffect, useMemo, useRef, useState } from 'react';
import { daysAgo, loadSeen, recentUpdates, saveSeen, type UpdateKind } from '../data/updates';
import { useT, type MessageKey } from '../i18n';
import { English } from '../i18n/English';
import { Icon } from './Icon';
import { useDismiss } from './useDismiss';

const KIND_LABEL: Record<UpdateKind, MessageKey> = {
  new: 'whatsNew.kind.new',
  better: 'whatsNew.kind.better',
  fixed: 'whatsNew.kind.fixed',
};

/**
 * The title screen's bell. It lists the last week of changes from src/data/updates.ts, newest first. A coral dot shows
 * while any of them is unseen on this device. Opening the list counts them all as seen, and the ones that were new keep
 * their own dot until the list closes or the student marks them read.
 */
export function WhatsNew() {
  const t = useT();
  const recent = useMemo(() => recentUpdates(new Date()), []);
  const [seen, setSeen] = useState(loadSeen);
  // The entries that were unseen when the list opened.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unread = recent.filter((u) => !seen.has(u.id)).length;
  const label = unread ? t('whatsNew.unread', { count: unread }) : t('whatsNew.label');
  const now = new Date();

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setFresh(new Set(recent.filter((u) => !seen.has(u.id)).map((u) => u.id)));
    const ids = new Set(recent.map((u) => u.id));
    saveSeen(ids);
    setSeen(ids);
    setOpen(true);
  };

  const when = (date: string) => {
    const ago = daysAgo(date, now);
    if (ago <= 0) return t('whatsNew.today');
    if (ago === 1) return t('whatsNew.yesterday');
    return t('whatsNew.daysAgo', { count: ago });
  };

  return (
    <div className="band-switch whats-new" ref={ref}>
      <button
        ref={button}
        className="btn btn-chip btn-icon whats-new-bell"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="whats-new-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="band-menu whats-new-menu" role="dialog" aria-label={t('whatsNew.label')}>
          <div className="whats-new-head">
            <strong>{t('whatsNew.label')}</strong>
            <span>{t('whatsNew.window')}</span>
          </div>
          {recent.length === 0 ? (
            <p className="whats-new-empty">{t('whatsNew.empty')}</p>
          ) : (
            <ul className="whats-new-list">
              {recent.map((u) => (
                <li key={u.id} className="whats-new-item">
                  <span className={`whats-new-tile kind-${u.kind}`} title={t(KIND_LABEL[u.kind])} aria-hidden="true">
                    <Icon name={u.icon} />
                  </span>
                  <div className="whats-new-body">
                    <span className="sr-only">{t(KIND_LABEL[u.kind])}: </span>
                    <English>
                      <strong>{u.title}</strong>
                      <span className="whats-new-desc">{u.body}</span>
                    </English>
                    <span className="whats-new-when">{when(u.date)}</span>
                  </div>
                  {fresh.has(u.id) && (
                    <span className="whats-new-unread" title={t('whatsNew.isNew')}>
                      <span className="sr-only">{t('whatsNew.isNew')}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {fresh.size > 0 && (
            <div className="whats-new-foot">
              <button className="btn-link" onClick={() => setFresh(new Set())}>
                {t('whatsNew.markRead')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
