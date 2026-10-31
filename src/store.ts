import { createContext, useContext } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Band, ServiceId, SourceSpec, XY } from './data/types';

export interface SavedNode {
  id: string;
  service: ServiceId;
  pos: XY;
  source?: SourceSpec;
  /** The team's own name for the piece, like "Sign-up checker". */
  label?: string;
  /** Why the team chose this piece. */
  note?: string;
}

/** What the team writes for their pitch: a project title and what each service does in their project. */
export interface PlanInfo {
  title: string;
  uses: Partial<Record<ServiceId, string>>;
}

export interface SavedDiagram {
  nodes: SavedNode[];
  edges: { source: string; target: string }[];
  plan?: PlanInfo;
  /** The goal sentence: "{demand} {source label} can {what}". */
  goal?: { what: string };
}

/** Progress in the shape Spark's API keeps it (docs/aws/CONTRACT.md). `playground` is a share code from encodeDesign(). */
export interface ProgressState {
  band: Band | null;
  completed: string[];
  playground: string | null;
  unlockAll: boolean;
}

/**
 * This device's link to a Builder Key profile on Spark's API (see src/sync.ts). All null until the first save that
 * creates one. Spark never stores a name or email, only these random values and the progress itself.
 */
export interface Profile {
  profileId: string | null;
  token: string | null;
  /** The words-and-numbers key a student writes down to continue on another computer, like MAPLE-OTTER-4821. */
  builderKey: string | null;
  /** When the server last confirmed this device's progress (ISO 8601). */
  lastSyncedAt: string | null;
  /**
   * The server's progress as of the last sync this device applied. A field that still matches it hasn't changed here
   * since, so a newer value from another computer can replace it; a field that differs was changed on this device.
   */
  lastSynced: ProgressState | null;
  /** The student has seen this key (closed the "You earned a Builder Key!" notice, or opened the dialog). */
  builderKeySeen: boolean;
}

export const EMPTY_PROFILE: Profile = {
  profileId: null,
  token: null,
  builderKey: null,
  lastSyncedAt: null,
  lastSynced: null,
  builderKeySeen: false,
};

export interface AppState {
  band: Band | null;
  completed: string[];
  playground: SavedDiagram | null;
  unlockAll: boolean;
  profile: Profile;
  setBand: (band: Band) => void;
  complete: (levelId: string) => void;
  savePlayground: (d: SavedDiagram | null) => void;
  resetProgress: () => void;
  setUnlockAll: (on: boolean) => void;
  setProfile: (patch: Partial<Profile>) => void;
  clearProfile: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      band: null,
      completed: [],
      playground: null,
      unlockAll: false,
      setBand: (band) => set({ band }),
      complete: (id) => set((s) => (s.completed.includes(id) ? s : { completed: [...s.completed, id] })),
      savePlayground: (playground) => set({ playground }),
      resetProgress: () => set({ completed: [] }),
      setUnlockAll: (unlockAll) => set({ unlockAll }),
      profile: EMPTY_PROFILE,
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      clearProfile: () => set({ profile: EMPTY_PROFILE }),
    }),
    {
      name: 'spark-cloud-builders',
      version: 3,
      migrate: migrateSaved,
      // Storage can be blocked (private mode, managed Chromebooks); fall back to memory.
      storage: createJSONStorage(() => {
        try {
          localStorage.setItem('__spark', '1');
          localStorage.removeItem('__spark');
          return localStorage;
        } catch {
          const mem = new Map<string, string>();
          return {
            getItem: (k) => mem.get(k) ?? null,
            setItem: (k, v) => void mem.set(k, v),
            removeItem: (k) => void mem.delete(k),
          };
        }
      }),
    },
  ),
);

/**
 * Without a migrate function, zustand would throw away saves from an older version.
 * - Version 2 only added optional fields (piece names, notes, the plan, and the goal), so those saves load as they are.
 * - Version 3 added the Builder Key profile. Older saves get an empty one, and nothing else changes.
 */
export function migrateSaved(persisted: unknown, version = 0): AppState {
  const saved = (persisted ?? {}) as AppState;
  return version < 3 ? { ...saved, profile: EMPTY_PROFILE } : saved;
}

/** Pins the band for a subtree. The Advanced Track always uses Architect names, numbers, and explanations. */
export const BandOverride = createContext<Band | null>(null);

export const useBand = (): Band => {
  const pinned = useContext(BandOverride);
  const band = useApp((s) => s.band ?? 'builder');
  return pinned ?? band;
};
