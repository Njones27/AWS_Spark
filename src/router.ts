import { useSyncExternalStore } from 'react';

// Hash routes work on any static host (S3, Amplify, GitHub Pages) without rewrite rules.
export type Route =
  | { name: 'home' }
  | { name: 'map' }
  | { name: 'level'; id: string }
  | { name: 'playground' }
  | { name: 'styleguide' };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'levels':
      return { name: 'map' };
    case 'level':
      return parts[1] ? { name: 'level', id: parts[1] } : { name: 'map' };
    case 'playground':
      return { name: 'playground' };
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
  return parse(hash);
}

export const href = {
  home: '#/',
  map: '#/levels',
  level: (id: string) => `#/level/${id}`,
  playground: '#/playground',
  styleguide: '#/styleguide',
};

export const go = (to: string) => {
  window.location.hash = to;
};
