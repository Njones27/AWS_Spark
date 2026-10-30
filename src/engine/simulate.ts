import { findRule } from '../data/rules';
import { SERVICES } from '../data/services';
import type { ServiceId, SourceSpec } from '../data/types';

/** Share of reads a cache answers before the database is asked. */
export const CACHE_HIT = 0.8;
/** How much extra capacity an Auto Scaling group gives an EC2 piece. */
export const AUTOSCALE_FACTOR = 4;
const CACHEABLE: ServiceId[] = ['rds', 'dynamodb'];

export interface SimNode {
  id: string;
  service: ServiceId;
  capacity?: number;
  source?: SourceSpec;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
}

export type NodeStatus = 'idle' | 'ok' | 'busy' | 'overload' | 'waiting';

export interface NodeResult {
  /** Everything that arrived, bots included. */
  load: number;
  bots: number;
  capacity: number;
  dropped: number;
  waiting: number;
  blocked: number;
  status: NodeStatus;
}

export interface EdgeResult {
  flow: number;
  bots: number;
}

export type FailReason =
  | { kind: 'overload'; node: string }
  | { kind: 'deadEnd'; node: string }
  | { kind: 'missing'; need: string }
  | { kind: 'notConnected' };

export interface SourceResult {
  demand: number;
  ok: number;
  failures: { reason: FailReason; amount: number }[];
}

export interface SimResult {
  nodes: Record<string, NodeResult>;
  edges: Record<string, EdgeResult>;
  sources: Record<string, SourceResult>;
  success: boolean;
}

interface Outcome {
  p: number;
  reached: Set<string>;
  fail?: FailReason;
}

/**
 * Steady-state traffic model.
 * Forward pass: push load through the graph in topological order to find which pieces overload.
 * Backward pass: for each source, work out what share of its requests finish happily, and why the rest don't.
 * `scale` (0–1) ramps demand up for the Run animation.
 */
