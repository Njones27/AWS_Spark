import { getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { findRule } from '../../data/rules';
import { iconUrl, SERVICES, shortName } from '../../data/services';
import type { Band, ServiceId } from '../../data/types';
import type { PlanInfo } from '../../store';
import type { AppEdge, PieceNode } from '../canvas/model';
import { useEscape } from './ShareDialog';

export const PLAN_SOURCES = 'Diagram made with Spark: Cloud Builders. Icons: AWS Architecture Icons, Amazon Web Services.';

interface Props {
  pieces: PieceNode[];
  edges: AppEdge[];
  plan: PlanInfo;
  onPlan: (plan: PlanInfo) => void;
  band: Band;
  onClose: () => void;
}

export interface PlanSummary {
  services: { service: ServiceId; notes: string[] }[];
  steps: string[];
}

/** The AWS services on the map (left to right) with the team's notes, and one sentence per arrow that carries work. */
export function summarizePlan(pieces: PieceNode[], edges: AppEdge[], band: Band): PlanSummary {
  const byX = [...pieces].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const services: PlanSummary['services'] = [];
  for (const p of byX) {
    if (SERVICES[p.data.service].category === 'town') continue;
    let entry = services.find((s) => s.service === p.data.service);
    if (!entry) services.push((entry = { service: p.data.service, notes: [] }));
    if (p.data.note) entry.notes.push(p.data.note);
  }
  const rank = new Map(byX.map((p, i) => [p.id, i]));
  const serviceOf = new Map(pieces.map((p) => [p.id, p.data.service]));
  const steps: string[] = [];
  for (const e of [...edges].sort((a, b) => (rank.get(a.source) ?? 0) - (rank.get(b.source) ?? 0))) {
    const rule = findRule(serviceOf.get(e.source)!, serviceOf.get(e.target)!);
    if (!rule || rule.kind === 'monitor') continue;
    const line = band === 'architect' ? rule.tech : rule.simple;
    if (!steps.includes(line)) steps.push(line);
  }
  return { services, steps };
}

/** Plain text of the plan, for pasting into slides or a document. */
export function planText(plan: PlanInfo, summary: PlanSummary): string {
  const lines = [`Our AWS plan${plan.title ? `: ${plan.title}` : ''}`, '', 'Services we use'];
  for (const { service, notes } of summary.services) {
    const use = plan.uses[service];
    lines.push(`- ${SERVICES[service].name}${use ? `: ${use}` : ''}`);
    for (const n of notes) lines.push(`  Why we chose it: ${n}`);
  }
  lines.push('', 'How it works');
  summary.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('', `Sources: ${PLAN_SOURCES}`);
  return lines.join('\n');
}

const PIC_W = 1200;
const PIC_H = 640;

/** "Our AWS plan": a pitch-ready card the team can copy as text or save as a picture. */
export function PlanExport({ pieces, edges, plan, onPlan, band, onClose }: Props) {
  const { getNodes } = useReactFlow();
  const card = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const summary = useMemo(() => summarizePlan(pieces, edges, band), [pieces, edges, band]);

  // Draw the map once when the card opens, the same way React Flow's "download image" example does.
  useEffect(() => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
    if (!viewport) return;
    const v = getViewportForBounds(getNodesBounds(getNodes()), PIC_W, PIC_H, 0.2, 2, 0.06);
    toPng(viewport, {
      backgroundColor: '#f7f2e8',
      width: PIC_W,
      height: PIC_H,
      style: { width: `${PIC_W}px`, height: `${PIC_H}px`, transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` },
    })
      .then(setMap)
      .catch(() => setMap(null));
  }, [getNodes]);

  useEscape(onClose);

  const copy = () => {
    const text = planText(plan, summary);
    navigator.clipboard
      .writeText(text)
      .then(() => setStatus('Copied! Paste it into your slides or document.'))
      .catch(() => setStatus('Your browser blocked copying. Select the card and copy it instead.'));
  };

  const save = () => {
    if (!card.current) return;
    setStatus('Saving the picture…');
    toPng(card.current, { backgroundColor: '#fffdf8', pixelRatio: 2 })
      .then((url) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(plan.title || 'our-aws-plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
        a.click();
        setStatus('Saved! Look in your Downloads folder.');
      })
      .catch(() => setStatus('That picture didn’t save. Try again.'));
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal plan-export" role="dialog" aria-modal="true" aria-labelledby="plan-title">
        <button className="icon-btn plan-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="plan-card" ref={card}>
          <p className="eyebrow">Ready for your pitch</p>
          <h2 id="plan-title" className="plan-heading">
            Our AWS plan:{' '}
            <input
              id="plan-title-input"
              aria-label="Project name"
              value={plan.title}
              placeholder="Name your project"
              maxLength={60}
              onChange={(e) => onPlan({ ...plan, title: e.target.value })}
            />
          </h2>
          <div className="plan-map">
            {map ? <img src={map} alt="Your map in Spark" /> : <span className="muted small">Drawing your map…</span>}
          </div>
          {summary.services.length === 0 ? (
            <p className="muted">Add some AWS pieces to your map, and they’ll show up here.</p>
          ) : (
            <table className="plan-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>What it does in our project</th>
                </tr>
              </thead>
              <tbody>
                {summary.services.map(({ service, notes }) => (
                  <tr key={service}>
                    <td className="plan-service">
                      <img src={iconUrl(service)} alt="" />
                      {SERVICES[service].name}
                    </td>
                    <td>
                      <input
                        id={`plan-use-${service}`}
                        aria-label={`What ${SERVICES[service].name} does in our project`}
                        value={plan.uses[service] ?? ''}
                        placeholder={`What does ${shortName(service)} do for you?`}
                        maxLength={120}
                        onChange={(e) => onPlan({ ...plan, uses: { ...plan.uses, [service]: e.target.value || undefined } })}
                      />
                      {notes.map((n, i) => (
                        <p key={i} className="plan-why">
                          <strong>Why we chose it:</strong> {n}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {summary.steps.length > 0 && (
            <>
              <h3 className="plan-sub">How it works</h3>
              <ol className="plan-steps">
                {summary.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          )}
          <p className="plan-sources">Sources: {PLAN_SOURCES}</p>
        </div>
        <div className="plan-actions">
          <p className="muted small" aria-live="polite">
            {status}
          </p>
          <button className="btn btn-ghost" onClick={copy}>
            Copy as text
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save as picture
          </button>
        </div>
      </div>
    </div>
  );
}
