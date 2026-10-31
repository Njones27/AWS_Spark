import { describe, expect, it } from 'vitest';
import { href, parseRoute } from './router';

describe('routes', () => {
  it('reads a short share link', () => {
    expect(parseRoute('#/s/abc123')).toEqual({ name: 'playground', shareId: 'abc123' });
    expect(parseRoute('#s/abc123')).toEqual({ name: 'playground', shareId: 'abc123' });
  });

  it('opens a plain Playground when the short link has no id', () => {
    expect(parseRoute('#/s/')).toEqual({ name: 'playground' });
  });

  it('still reads long share links and other routes', () => {
    expect(parseRoute('#/playground?d=XYZ')).toEqual({ name: 'playground', share: 'XYZ' });
    expect(parseRoute('#/playground')).toEqual({ name: 'playground', share: undefined });
    expect(parseRoute('#/levels/2')).toEqual({ name: 'map', chapter: 'ch2' });
    expect(parseRoute('')).toEqual({ name: 'home' });
  });

  it('builds short links that parse back', () => {
    expect(href.share('Ab3dE5fG7h')).toBe('#/s/Ab3dE5fG7h');
    expect(parseRoute(href.share('Ab3dE5fG7h'))).toEqual({ name: 'playground', shareId: 'Ab3dE5fG7h' });
  });
});
