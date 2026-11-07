import { useRef, useState, type ReactNode } from 'react';
import { BANDS } from '../data/text';
import { setLayoutChoice, useDevice } from '../device';
import { LANGUAGES, langDef, setLang, useLang, useT, type MessageKey, type T } from '../i18n';
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
  const t = useT();
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
          <LangSwitch labelled />
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
        <LangSwitch />
        {!hideBand && <BandSwitch />}
        {phoneScreen && (
          <button className="btn btn-chip" onClick={() => setLayoutChoice('auto')}>
            <Icon name="phone" /> {t('chrome.phoneLayout')}
          </button>
        )}
      </div>
    </header>
  );
}

const BAND_ICON: Record<Band, IconName> = { explorer: 'compass', builder: 'bricks', architect: 'ruler' };

const THEMES: { id: ThemeChoice; label: MessageKey; icon: IconName }[] = [
  { id: 'system', label: 'theme.system', icon: 'device' },
  { id: 'light', label: 'theme.light', icon: 'sun' },
  { id: 'dark', label: 'theme.dark', icon: 'moon' },
];

/**
 * Light, dark, or whatever the device uses. The button shows the colours in use now: an icon in a top bar, or the icon
 * and its name (`labelled`) as a row in the phone's "More" menu.
 */
export function ThemeSwitch({ labelled }: { labelled?: boolean }) {
  const { choice, theme } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const cur = THEMES.find((th) => th.id === choice)!;
  const curLabel = t('theme.current', { name: t(cur.label) });
  return (
    <div className="band-switch theme-switch" ref={ref}>
      <button
        className={labelled ? 'btn btn-chip' : 'btn btn-chip btn-icon'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labelled ? undefined : curLabel}
        title={labelled ? undefined : curLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
        {labelled && curLabel}
      </button>
      {open && (
        <div className="band-menu theme-menu" role="menu" aria-label={t('theme.label')}>
          {THEMES.map((th) => (
            <button
              key={th.id}
              role="menuitemradio"
              aria-checked={th.id === choice}
              className={th.id === choice ? 'is-current' : ''}
              onClick={() => {
                setThemeChoice(th.id);
                setOpen(false);
              }}
            >
              <Icon name={th.icon} />
              <span>{t(th.label)}</span>
              {th.id === choice && <Icon name="check" className="theme-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The language menu. Each language is listed in its own words, so a student who can't read the current one can still
 * find theirs. AWS service names stay in English in every language.
 */
export function LangSwitch({ labelled }: { labelled?: boolean }) {
  const lang = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const cur = langDef(lang);
  const curLabel = t('lang.menu', { name: cur.name });
  return (
    <div className="band-switch lang-switch" ref={ref}>
      <button
        className="btn btn-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labelled ? undefined : curLabel}
        title={labelled ? undefined : curLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="globe" />
        {labelled ? curLabel : <span className="lang-code">{cur.id.toUpperCase()}</span>}
      </button>
      {open && (
        <div className="band-menu theme-menu lang-menu" role="menu" aria-label={t('lang.label')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={l.id === lang}
              className={l.id === lang ? 'is-current' : ''}
              lang={l.tag}
              title={l.english}
              onClick={() => {
                setLang(l.id);
                setOpen(false);
              }}
            >
              <span>{l.name}</span>
              {l.id === lang && <Icon name="check" className="theme-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A band's name, grades, and tagline in the chosen language. */
export const bandText = (t: T, band: Band) => ({
  label: t(`band.${band}` as MessageKey),
  grades: t(`band.${band}.grades` as MessageKey),
  tagline: t(`band.${band}.tagline` as MessageKey),
});

export function BandSwitch() {
  const t = useT();
  const band = useBand();
  const setBand = useApp((s) => s.setBand);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const cur = bandText(t, band);
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
                <strong>{bandText(t, b.id).label}</strong> <em>{bandText(t, b.id).grades}</em>
                <small>{bandText(t, b.id).tagline}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** First-run picker: "Who's building today?" Every band sees the real name (Amazon S3); the explanation is what changes. */
export function BandPicker() {
  const t = useT();
  const setBand = useApp((s) => s.setBand);
  return (
    <div className="modal-backdrop">
      <div className="modal band-picker" role="dialog" aria-modal="true" aria-labelledby="band-title">
        {/* Here too, because this card covers the title screen's menu on a first visit. */}
        <div className="band-picker-lang">
          <LangSwitch />
        </div>
        <Sparky mood="cheer" size={92} />
        <h2 id="band-title">{t('picker.title')}</h2>
        <p className="muted">{t('picker.hint')}</p>
        <div className="band-cards">
          {BANDS.map((b) => (
            <button key={b.id} className={`band-card band-${b.id}`} onClick={() => setBand(b.id)}>
              <span className="band-card-icon">
                <Icon name={BAND_ICON[b.id]} />
              </span>
              <strong>{bandText(t, b.id).label}</strong>
              <em>{bandText(t, b.id).grades}</em>
              <span className="band-card-sample">
                <img src={`${import.meta.env.BASE_URL}icons/s3.svg`} alt="" />
                <span>
                  <b>Amazon S3</b>
                  <small>{t(`band.sample.${b.id}`)}</small>
                </span>
              </span>
              <small>{bandText(t, b.id).tagline}</small>
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
            <strong>{t('picker.college')}</strong>
            <em>{t('picker.collegeGrades')}</em>
            <span className="band-card-sample">
              <img src={`${import.meta.env.BASE_URL}icons/s3.svg`} alt="" />
              <span>
                <b>Amazon S3</b>
                <small>{t('band.sample.architect')}</small>
              </span>
            </span>
            <small>{t('picker.collegeTagline')}</small>
          </button>
        </div>
      </div>
    </div>
  );
}
