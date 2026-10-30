import { MarkerType, type Edge, type InternalNode, type Node, Position } from '@xyflow/react';
import { createContext, useContext } from 'react';
import { findRule } from '../../data/rules';
import { SERVICES } from '../../data/services';
import type { Band, EdgeKind, ServiceId, SourceSpec } from '../../data/types';
import { edgeId } from '../../engine/levelGraph';
import type { SimEdge, SimNode, SimResult } from '../../engine/simulate';

export type PieceData = {
  service: ServiceId;
  label?: string;
  capacity?: number;
  locked?: boolean;
  source?: SourceSpec;
};
export type ZoneData = { width: number; height: number };

export type PieceNode = Node<PieceData, 'piece'>;
export type ZoneNode = Node<ZoneData, 'cloud' | 'town'>;
export type AppNode = PieceNode | ZoneNode;

export type FlowData = { kind: EdgeKind; verb: string };
export type AppEdge = Edge<FlowData, 'flow'>;

export const isPiece = (n: AppNode): n is PieceNode => n.type === 'piece';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EDGE_COLORS: Record<EdgeKind, string> = { data: '#2a9d8f', control: '#7b5ea7', monitor: '#8b93a3' };

export function makeEdge(sourceId: string, targetId: string, from: ServiceId, to: ServiceId): AppEdge | null {
  const rule = findRule(from, to);
  if (!rule) return null;
  return {
    id: edgeId(sourceId, targetId),
    source: sourceId,
    target: targetId,
    type: 'flow',
    data: { kind: rule.kind, verb: rule.verb },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[rule.kind], width: 16, height: 16 },
  };
}

export function makePiece(id: string, data: PieceData, position: { x: number; y: number }): PieceNode {
  return { id, type: 'piece', position, data, deletable: !data.locked };
}

export function zoneNodes(town: Rect | null, cloud: Rect): ZoneNode[] {
  const zone = (id: string, type: 'cloud' | 'town', r: Rect): ZoneNode => ({
    id,
    type,
    position: { x: r.x, y: r.y },
    data: { width: r.width, height: r.height },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    deletable: false,
    zIndex: -1,
    className: 'zone-node',
  });
  return [...(town ? [zone('zone-town', 'town', town)] : []), zone('zone-cloud', 'cloud', cloud)];
}

export function toSim(nodes: AppNode[], edges: AppEdge[]): { nodes: SimNode[]; edges: SimEdge[] } {
  return {
    nodes: nodes.filter(isPiece).map((n) => ({
      id: n.id,
      service: n.data.service,
      capacity: n.data.capacity,
      source: n.data.source,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

export function displayName(data: PieceData, band: Band): { main: string; sub?: string } {
  const def = SERVICES[data.service];
  if (data.label) return { main: data.label, sub: band === 'architect' ? def.name : def.nickname };
  if (band === 'architect') return { main: def.name.replace(/^(Amazon|AWS) /, ''), sub: undefined };
  return { main: def.nickname, sub: def.name.replace(/^(Amazon|AWS) /, '') };
}

// ── shared contexts ───────────────────────────────────────────
export interface SimState {
  result: SimResult | null;
  running: boolean;
}
export const SimContext = createContext<SimState>({ result: null, running: false });
export const useSim = () => useContext(SimContext);

export interface UiState {
  wiggleId: string | null;
  /** Badge services pinned on each piece, by node id. */
  badges: Record<string, ServiceId[]>;
}
export const UiContext = createContext<UiState>({ wiggleId: null, badges: {} });
export const useUi = () => useContext(UiContext);

// ── floating-edge geometry (from the React Flow "easy connect" example) ──
function nodeIntersection(a: InternalNode, b: InternalNode) {
  const w = (a.measured.width ?? 0) / 2;
  const h = (a.measured.height ?? 0) / 2;
  const pa = a.internals.positionAbsolute;
  const pb = b.internals.positionAbsolute;
  const x2 = pa.x + w;
  const y2 = pa.y + h;
  const x1 = pb.x + (b.measured.width ?? 0) / 2;
  const y1 = pb.y + (b.measured.height ?? 0) / 2;
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const k = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = k * xx1;
  const yy3 = k * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function sideOf(n: InternalNode, p: { x: number; y: number }): Position {
  const { x, y } = n.internals.positionAbsolute;
  const w = n.measured.width ?? 0;
  const h = n.measured.height ?? 0;
  if (Math.round(p.x) <= Math.round(x) + 1) return Position.Left;
  if (Math.round(p.x) >= Math.round(x + w) - 1) return Position.Right;
  if (Math.round(p.y) <= Math.round(y) + 1) return Position.Top;
  if (Math.round(p.y) >= Math.round(y + h) - 1) return Position.Bottom;
  return Position.Top;
}

export function floatingParams(source: InternalNode, target: InternalNode) {
  const s = nodeIntersection(source, target);
  const t = nodeIntersection(target, source);
  return { sx: s.x, sy: s.y, tx: t.x, ty: t.y, sourcePos: sideOf(source, s), targetPos: sideOf(target, t) };
}
