import { findRule } from '../data/rules';
import { SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';
import type { SavedDiagram, SavedNode } from '../store';

// A share link carries the whole design in the URL, so it needs no server and no account.
// Short keys keep links short: v = format version, n = pieces, e = arrows, t = title, u = uses, g = goal.
// A null label means the team cleared the name on purpose, so the real service name shows.
type PieceRow = [service: string, x: number, y: number, label?: string | null, demand?: number, bots?: number, note?: string];
interface Packed {
  v: 1;
  n: PieceRow[];
  e: [number, number][];
  t?: string;
  u?: Record<string, string>;
  g?: string;
}

const MAX_PIECES = 80;
const MAX_TEXT = 400;

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (code: string) => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Packs a Playground design into a code for a share link. */
export function encodeDesign(d: SavedDiagram): string {
  const index = new Map(d.nodes.map((n, i) => [n.id, i]));
  const packed: Packed = {
    v: 1,
    n: d.nodes.map((n) => {
      const label = n.label === '' ? null : (n.label ?? '');
      const row: PieceRow = [n.service, Math.round(n.pos.x), Math.round(n.pos.y), label, n.source?.demand, n.source?.bots, n.note ?? ''];
      // Trim unused values off the end of each row. A source's 0 is kept, so it doesn't come back as the default.
      while (row.length > 3 && (row[row.length - 1] === '' || row[row.length - 1] === undefined)) row.pop();
      return row;
    }),
    e: d.edges.flatMap((e) => {
      const s = index.get(e.source);
      const t = index.get(e.target);
      return s === undefined || t === undefined ? [] : [[s, t] as [number, number]];
    }),
  };
  if (d.plan?.title) packed.t = d.plan.title;
  const uses = Object.entries(d.plan?.uses ?? {}).filter(([, v]) => v);
  if (uses.length) packed.u = Object.fromEntries(uses) as Record<string, string>;
  if (d.goal?.what) packed.g = d.goal.what;
  return toBase64Url(JSON.stringify(packed));
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.slice(0, MAX_TEXT) : undefined;
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
const isService = (v: unknown): v is ServiceId => typeof v === 'string' && Object.hasOwn(SERVICES, v);

/**
 * Unpacks a share code. Anything it can't trust is left out: unknown services, arrows Spark doesn't allow, and
 * oversized text. Returns null when the code isn't a Spark design at all.
 */
export function decodeDesign(code: string): SavedDiagram | null {
  let packed: Packed;
  try {
    packed = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!packed || packed.v !== 1 || !Array.isArray(packed.n) || !Array.isArray(packed.e)) return null;

  const ids: (string | null)[] = [];
  const nodes: SavedNode[] = [];
  for (const [i, row] of packed.n.slice(0, MAX_PIECES).entries()) {
    const [service, x, y, label, demand, bots, note] = Array.isArray(row) ? row : [];
    const px = num(x, -5000, 5000);
    const py = num(y, -5000, 5000);
    if (!isService(service) || px === undefined || py === undefined) {
      ids.push(null);
      continue;
    }
    const id = `p${i}`;
    ids.push(id);
    const isSource = !!SERVICES[service].source;
    nodes.push({
      id,
      service,
      pos: { x: px, y: py },
      label: label === null ? '' : text(label)?.slice(0, 40),
      note: text(note),
      source: isSource ? { demand: num(demand, 0, 500) ?? 50, bots: num(bots, 0, 500) || undefined } : undefined,
    });
  }
  if (!nodes.length) return null;

  const serviceOf = new Map(nodes.map((n) => [n.id, n.service]));
  const seen = new Set<string>();
  const edges = packed.e.flatMap((pair) => {
    const [s, t] = Array.isArray(pair) ? pair : [];
    const source = typeof s === 'number' ? ids[s] : null;
    const target = typeof t === 'number' ? ids[t] : null;
    // Skip repeats too: an edited link could list the same arrow twice, and the simulation would count it twice.
    if (!source || !target || source === target || seen.has(`${source}>${target}`)) return [];
    seen.add(`${source}>${target}`);
    return findRule(serviceOf.get(source)!, serviceOf.get(target)!) ? [{ source, target }] : [];
  });

  const uses: Partial<Record<ServiceId, string>> = {};
  for (const [k, v] of Object.entries(packed.u ?? {})) {
    const t = text(v);
    if (isService(k) && t) uses[k] = t.slice(0, 120);
  }
  const title = text(packed.t)?.slice(0, 60) ?? '';
  const what = text(packed.g)?.slice(0, 80);
  return {
    nodes,
    edges,
    plan: title || Object.keys(uses).length ? { title, uses } : undefined,
    goal: what ? { what } : undefined,
  };
}
