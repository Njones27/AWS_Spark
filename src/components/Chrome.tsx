import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BANDS } from '../data/text';
import type { Band } from '../data/types';
import { useApp, useBand } from '../store';
import { Sparky } from './art/Sparky';

export function TopBar({ back, title, children }: { back?: { href: string; label: string }; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      {back && (
        <a className="btn btn-ghost" href={back.href}>
          <span aria-hidden="true">←</span> {back.label}
        </a>
      )}
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        {children}
        <BandSwitch />
      </div>
    </header>
  );
}

const BAND_ICON: Record<Band, string> = { explorer: '🧭', builder: '🧱', architect: '📐' };

export function BandSwitch() {
  const band = useBand();
  const setBand = useApp((s) => s.setBand);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const cur = BANDS.find((b) => b.id === band)!;
  return (
    <div className="band-switch" ref={ref}>
      <button className="btn btn-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{BAND_ICON[band]}</span> {cur.label}
        <span className="band-grades">{cur.grades}</span>
      </button>
      {open && (
        <div className="band-menu" role="menu">
          {BANDS.map((b) => (
            <button
              key={b.id}
              role="menuitemradio"
              aria-checked={b.id === band}
              className={b.id === band ? 'is-current' : ''}
              onClick={() => {
                setBand(b.id);
                setOpen(false);
              }}
            >
              <span className="band-menu-icon">{BAND_ICON[b.id]}</span>
              <span>
                <strong>{b.label}</strong> <em>{b.grades}</em>
                <small>{b.tagline}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SAMPLE: Record<Band, { main: string; sub?: string }> = {
  explorer: { main: 'Storage Bucket', sub: 'S3' },
  builder: { main: 'Storage Bucket', sub: 'Amazon S3' },
  architect: { main: 'Amazon S3' },
};

/** First-run picker: "Who's building today?" */
export function BandPicker() {
  const setBand = useApp((s) => s.setBand);
  return (
    <div className="modal-backdrop">
      <div className="modal band-picker" role="dialog" aria-modal="true" aria-labelledby="band-title">
        <Sparky mood="cheer" size={92} />
        <h2 id="band-title">Who’s building today?</h2>
        <p className="muted">You can change this any time from the top corner.</p>
        <div className="band-cards">
          {BANDS.map((b) => (
            <button key={b.id} className={`band-card band-${b.id}`} onClick={() => setBand(b.id)}>
              <span className="band-card-icon" aria-hidden="true">
                {BAND_ICON[b.id]}
              </span>
              <strong>{b.label}</strong>
              <em>{b.grades}</em>
              <span className="band-card-sample">
                <img src={`${import.meta.env.BASE_URL}icons/s3.svg`} alt="" />
                <span>
                  <b>{SAMPLE[b.id].main}</b>
                  {SAMPLE[b.id].sub && <small>{SAMPLE[b.id].sub}</small>}
                </span>
              </span>
              <small>{b.tagline}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
