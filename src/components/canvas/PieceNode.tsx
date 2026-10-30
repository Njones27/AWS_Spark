import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { findRule } from '../../data/rules';
import { iconUrl, SERVICES } from '../../data/services';
import type { Band } from '../../data/types';
import type { NodeResult } from '../../engine/simulate';
import { useBand } from '../../store';
import { displayName, useSim, useUi, type PieceNode as PieceNodeType } from './model';

const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? Math.round(n).toString() : n.toFixed(n % 1 ? 1 : 0));

function Meter({ r, band }: { r: NodeResult; band: Band }) {
  if (r.status === 'idle') return null;
  const finite = Number.isFinite(r.capacity);
  const unit = band === 'architect' ? ' req/s' : '';
  if (r.blocked > 0.5) {
    return <div className="meter-note note-blocked">🛡️ {fmt(r.blocked)} bots blocked</div>;
  }
  if (!finite) {
    return (
      <div className="meter-note">
        {band === 'explorer' ? '➜ passing through' : `${fmt(r.load)}${unit} passing`}
      </div>
    );
  }
  const fill = Math.min(1, (r.load - r.waiting) / r.capacity);
  const face = r.status === 'overload' ? '😵' : r.status === 'busy' || r.status === 'waiting' ? '😅' : '🙂';
  return (
    <div className={`meter meter-${r.status}`} aria-label={`${Math.round(r.load)} of ${r.capacity} capacity`}>
      <div className="meter-bar">
        <div className="meter-fill" style={{ width: `${fill * 100}%` }} />
      </div>
      <div className="meter-text">
        {band === 'explorer' ? face : `${fmt(r.load - r.waiting)} / ${fmt(r.capacity)}${unit}`}
      </div>
      {r.waiting > 0.5 && <div className="meter-wait">🎟️ {fmt(r.waiting)} waiting in line</div>}
    </div>
  );
}

function PieceNodeView({ id, data, selected }: NodeProps<PieceNodeType>) {
  const band = useBand();
  const { result } = useSim();
  const { wiggleId, badges } = useUi();
  const { deleteElements } = useReactFlow();
  const def = SERVICES[data.service];
  const names = displayName(data, band);
  const r = result?.nodes[id];
  const status = r?.status ?? 'idle';
  const canSend = data.service !== 'phone';

  return (
    <div
      className={[
        'piece',
        `cat-${def.category}`,
        `status-${status}`,
        data.source ? 'is-source' : '',
        data.locked ? 'is-locked' : '',
        selected ? 'is-selected' : '',
        wiggleId === id ? 'wiggle' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} className="target-cover" isConnectableStart={false} />
      <div className="piece-tile">
        <img src={iconUrl(data.service)} alt="" draggable={false} />
        {data.source?.far && <span className="piece-badge badge-far" title="Far away">🌊 far</span>}
        {badges[id] && (
          <span className="piece-badges">
            {badges[id].map((b) => {
              const giver = displayName({ service: b }, band).main;
              const label = `${giver} ${findRule(b, data.service)?.verb ?? 'helps'} this piece`;
              return <img key={b} src={iconUrl(b)} alt={label} title={label} draggable={false} />;
            })}
          </span>
        )}
      </div>
      <div className="piece-name">{names.main}</div>
      {names.sub && <div className="piece-sub">{names.sub}</div>}
      {data.source && (
        <div className="piece-demand">
          <span>👥 {data.source.demand}</span>
          {!!data.source.bots && <span className="bots">👾 {data.source.bots}</span>}
        </div>
      )}
      {r && <Meter r={r} band={band} />}
      {selected && !data.locked && (
        <button
          className="piece-remove nodrag"
          aria-label="Put back in the tray"
          title="Put back"
          onClick={(e) => {
            e.stopPropagation();
            deleteElements({ nodes: [{ id }] });
          }}
        >
          ✕
        </button>
      )}
      {data.locked && <span className="piece-pin" title="Part of the level">📌</span>}
      {canSend && (
        <Handle type="source" position={Position.Right} className="nub" aria-label="Drag to connect">
          <span className="nub-plus">+</span>
        </Handle>
      )}
    </div>
  );
}

export const PieceNode = memo(PieceNodeView);
