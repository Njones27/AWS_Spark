import { useRef, useState, type ReactNode } from 'react';
import { BANDS } from '../data/text';
import { setLayoutChoice, useDevice } from '../device';
import { go, href } from '../router';
import type { Band } from '../data/types';
import { useApp, useBand } from '../store';
import { setThemeChoice, useTheme, type ThemeChoice } from '../theme';
import { Sparky } from './art/Sparky';
import { Icon, type IconName } from './Icon';
import { PhoneMenu } from './PhoneChrome';
import { useDismiss } from './useDismiss';

export function TopBar({
  back,
  title,
  children,
  hideBand,
}: {
  back?: { href: string; label: string };
  title: ReactNode;
  children?: ReactNode;
  hideBand?: boolean;
}) {
  const { device, phoneScreen } = useDevice();
  if (device === 'phone') {
    return (
      <header className="topbar">
        {back && (
          <a className="btn btn-ghost btn-icon" href={back.href} aria-label={back.label}>
            <Icon name="back" />
          </a>
        )}
        <div className="topbar-title">{title}</div>
        <PhoneMenu>
          {children}
          <ThemeSwitch labelled />
          {!hideBand && <BandSwitch />}
        </PhoneMenu>
      </header>
    );
  }
  return (
    <header className="topbar">
      {back && (
        <a className="btn btn-ghost" href={back.href}>
          <Icon name="back" /> {back.label}
        </a>
      )}
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        {children}
        <ThemeSwitch />
        {!hideBand && <BandSwitch />}
        {phoneScreen && (
          <button className="btn btn-chip" onClick={() => setLayoutChoice('auto')}>
            <Icon name="phone" /> Phone layout
          </button>
        )}
      </div>
    </header>
  );
}

const BAND_ICON: Record<Band, IconName> = { explorer: 'compass', builder: 'bricks', architect: 'ruler' };

const THEMES: { id: ThemeChoice; label: string; icon: IconName }[] = [
  { id: 'system', label: 'Match my device', icon: 'device' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

/**
 * Light, dark, or whatever the device uses. The button shows the colours in use now: an icon in a top bar, or the icon
 * and its name (`labelled`) as a row in the phone's "More" menu.
 */
export function ThemeSwitch({ labelled }: { labelled?: boolean }) {
  const { choice, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const cur = THEMES.find((t) => t.id === choice)!;
  return (
    <div className="band-switch theme-switch" ref={ref}>
      <button
        className={labelled ? 'btn btn-chip' : 'btn btn-chip btn-icon'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labelled ? undefined : `Theme: ${cur.label}`}
        title={labelled ? undefined : `Theme: ${cur.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
        {labelled && <>Theme: {cur.label}</>}
      </button>
      {open && (
        <div className="band-menu theme-menu" role="menu" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={t.id === choice}
              className={t.id === choice ? 'is-current' : ''}
              onClick={() => {
                setThemeChoice(t.id);
                setOpen(false);
              }}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.id === choice && <Icon name="check" className="theme-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BandSwitch() {
  const band = useBand();
  const setBand = useApp((s) => s.setBand);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const cur = BANDS.find((b) => b.id === band)!;
  return (
    <div className="band-switch" ref={ref}>
      <button className="btn btn-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={BAND_ICON[band]} /> {cur.label}
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
              <span className="band-menu-icon">
                <Icon name={BAND_ICON[b.id]} />
              </span>
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

// Every band sees the real name. The explanation is what changes.
const SAMPLE: Record<Band, { main: string; sub?: string }> = {
  explorer: { main: 'Amazon S3', sub: 'A giant toy box for files' },
  builder: { main: 'Amazon S3', sub: 'Stores files like photos and pages' },
  architect: { main: 'Amazon S3', sub: 'Object storage with 11 nines of durability' },
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
              <span className="band-card-icon">
                <Icon name={BAND_ICON[b.id]} />
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
          {/* Not a fourth band: college students go to the Advanced Track, which always uses Architect detail. */}
          <button
            className="band-card band-college"
            onClick={() => {
              setBand('architect');
              go(href.advanced);
            }}
          >
            <span className="band-card-icon">
              <Icon name="cap" />
            </span>
            <strong>College</strong>
            <em>College & up</em>
            <span className="band-card-sample">
              <img src={`${import.meta.env.BASE_URL}icons/s3.svg`} alt="" />
              <span>
                <b>Amazon S3</b>
                <small>Object storage with 11 nines of durability</small>
              </span>
            </span>
            <small>Opens the Advanced Track: real incidents and budgets</small>
          </button>
        </div>
      </div>
    </div>
  );
}
