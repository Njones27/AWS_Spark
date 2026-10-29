import { explainRejection, findRule, type Rejection } from '../data/rules';
import type { EdgeKind, Rule, ServiceId } from '../data/types';

export interface GraphEdge {
  source: string;
  target: string;
  /** Arrow kind; a missing kind counts as a data arrow. */
  data?: { kind: EdgeKind };
}

export type ConnectCheck =
  | { ok: true; rule: Rule }
  | { ok: false; kind: 'self' | 'duplicate' | 'cycle' | 'rule'; rejection?: Rejection };

/**
 * True when adding a data arrow source → target would let requests loop back to where they started.
 * Only data arrows carry requests, so control and monitor arrows (e.g. EC2 → CloudWatch → Auto Scaling → EC2)
 * can close a loop safely.
 */
export function wouldCreateCycle(edges: GraphEdge[], source: string, target: string): boolean {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if ((e.data?.kind ?? 'data') === 'data') out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === source) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(out.get(n) ?? []));
  }
  return false;
}

export function checkConnection(
  edges: GraphEdge[],
  source: { id: string; service: ServiceId },
  target: { id: string; service: ServiceId },
): ConnectCheck {
  if (source.id === target.id) return { ok: false, kind: 'self' };
  if (edges.some((e) => e.source === source.id && e.target === target.id)) return { ok: false, kind: 'duplicate' };
  const rule = findRule(source.service, target.service);
  if (!rule) return { ok: false, kind: 'rule', rejection: explainRejection(source.service, target.service) };
  if (rule.kind === 'data' && wouldCreateCycle(edges, source.id, target.id)) return { ok: false, kind: 'cycle' };
  return { ok: true, rule };
}
