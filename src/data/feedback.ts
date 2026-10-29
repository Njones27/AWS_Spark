import type { FailReason, SimResult } from '../engine/simulate';
import { SERVICES } from './services';
import type { Band, ServiceId } from './types';

type Namer = (nodeId: string) => { name: string; service: ServiceId } | undefined;

const isService = (id: string): id is ServiceId => id in SERVICES;

/** Turn a simulation failure into one friendly sentence. */
export function explainFailure(reason: FailReason, sourceName: string, res: SimResult, nameOf: Namer, band: Band): string {
  const simple = band !== 'architect';
  switch (reason.kind) {
    case 'notConnected':
      return simple
        ? `${sourceName} isn’t connected to anything yet. Drag an arrow from their ⊕ button.`
        : `${sourceName} has no outgoing connection.`;
    case 'overload': {
      const n = nameOf(reason.node);
      const r = res.nodes[reason.node];
      if (band === 'explorer') return `Oh no! The ${n?.name} is too busy. Too many people at once!`;
      if (band === 'builder')
        return `The ${n?.name} is overloaded: ${Math.round(r.load)} visitors arrived, but it can only handle ${r.capacity}.`;
      return `${n?.name} is saturated: ${Math.round(r.load)} req/s against a capacity of ${r.capacity} req/s, so requests are being dropped.`;
    }
    case 'deadEnd': {
      const n = nameOf(reason.node);
      return simple
        ? `Requests get stuck at the ${n?.name}. It has nowhere to send them!`
        : `${n?.name} can’t answer requests by itself and has no downstream target.`;
    }
    case 'missing': {
      if (isService(reason.need)) {
        const s = SERVICES[reason.need];
        if (reason.need === 'route53')
          return simple
            ? `${sourceName} can’t find the website! They need to look up the address in the ${s.nickname} (Route 53).`
            : `${sourceName} never resolves the domain through Route 53.`;
        if (reason.need === 'cloudfront')
          return simple
            ? `It’s too slow for ${sourceName}. They’re far away and need the ${s.nickname} (CloudFront).`
            : `${sourceName} is far from the origin. Serve them through CloudFront.`;
        return simple
          ? `Requests from ${sourceName} never reach the ${s.nickname}.`
          : `Requests from ${sourceName} never reach ${s.name}.`;
      }
      const n = nameOf(reason.need);
      return `Requests from ${sourceName} never reach the ${n?.name ?? reason.need}.`;
    }
  }
}

/** The single most important problem, or null when every source is happy. */
export function topProblem(res: SimResult, nameOf: Namer, band: Band): { text: string; node?: string } | null {
  let worst: { reason: FailReason; amount: number; source: string } | null = null;
  for (const [sid, s] of Object.entries(res.sources)) {
    const f = s.failures[0];
    if (f && (!worst || f.amount > worst.amount)) worst = { ...f, source: sid };
  }
  if (!worst) return null;
  const node = 'node' in worst.reason ? worst.reason.node : undefined;
  return { text: explainFailure(worst.reason, nameOf(worst.source)?.name ?? 'Townsfolk', res, nameOf, band), node };
}
