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

interface AppState {
  band: Band | null;
  completed: string[];
  playground: SavedDiagram | null;
  unlockAll: boolean;
  setBand: (band: Band) => void;
  complete: (levelId: string) => void;
  savePlayground: (d: SavedDiagram | null) => void;
  resetProgress: () => void;
  setUnlockAll: (on: boolean) => void;
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
    }),
    {
      name: 'spark-cloud-builders',
      version: 2,
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
 * Version 2 only added optional fields (piece names, notes, the plan, and the goal), so older saves load as they are.
 * Without a migrate function, zustand would throw away saves from an older version.
 */
export function migrateSaved(persisted: unknown): AppState {
  return persisted as AppState;
}

/** Pins the band for a subtree. The Advanced Track always uses Architect names, numbers, and explanations. */
export const BandOverride = createContext<Band | null>(null);

export const useBand = (): Band => {
  const pinned = useContext(BandOverride);
  const band = useApp((s) => s.band ?? 'builder');
  return pinned ?? band;
};