export function simulate(nodes: SimNode[], edges: SimEdge[], scale = 1): SimResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outs = new Map<string, SimEdge[]>();
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const scaled = new Set<string>();

  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const rule = findRule(s.service, t.service);
    if (!rule) continue;
    if (rule.kind === 'data') {
      outs.set(s.id, [...(outs.get(s.id) ?? []), e]);
      indeg.set(t.id, (indeg.get(t.id) ?? 0) + 1);
    } else if (s.service === 'autoscaling' && t.service === 'ec2') {
      scaled.add(t.id);
    }
  }

  // Kahn's algorithm; anything left over (only possible with a cycle) is appended so it still renders.
  const order: string[] = [];
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const remaining = new Map(indeg);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outs.get(id) ?? []) {
      const d = remaining.get(e.target)! - 1;
      remaining.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  for (const n of nodes) if (!order.includes(n.id)) order.push(n.id);

  const capacityOf = (n: SimNode) =>
    (n.capacity ?? SERVICES[n.service].capacity) * (scaled.has(n.id) ? AUTOSCALE_FACTOR : 1);

  const inflow = new Map<string, { h: number; b: number; qh: number; qb: number }>();
  const add = (id: string, h: number, b: number, queued: boolean) => {
    const f = inflow.get(id) ?? { h: 0, b: 0, qh: 0, qb: 0 };
    if (queued) {
      f.qh += h;
      f.qb += b;
    } else {
      f.h += h;
      f.b += b;
    }
    inflow.set(id, f);
  };

  const nodeRes: Record<string, NodeResult> = {};
  const edgeRes: Record<string, EdgeResult> = {};
  const dropRatio = new Map<string, number>();
  /** Share of each edge's requests answered from a cached copy, so they never travel it. */
  const hitRate = new Map<string, number>();

  for (const id of order) {
    const n = byId.get(id)!;
    const def = SERVICES[n.service];
    let { h, b, qh, qb } = inflow.get(id) ?? { h: 0, b: 0, qh: 0, qb: 0 };
    if (n.source) {
      h += n.source.demand * scale;
      b += (n.source.bots ?? 0) * scale;
    }
    const load = h + b + qh + qb;
    const bots = b + qb;

    let blocked = 0;
    if (def.filtersBots) {
      blocked = b + qb;
      b = 0;
      qb = 0;
    }

    const capacity = n.source ? Number.POSITIVE_INFINITY : capacityOf(n);
    const direct = h + b;
    const queued = qh + qb;
    const drop = direct > capacity ? 1 - capacity / direct : 0;
    const room = Math.max(0, capacity - direct);
    const passQueued = queued > room ? room / queued : 1;
    const waiting = queued > room ? queued - room : 0;
    dropRatio.set(id, drop);

    const oh = h * (1 - drop) + qh * passQueued;
    const ob = b * (1 - drop) + qb * passQueued;

    const children = outs.get(id) ?? [];
    const hasCache = def.forward === 'broadcast' && children.some((e) => SERVICES[byId.get(e.target)!.service].cache);
    for (const e of children) {
      const hit = def.cdnHitRate ?? (hasCache && CACHEABLE.includes(byId.get(e.target)!.service) ? CACHE_HIT : 0);
      hitRate.set(e.id, hit);
      const share = (def.forward === 'split' ? 1 / children.length : 1) * (1 - hit);
      edgeRes[e.id] = { flow: oh * share, bots: ob * share };
      add(e.target, oh * share, ob * share, !!def.queue);
    }

    const busy = (direct * (1 - drop) + queued * passQueued) / capacity;
    const status: NodeStatus =
      load <= 1e-9 ? 'idle' : drop > 1e-9 ? 'overload' : waiting > 1e-9 ? 'waiting' : busy >= 0.8 ? 'busy' : 'ok';
    nodeRes[id] = { load, bots, capacity, dropped: direct * drop, waiting, blocked, status };
  }

  // ── Backward pass: outcome distributions ─────────────────────
  const memo = new Map<string, Outcome[]>();
  const visiting = new Set<string>();

  // `cached`: the request is answered from a cached copy, so nothing from here on is asked and overloads don't
  // apply. Dead ends still do, because there would be nothing to copy.
  const evalNode = (id: string, viaQueue: boolean, cached: boolean): Outcome[] => {
    const key = `${id}|${viaQueue}|${cached}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const n = byId.get(id)!;
    const def = SERVICES[n.service];
    const base = [n.service, n.id];
    if (visiting.has(id)) return [{ p: 1, reached: new Set(base), fail: { kind: 'deadEnd', node: id } }];
    visiting.add(id);

    // Requests sent along an edge: cache hits are served from a copy, the misses really travel it.
    const along = (e: SimEdge): Outcome[] => {
      const live = evalNode(e.target, !!def.queue, cached);
      const hit = cached ? 0 : (hitRate.get(e.id) ?? 0);
      if (!hit) return live;
      return mergeOutcomes([...weigh(live, 1 - hit), ...weigh(evalNode(e.target, !!def.queue, true), hit)]);
    };

    const children = outs.get(id) ?? [];
    let rest: Outcome[];
    if (!children.length) {
      rest = [{ p: 1, reached: new Set(), fail: def.answers ? undefined : { kind: 'deadEnd', node: id } }];
    } else if (def.forward === 'split') {
      rest = children.flatMap((e) => weigh(along(e), 1 / children.length));
    } else {
      rest = children.map(along).reduce(product);
    }

    const drop = viaQueue || cached ? 0 : (dropRatio.get(id) ?? 0);
    const out: Outcome[] = rest.map((o) => ({ ...o, p: o.p * (1 - drop), reached: new Set([...o.reached, ...base]) }));
    if (drop > 0) out.push({ p: drop, reached: new Set(), fail: { kind: 'overload', node: id } });

    visiting.delete(id);
    const merged = mergeOutcomes(out);
    memo.set(key, merged);
    return merged;
  };

  const sources: Record<string, SourceResult> = {};
  for (const n of nodes) {
    if (!n.source) continue;
    const demand = n.source.demand * scale;
    const res: SourceResult = { demand, ok: 0, failures: [] };
    const fail = (reason: FailReason, amount: number) => {
      const same = res.failures.find((f) => JSON.stringify(f.reason) === JSON.stringify(reason));
      if (same) same.amount += amount;
      else res.failures.push({ reason, amount });
    };
    const children = outs.get(n.id) ?? [];
    if (!children.length) {
      fail({ kind: 'notConnected' }, demand);
    } else {
      const outcomes = children.flatMap((e) => weigh(evalNode(e.target, false, false), 1 / children.length));
      for (const o of outcomes) {
        if (o.fail) {
          fail(o.fail, o.p * demand);
          continue;
        }
        const missing = (n.source.needs ?? []).find((need) => !o.reached.has(need));
        if (missing) fail({ kind: 'missing', need: missing }, o.p * demand);
        else res.ok += o.p * demand;
      }
    }
    res.failures = res.failures.filter((f) => f.amount > 1e-9).sort((a, b) => b.amount - a.amount);
    sources[n.id] = res;
  }

  const list = Object.values(sources);
  const success = list.length > 0 && list.every((s) => s.demand > 0 && s.ok >= s.demand * 0.999);
  return { nodes: nodeRes, edges: edgeRes, sources, success };
}

function weigh(list: Outcome[], k: number): Outcome[] {
  return list.map((o) => ({ ...o, p: o.p * k }));
}

function product(a: Outcome[], b: Outcome[]): Outcome[] {
  const out: Outcome[] = [];
  for (const x of a)
    for (const y of b)
      out.push({ p: x.p * y.p, reached: new Set([...x.reached, ...y.reached]), fail: x.fail ?? y.fail });
  return mergeOutcomes(out);
}

function mergeOutcomes(list: Outcome[]): Outcome[] {
  const map = new Map<string, Outcome>();
  for (const o of list) {
    if (o.p <= 1e-12) continue;
    const key = o.fail ? `x:${JSON.stringify(o.fail)}` : `ok:${[...o.reached].sort().join(',')}`;
    const prev = map.get(key);
    if (prev) prev.p += o.p;
    else map.set(key, { ...o, reached: o.fail ? new Set() : o.reached });
  }
  return [...map.values()];
}
