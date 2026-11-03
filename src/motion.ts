import { useSyncExternalStore } from 'react';

// CSS can stop CSS animations for students who ask their device for less motion, but not SVG <animateMotion>, so the
// request dots read this and stand still instead.

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(QUERY).matches);
}

/**
 * Props for an <animateMotion> that parks its dot at `at` (0 to 1) along the path, for when motion is reduced. The dots
 * stay spread out, so how busy an arrow is still shows.
 */
export const parkedMotion = (at: number) =>
  ({ dur: '1s', keyPoints: `${at};${at}`, keyTimes: '0;1', calcMode: 'linear', fill: 'freeze' }) as const;
