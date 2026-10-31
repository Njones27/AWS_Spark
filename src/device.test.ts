import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChoice, PHONE_QUERY, resolveDevice } from './device';

describe('device', () => {
  it('follows the screen on auto', () => {
    expect(resolveDevice('auto', true)).toBe('phone');
    expect(resolveDevice('auto', false)).toBe('laptop');
  });

  it('lets the student override the screen either way', () => {
    expect(resolveDevice('laptop', true)).toBe('laptop');
    expect(resolveDevice('phone', false)).toBe('phone');
  });

  it('treats a missing or unknown saved choice as auto', () => {
    expect(parseChoice(null)).toBe('auto');
    expect(parseChoice('tablet')).toBe('auto');
    expect(parseChoice('laptop')).toBe('laptop');
  });
});

describe('device watch', () => {
  let phoneScreen: boolean;
  let orientation: string;
  let store: Map<string, string>;
  let blocked: boolean;
  const root = { dataset: {} as Record<string, string> };

  beforeEach(() => {
    vi.resetModules();
    phoneScreen = true;
    orientation = 'portrait-primary';
    store = new Map();
    blocked = false;
    root.dataset = {};
    const storage = {
      getItem: (k: string) => {
        if (blocked) throw new Error('blocked');
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (blocked) throw new Error('blocked');
        store.set(k, v);
      },
      removeItem: (k: string) => {
        if (blocked) throw new Error('blocked');
        store.delete(k);
      },
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === PHONE_QUERY && phoneScreen, addEventListener: () => {} }));
    vi.stubGlobal('screen', {
      orientation: {
        get type() {
          return orientation;
        },
        addEventListener: () => {},
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tags a phone, and marks it sideways from the screen, not the viewport', async () => {
    orientation = 'landscape-primary';
    const { startDeviceWatch } = await import('./device');
    startDeviceWatch();
    expect(root.dataset.device).toBe('phone');
    expect(root.dataset.sideways).toBe('');
  });

  it('keeps a saved laptop choice on a phone, and clears it on auto', async () => {
    store.set('spark-layout', 'laptop');
    const { startDeviceWatch, setLayoutChoice } = await import('./device');
    startDeviceWatch();
    expect(root.dataset.device).toBe('laptop');
    expect(root.dataset.sideways).toBeUndefined();
    setLayoutChoice('auto');
    expect(root.dataset.device).toBe('phone');
    expect(store.has('spark-layout')).toBe(false);
  });

  it('still switches when storage is blocked', async () => {
    blocked = true;
    const { startDeviceWatch, setLayoutChoice } = await import('./device');
    startDeviceWatch();
    expect(root.dataset.device).toBe('phone');
    setLayoutChoice('laptop');
    expect(root.dataset.device).toBe('laptop');
  });
});
