import { findRule } from '../data/rules';
import { SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';

/**
 * Badges each piece wears: badge services (IAM, KMS, Fargate…) don't carry requests;
 * their control arrows pin their icon on the piece they point at.
 */
export function badgesFor(
  nodes: { id: string; service: ServiceId }[],
  edges: { source: string; target: string }[],
): Record<string, ServiceId[]> {
  const serviceOf = new Map(nodes.map((n) => [n.id, n.service]));
  const out: Record<string, ServiceId[]> = {};
  for (const e of edges) {
    const from = serviceOf.get(e.source);
    const to = serviceOf.get(e.target);
    if (!from || !to || !SERVICES[from].badge || findRule(from, to)?.kind !== 'control') continue;
    const list = (out[e.target] ??= []);
    if (!list.includes(from)) list.push(from);
  }
  return out;
}
