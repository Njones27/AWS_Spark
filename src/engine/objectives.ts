import { COST, money } from '../data/costs';
import type { Level } from '../data/levels';
import { findRule } from '../data/rules';
import { SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';
import { AUTOSCALE_FACTOR, type SimEdge, type SimNode, type SimResult } from './simulate';

/** A level goal beyond "every visitor is happy": a budget, a queue that must drain, or a required arrow. */
export interface Objective {
  id: string;
  label: string;
  /** null until it can be judged (the backlog is only known after a run). */
  ok: boolean | null;
  /** Live value, e.g. "$420 of $450". */
  detail?: string;
  /** Shown by Sparky when this is what failed. */
  fail: string;
}

/** EC2 pieces with an Auto Scaling arrow, which run (and bill) AUTOSCALE_FACTOR instances. */
function scaledIds(nodes: SimNode[], edges: SimEdge[]): Set<string> {
  const svc = new Map(nodes.map((n) => [n.id, n.service]));
  return new Set(
    edges.filter((e) => svc.get(e.source) === 'autoscaling' && svc.get(e.target) === 'ec2').map((e) => e.target),
  );
}

/** Estimated monthly cost of everything on the board. */
export function costOf(nodes: SimNode[], edges: SimEdge[]): number {
  const scaled = scaledIds(nodes, edges);
  return nodes.reduce((sum, n) => sum + COST[n.service] * (scaled.has(n.id) ? AUTOSCALE_FACTOR : 1), 0);
}

/** Does node `id` match a requirement end, given as a node id or a service id? */
const matches = (n: SimNode | undefined, key: string) => !!n && (n.id === key || n.service === key);

/** Listed in the order Sparky reports them: the budget and the backlog are the incident, required arrows come after. */
export function checkObjectives(level: Level, nodes: SimNode[], edges: SimEdge[], sim: SimResult | null): Objective[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (key: string) => {
    const label = level.nodes.find((n) => n.id === key)?.label;
    const svc = byId.get(key)?.service ?? key;
    return label ?? (svc in SERVICES ? SERVICES[svc as ServiceId].name : key);
  };
  const out: Objective[] = [];

  if (level.budget !== undefined) {
    const cost = costOf(nodes, edges);
    out.push({
      id: 'budget',
      label: `Budget: ${money(level.budget)}/month`,
      ok: cost <= level.budget,
      detail: `${money(cost)} of ${money(level.budget)}`,
      fail: `Everything works, but it costs ${money(cost)} a month and the budget is ${money(level.budget)}. Find a cheaper design, or delete pieces you no longer use.`,
    });
  }

  if (level.maxBacklog !== undefined) {
    const backlog = sim ? Object.values(sim.nodes).reduce((sum, n) => sum + n.waiting, 0) : null;
    const max = level.maxBacklog;
    out.push({
      id: 'backlog',
      label: max ? `Queue backlog grows by at most ${max} req/s` : 'Every queue drains (no backlog)',
      ok: backlog === null ? null : backlog <= max + 1e-6,
      detail: backlog === null ? undefined : `${Math.round(backlog)} req/s piling up`,
      fail: `No requests were dropped, but ${Math.round(backlog ?? 0)} req/s pile up in the queue every second. It will never catch up. Add consumer capacity behind the queue.`,
    });
  }

  for (const [i, r] of (level.requires ?? []).entries()) {
    const ok = edges.some((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      return matches(s, r.from) && matches(t, r.to) && !!findRule(s!.service, t!.service);
    });
    out.push({
      id: `req${i}`,
      label: r.label,
      ok,
      fail: `Still missing: ${r.label}. Draw an arrow from ${nameOf(r.from)} to ${nameOf(r.to)}.`,
    });
  }

  return out;
}

/** The first objective that blocks a win, if any. */
export function firstFailed(objectives: Objective[]): Objective | undefined {
  return objectives.find((o) => o.ok === false);
}
