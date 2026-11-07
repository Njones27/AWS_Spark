import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Route } from '../router';
import { useApp, type Profile } from '../store';
import {
  appSync,
  normalizeKey,
  type DesignChoice,
  type KeyActionResult,
  type RecoverResult,
  type SyncStatus,
} from '../sync';
import { useEscape } from './playground/ShareDialog';
import { Icon } from './Icon';

/** The small, calm save status. Sync problems only ever show up here. */
export const SYNC_TEXT: Record<SyncStatus, string> = {
  device: 'Saved on this device',
  synced: 'Saved to your Builder Key',
  offline: 'Saved on this device for now',
};

const RECOVER_TEXT: Record<RecoverResult, string> = {
  ok: 'Welcome back! Your progress is on this computer now.',
  bad_key: 'A Builder Key looks like MAPLE-OTTER-4821: two words and four numbers.',
  not_found: 'Spark couldn’t find that key. Check each word and number, then try again.',
  offline: 'Spark can’t reach the internet right now. Your progress is safe on this computer. Try again soon.',
};

type KeyAction = 'newKey' | 'forget';

/** What the student sees after each key-safety action. */
export const KEY_ACTION_TEXT: Record<KeyAction, Record<KeyActionResult, string>> = {
  newKey: {
    ok: 'Here’s your new Builder Key. Write it down again. Your old key doesn’t work anymore.',
    offline: 'Spark can’t reach the internet right now, so your key didn’t change. Try again soon.',
  },
  forget: {
    ok: 'Done. Spark no longer keeps your progress. It’s still here on this computer.',
    offline: 'Spark can’t reach the internet right now, so nothing was removed. Try again soon.',
  },
};

