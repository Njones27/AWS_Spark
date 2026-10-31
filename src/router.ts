import { useSyncExternalStore } from 'react';

// Hash routes work on any static host (S3, Amplify, GitHub Pages) without rewrite rules.
export type Route =
  | { name: 'home' }
  | { name: 'map'; chapter: string }
  | { name: 'advanced' }
  | { name: 'level'; id: string }
  /**
   * A teammate's design from a share link. `share` is the whole design in a long link (#/playground?d=…);
   * `shareId` is a short link (#/s/<id>) that Spark's API looks up.
   */
  | { name: 'playground'; share?: string; shareId?: string }
  | { name: 'styleguide' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'levels':
      return { name: 'map', chapter: parts[1] === '2' ? 'ch2' : 'ch1' };
    case 'advanced':
      return { name: 'advanced' };
    case 'level':
      return parts[1] ? { name: 'level', id: parts[1] } : { name: 'map', chapter: 'ch1' };
    case 'playground':
      return { name: 'playground', share: new URLSearchParams(query).get('d') ?? undefined };
    case 's':
      return parts[1] ? { name: 'playground', shareId: parts[1] } : { name: 'playground' };
    case 'styleguide':
      return { name: 'styleguide' };
    default:
      return { name: 'home' };
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export const href = {
  home: '#/',
  map: '#/levels',
  advanced: '#/advanced',
  chapter: (id: string) => (id === 'adv' ? '#/advanced' : id === 'ch2' ? '#/levels/2' : '#/levels'),
  level: (id: string) => `#/level/${id}`,
  playground: '#/playground',
  /** A short share link. */
  share: (id: string) => `#/s/${id}`,
  styleguide: '#/styleguide',
};

export const go = (to: string) => {
  window.location.hash = to;
};
