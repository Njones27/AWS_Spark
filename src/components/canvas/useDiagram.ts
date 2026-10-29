import { useEdgesState, useNodesState, useReactFlow } from '@xyflow/react';
import { useCallback, useState } from 'react';
import type { ServiceId } from '../../data/types';
import { isPiece, makePiece, type AppEdge, type AppNode, type PieceData, type Rect } from './model';

const PIECE_W = 128;
const PIECE_H = 120;

export function useDiagram(init: () => { nodes: AppNode[]; edges: AppEdge[] }) {
  const [initial] = useState(init);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>(initial.edges);
  const reset = useCallback(
    (d: { nodes: AppNode[]; edges: AppEdge[] }) => {
      setNodes(d.nodes);
      setEdges(d.edges);
    },
    [setNodes, setEdges],
  );
  return { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange, reset };
}

/** First grid spot inside `area` that no piece is sitting on. */
export function freeSpot(nodes: AppNode[], area: Rect): { x: number; y: number } {
  const pieces = nodes.filter(isPiece);
  for (let y = area.y + 110; y < area.y + area.height - PIECE_H; y += 150) {
    for (let x = area.x + 70; x < area.x + area.width - PIECE_W; x += 170) {
      if (!pieces.some((p) => Math.abs(p.position.x - x) < 140 && Math.abs(p.position.y - y) < 130)) return { x, y };
    }
  }
  return { x: area.x + area.width / 2 - PIECE_W / 2, y: area.y + area.height / 2 - PIECE_H / 2 };
}

let seq = 0;
export const newId = (service: ServiceId) => `${service}-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Returns a handler that drops a tray piece at a screen point (or a free spot) on the canvas. */
export function useDropPiece(
  setNodes: ReturnType<typeof useDiagram>['setNodes'],
  area: Rect,
  onAdded?: (id: string) => void,
) {
  const { screenToFlowPosition } = useReactFlow();
  return useCallback(
    (service: ServiceId, at: { x: number; y: number } | null, extra?: Partial<PieceData>): boolean => {
      if (at) {
        const el = document.elementFromPoint(at.x, at.y);
        if (!el?.closest('.react-flow')) return false;
      }
      const id = newId(service);
      setNodes((ns) => {
        const pos = at ? screenToFlowPosition(at) : null;
        const position = pos ? { x: pos.x - PIECE_W / 2, y: pos.y - PIECE_H / 2 } : freeSpot(ns, area);
        return [...ns, makePiece(id, { service, ...extra }, position)];
      });
      onAdded?.(id);
      return true;
    },
    [screenToFlowPosition, setNodes, area, onAdded],
  );
}
