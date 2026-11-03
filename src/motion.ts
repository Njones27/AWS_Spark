import { useSyncExternalStore } from 'react';

// CSS can stop CSS animations for students who ask their device for less motion, but not SVG <animateMotion>, so the
// request dots read this and stand still instead. Each switch between still and moving must remount the <animateMotion>
// (give the two kinds different keys): Chromium won't restart one that has frozen, or move it when its path changes.

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function subscribe(cb: () => void) {
  query?.addEventListener('change', cb);
  return () => query?.removeEventListener('change', cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false);
}

/**
 * Props for an <animateMotion> that parks its dot at `at` (0 to 1) along the path, for when motion is reduced. The dots
 * stay spread out, so how busy an arrow is still shows.
 */
export const parkedMotion = (at: number) =>
  ({ dur: '1s', keyPoints: `${at};${at}`, keyTimes: '0;1', calcMode: 'linear', fill: 'freeze' }) as const;