/** For someone whose key was seen by others, or who wants their saved progress gone from Spark. */
function KeySafety({ onDone }: { onDone: (action: KeyAction, result: KeyActionResult) => void }) {
  const [confirming, setConfirming] = useState<KeyAction | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: KeyAction) => {
    setBusy(true);
    const result = await (action === 'newKey' ? appSync.newKey() : appSync.forget());
    setBusy(false);
    setConfirming(null);
    onDone(action, result);
  };
  return (
    <section className="key-safety" aria-labelledby="key-safety-title">
      <h3 id="key-safety-title">Keep your key safe</h3>
      {confirming === null ? (
        <>
          <p className="muted small">
            Anyone with your key can open your progress. If someone else saw it, get a new one.
          </p>
          <div className="key-choice-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming('newKey')}>
              Get a new key
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming('forget')}>
              Remove my progress from Spark
            </button>
          </div>
        </>
      ) : (
        <div className="key-choice" role="group" aria-labelledby="key-confirm-title">
          <p id="key-confirm-title">
            <strong>{confirming === 'newKey' ? 'Get a new key?' : 'Remove your progress from Spark?'}</strong>
          </p>
          <p className="muted small">
            {confirming === 'newKey'
              ? 'Your old key will stop working. Other computers will need the new key to keep going.'
              : 'Spark will forget your Builder Key and the progress saved with it. The progress on this computer stays.'}
          </p>
          <div className="key-choice-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)} disabled={busy} autoFocus>
              {confirming === 'newKey' ? 'Keep my key' : 'Keep it'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void run(confirming)} disabled={busy}>
              {busy ? 'Working…' : confirming === 'newKey' ? 'Get a new key' : 'Remove it'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The one-time "You earned a Builder Key!" notice is due once a key exists that the student hasn't seen. It waits
 * while a level is open, so it never covers a puzzle or the win card, and shows on the next screen instead.
 */
export function keyNoticeDue(profile: Pick<Profile, 'builderKey' | 'builderKeySeen'>, route: Route['name']): boolean {
  return !!profile.builderKey && !profile.builderKeySeen && route !== 'level';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Moves focus into a dialog when it opens, keeps Tab inside it, and gives focus back to whatever opened it. */
function useFocusTrap(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const inside = el.contains(document.activeElement);
      const edge = e.shiftKey ? list[0] : list[list.length - 1];
      if (!inside || document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? list[list.length - 1] : list[0]).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [box]);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(appSync.subscribeStatus, appSync.getStatus);
}

/** Opens the Builder Key dialog: a chip on the home screen, or a small button with the save status on the level map. */
export function BuilderKeyButton({ variant }: { variant: 'chip' | 'row' }) {
  const [open, setOpen] = useState(false);
  const status = useSyncStatus();
  const button = (
    <button
      className={variant === 'chip' ? 'btn btn-chip' : 'btn btn-ghost btn-sm'}
      aria-haspopup="dialog"
      aria-label="Builder Key"
      title={SYNC_TEXT[status]}
      onClick={() => setOpen(true)}
    >
      <Icon name="key" />
      <span className="btn-label">Builder Key</span>
    </button>
  );
  return (
    <>
      {variant === 'row' ? (
        <div className="key-row">
          {button}
          <span className="muted small">{SYNC_TEXT[status]}</span>
        </div>
      ) : (
        button
      )}
      {/* In <body>, so the dialog sits above everything wherever the button is (the home top bar is its own layer). */}
      {open && createPortal(<BuilderKeyDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** A small card in the corner, once per device, the first time Spark makes a Builder Key. It never blocks play. */
export function KeyNotice({ route }: { route: Route['name'] }) {
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const [dialog, setDialog] = useState(false);
  const seen = () => setProfile({ builderKeySeen: true });
  return (
    <>
      {keyNoticeDue(profile, route) && (
        <aside className="key-notice" lang="en" dir="ltr" aria-labelledby="key-notice-title">
          <span className="key-notice-icon" aria-hidden="true">
            <Icon name="key" size={26} />
          </span>
          <div className="key-notice-body">
            <p id="key-notice-title" role="status">
              <strong>You earned a Builder Key!</strong>
            </p>
            <p className="key-notice-code">{profile.builderKey}</p>
            <p className="muted small">Write it down to keep going on another computer.</p>
            <div className="key-notice-actions">
              <button className="btn btn-ghost btn-sm" onClick={seen}>
                Got it
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  seen();
                  setDialog(true);
                }}
              >
                Open Builder Key
              </button>
            </div>
          </div>
        </aside>
      )}
      {dialog && createPortal(<BuilderKeyDialog onClose={() => setDialog(false)} />, document.body)}
    </>
  );
}

/** Shows this device's Builder Key, and brings progress over from a key used on another computer. */
export function BuilderKeyDialog({ onClose }: { onClose: () => void }) {
  const builderKey = useApp((s) => s.profile.builderKey);
  const keySeen = useApp((s) => s.profile.builderKeySeen);
  const setProfile = useApp((s) => s.setProfile);
  // Seeing the key here counts as seeing it, so the one-time notice doesn't show it again.
  useEffect(() => {
    if (builderKey && !keySeen) setProfile({ builderKeySeen: true });
  }, [builderKey, keySeen, setProfile]);
  const status = useSyncStatus();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecoverResult | null>(null);
  const [copied, setCopied] = useState('');
  const [safety, setSafety] = useState('');
  const keyBox = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(box);

  // When this computer and the Builder Key each have a different design, the student picks one.
  const pick = useRef<((c: DesignChoice) => void) | null>(null);
  const [asking, setAsking] = useState(false);
  const chooseDesign = () =>
    new Promise<DesignChoice>((resolve) => {
      pick.current = resolve;
      setAsking(true);
    });
  const answer = (c: DesignChoice) => {
    pick.current?.(c);
    pick.current = null;
    setAsking(false);
  };
  // Closed mid-question: keep this computer's design, since it isn't saved anywhere else yet.
  useEffect(() => () => pick.current?.('local'), []);

  const copy = () => {
    if (!builderKey) return;
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(builderKey))
      .then(() => setCopied('Copied!'))
      .catch(() => {
        keyBox.current?.select();
        setCopied('Press Ctrl+C (or ⌘C) to copy the selected key.');
      });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !input.trim()) return;
    // Show the key the way Spark reads it: capitals, with dashes between the parts.
    setInput(normalizeKey(input));
    setBusy(true);
    setResult(null);
    setSafety('');
    const r = await appSync.recover(input, chooseDesign);
    setBusy(false);
    setResult(r);
    if (r === 'ok') {
      setInput('');
      setCopied('');
    }
  };

  return (
    // Not translated yet, so it stays English and left to right even when the page reads right to left.
    <div className="modal-backdrop" lang="en" dir="ltr" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="modal share-dialog builder-key" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <div className="modal-scroll">
          <p className="eyebrow">Builder Key</p>
          <h2 id="key-title">Your Builder Key</h2>
          {builderKey ? (
            <>
              <p className="muted">Write this down to keep going on another computer.</p>
              <div className="key-show">
                <input
                  ref={keyBox}
                  className="key-code"
                  readOnly
                  value={builderKey}
                  aria-label="Your Builder Key"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn btn-ghost" onClick={copy}>
                  Copy key
                </button>
              </div>
              <p className="muted small key-copied" aria-live="polite">
                {copied}
              </p>
              <KeySafety
                onDone={(action, result) => {
                  setCopied('');
                  setSafety(KEY_ACTION_TEXT[action][result]);
                }}
              />
            </>
          ) : (
            <p className="muted">
              You get a Builder Key when you finish your first level or build something in the Playground. It lets you
              keep going on another computer.
            </p>
          )}

          {/* Outside KeySafety, so the result still shows after "Remove" takes the key (and that section) away. */}
          <p className="key-result" aria-live="polite">
            {safety}
          </p>

          <form className="key-form" onSubmit={submit}>
            <h3>Continue my progress</h3>
            <p className="muted small">
              Used Spark on another computer? Type that Builder Key here. Levels you finished on either computer are kept.
            </p>
            {asking ? (
              <div className="key-choice" role="group" aria-labelledby="key-choice-title">
                <p id="key-choice-title">
                  <strong>Which design do you want to keep?</strong>
                </p>
                <p className="muted small">
                  This computer and your Builder Key each have a different Playground design. Your finished levels are
                  kept either way.
                </p>
                <div className="key-choice-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => answer('local')} autoFocus>
                    The one on this computer
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => answer('server')}>
                    The one from my Builder Key
                  </button>
                </div>
              </div>
            ) : (
              <div className="key-entry">
                <label className="field">
                  <span>Builder Key</span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="MAPLE-OTTER-4821"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={40}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </div>
            )}
            <p className="key-result" aria-live="polite">
              {result ? RECOVER_TEXT[result] : ''}
            </p>
          </form>
          <p className="share-warn">Spark saves only your progress, never your name.</p>
        </div>
        <div className="share-actions">
          <p className="muted small" role="status">
            {SYNC_TEXT[status]}
          </p>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
