import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Band, ServiceId, SourceSpec, XY } from './data/types';

export interface SavedNode {
  id: string;
  service: ServiceId;
  pos: XY;
  source?: SourceSpec;
}

export interface SavedDiagram {
  nodes: SavedNode[];
  edges: { source: string; target: string }[];
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
      version: 1,
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

export const useBand = (): Band => useApp((s) => s.band ?? 'builder');
