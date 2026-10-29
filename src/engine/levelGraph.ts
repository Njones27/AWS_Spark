import type { Level } from '../data/levels';
import type { SimEdge, SimNode } from './simulate';

export const edgeId = (source: string, target: string) => `${source}->${target}`;

export function levelStart(level: Level): { nodes: SimNode[]; edges: SimEdge[] } {
  return {
    nodes: level.nodes.map((n) => ({ id: n.id, service: n.service, capacity: n.capacity, source: n.source })),
    edges: level.edges.map(([s, t]) => ({ id: edgeId(s, t), source: s, target: t })),
  };
}

/** The level with its intended solution applied. */
export function levelSolved(level: Level): { nodes: SimNode[]; edges: SimEdge[] } {
  const start = levelStart(level);
  const removed = new Set((level.solution.remove ?? []).map(([s, t]) => edgeId(s, t)));
  return {
    nodes: [...start.nodes, ...level.solution.add.map((a) => ({ id: a.id, service: a.service }))],
    edges: [
      ...start.edges.filter((e) => !removed.has(e.id)),
      ...level.solution.connect.map(([s, t]) => ({ id: edgeId(s, t), source: s, target: t })),
    ],
  };
}
