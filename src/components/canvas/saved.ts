import type { SourceSpec } from '../../data/types';
import type { SavedDiagram } from '../../store';
import { isPiece, makeEdge, makePiece, zoneNodes, type AppEdge, type AppNode, type Rect } from './model';

// The Playground's town and cloud areas, in map coordinates.
export const PLAY_TOWN: Rect = { x: -10, y: -50, width: 200, height: 700 };
export const PLAY_CLOUD: Rect = { x: 290, y: -120, width: 1060, height: 770 };
export const DEFAULT_SOURCE: SourceSpec = { demand: 50 };
export const DEFAULT_TOWN_LABEL = 'Townsfolk';

/** The map a fresh Playground starts with: one group of townsfolk. */
export const EMPTY_PLAYGROUND: SavedDiagram = {
  nodes: [{ id: 'townsfolk', service: 'users', pos: { x: 30, y: 260 }, source: DEFAULT_SOURCE }],
  edges: [],
};

/** True for a map that still holds only the starting townsfolk, so nothing is lost by replacing it. */
export function isBlank(d: SavedDiagram): boolean {
  return d.edges.length === 0 && d.nodes.every((n) => n.service === 'users' && !n.note);
}

/** Builds canvas nodes and edges from a saved diagram. Arrows that aren't allowed connections are dropped. */
export function fromSaved(saved: SavedDiagram | null): { nodes: AppNode[]; edges: AppEdge[] } {
  const d = saved?.nodes.length ? saved : EMPTY_PLAYGROUND;
  const pieces = d.nodes.map((n) =>
    makePiece(
      n.id,
      {
        service: n.service,
        label: n.label || (n.service === 'users' ? DEFAULT_TOWN_LABEL : undefined),
        source: n.source ?? (n.service === 'users' ? DEFAULT_SOURCE : undefined),
        note: n.note,
      },
      n.pos,
    ),
  );
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const edges = d.edges
    .map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      return s && t ? makeEdge(s.id, t.id, s.data.service, t.data.service) : null;
    })
    .filter((e): e is AppEdge => !!e);
  return { nodes: [...zoneNodes(PLAY_TOWN, PLAY_CLOUD), ...pieces], edges };
}

/** The saved form of the canvas, plus the plan and goal the team wrote. */
export function toSaved(
  nodes: AppNode[],
  edges: AppEdge[],
  extra: Pick<SavedDiagram, 'plan' | 'goal'> = {},
): SavedDiagram {
  return {
    nodes: nodes.filter(isPiece).map((n) => ({
      id: n.id,
      service: n.data.service,
      pos: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      source: n.data.source,
      label: n.data.label,
      note: n.data.note || undefined,
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
    ...extra,
  };
}
