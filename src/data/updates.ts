import type { IconName } from '../components/Icon';

// The title screen's "What's new" bell. Each entry is one change a student can see, written for students: a one-line
// title and a sentence or two on what it means for them. Add an entry in the same pull request as the change. Skip
// changes nobody would notice, like dependency bumps or test fixes. Entries older than a week leave the bell on their
// own, so there is nothing to clean up. CI (scripts/check-whats-new.mjs) fails a PR that changes src/, public/ or
// index.html without a new entry, unless its description ticks "no entry is needed".

export type UpdateKind = 'new' | 'better' | 'fixed';

export interface Update {
  /** Stable and unique. Remembered on the device once the student has seen it. */
  id: string;
  /** The day it shipped, as YYYY-MM-DD in the time zone of whoever merged it. */
  date: string;
  kind: UpdateKind;
  icon: IconName;
  title: string;
  body: string;
  /** The pull request, for us. Never shown. */
  pr?: number;
}

/** Newest first. */
export const UPDATES: Update[] = [
  {
    id: 'connect-done-closes',
    date: '2026-11-11',
    kind: 'fixed',
    icon: 'check',
    title: 'Done really means done',
    body: 'Tapping Done after drawing arrows now closes the Connect buttons. Tap the piece again if you want them back.',
  },
  {
    id: 'connect-keeps-going',
    date: '2026-11-09',
    kind: 'better',
    icon: 'arrow',
    title: 'Draw lots of arrows in a row',
    body: 'After Connect, keep tapping pieces to add more arrows, then tap Done. Put back is now Trash, and it asks before deleting a piece.',
  },
  {
    id: 'connect-button',
    date: '2026-11-07',
    kind: 'better',
    icon: 'arrow',
    title: 'A big Connect button for arrows',
    body: 'Tap a piece, then tap Connect and pick where the arrow goes. Put back sits right next to it.',
    pr: 42,
  },
  {
    id: 'phone-piece-card',
    date: '2026-11-07',
    kind: 'better',
    icon: 'phone',
    title: 'Edit pieces without losing the map',
    body: 'On a phone, tapping a piece now shows a small card at the bottom. Tap Edit to name it or set its traffic.',
    pr: 41,
  },
  {
    id: 'sparky-in-search',
    date: '2026-11-07',
    kind: 'new',
    icon: 'star',
    title: 'Sparky shows up in Google',
    body: 'Search for Spark and look for Sparky’s face next to the link.',
    pr: 40,
  },
  {
    id: 'whats-new-bell',
    date: '2026-11-07',
    kind: 'new',
    icon: 'bell',
    title: 'A bell for what’s new',
    body: 'This list! A dot on the bell means Spark changed since you last looked.',
    pr: 39,
  },
  {
    id: 'languages',
    date: '2026-11-06',
    kind: 'new',
    icon: 'globe',
    title: 'Spark speaks 12 languages',
    body: 'Tap the globe at the top to pick yours. AWS names stay in English, just like the real console.',
    pr: 38,
  },
  {
    id: 'sparky-tab-icon',
    date: '2026-11-06',
    kind: 'new',
    icon: 'sparkles',
    title: 'Sparky on your browser tab',
    body: 'Look for Sparky’s face on your tab, and on the preview when you share a Spark link.',
    pr: 37,
  },
  {
    id: 'playground-autosave',
    date: '2026-11-06',
    kind: 'fixed',
    icon: 'save',
    title: 'Your Playground builds stay saved',
    body: 'Leaving the page or opening Spark in two tabs no longer loses what you built.',
    pr: 36,
  },
  {
    id: 'hints-stick',
    date: '2026-11-06',
    kind: 'better',
    icon: 'pin',
    title: 'Hints stick to their piece',
    body: 'When a connection is wrong, the hint bubble now follows the piece it’s about while you drag.',
    pr: 34,
  },
  {
    id: 'plan-map-arrows',
    date: '2026-11-06',
    kind: 'fixed',
    icon: 'doc',
    title: 'Clean arrows in saved plan maps',
    body: 'Arrows in the plan picture you save no longer turn into black swooshes.',
    pr: 33,
  },
  {
    id: 'piece-count',
    date: '2026-11-06',
    kind: 'better',
    icon: 'puzzle',
    title: 'Piece counts match your grade',
    body: 'The Playground card now shows how many pieces you get at your level.',
    pr: 32,
  },
  {
    id: 'new-address',
    date: '2026-11-05',
    kind: 'new',
    icon: 'link',
    title: 'A new home at letslearncloud.com',
    body: 'Spark has its own web address now.',
    pr: 30,
  },
  {
    id: 'locked-chapters',
    date: '2026-11-05',
    kind: 'better',
    icon: 'lock',
    title: 'Locked chapters say when they open',
    body: 'A locked chapter or stop now tells you which one to finish first.',
    pr: 29,
  },
  {
    id: 'phone-menus',
    date: '2026-11-05',
    kind: 'better',
    icon: 'phone',
    title: 'Phone menus open under their buttons',
    body: 'On a phone, the theme and grade menus now drop down right where you tapped.',
    pr: 27,
  },
];

/** How long an entry stays in the bell. */
export const WINDOW_DAYS = 7;

/** Whole days from `date` (YYYY-MM-DD) to `now`, counted in the student's own time zone. */
export function daysAgo(date: string, now: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

/**
 * The entries from the last week, newest first. An entry dated tomorrow still shows, because a change merged late in
 * the evening can carry the next day's date somewhere else (or in UTC) while it is still today for the student.
 * Anything further ahead waits until its day.
 */
export function recentUpdates(now: Date, list: Update[] = UPDATES): Update[] {
  return list
    .filter((u) => {
      const ago = daysAgo(u.date, now);
      return ago >= -1 && ago <= WINDOW_DAYS;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Where the seen entries' ids live in localStorage. Like the theme, this belongs to the device. */
export const SEEN_KEY = 'spark-updates-seen';

export function loadSeen(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remember `ids` as seen. Only this week's ids are kept, so the saved list never grows. */
export function saveSeen(ids: Iterable<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Storage is blocked, so the dot comes back next visit. Nothing else breaks.
  }
}
