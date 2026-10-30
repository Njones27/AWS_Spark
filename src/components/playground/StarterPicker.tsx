import { useState } from 'react';
import { iconUrl, SERVICES } from '../../data/services';
import { STARTERS, type Starter } from '../../data/starters';
import { Sparky } from '../art/Sparky';
import { useEscape } from './ShareDialog';

interface Props {
  onPick: (starter: Starter) => void;
  onClose: () => void;
}

/** "What are you building?" Picks a working first plan for the team's kind of problem. */
export function StarterPicker({ onPick, onClose }: Props) {
  const [picked, setPicked] = useState<string>(STARTERS[1].id);
  const starter = STARTERS.find((s) => s.id === picked)!;

  useEscape(onClose);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal starter-picker" role="dialog" aria-modal="true" aria-labelledby="starter-title">
        <div className="modal-scroll">
          <div className="starter-head">
            <Sparky mood="happy" size={64} bob={false} />
            <div>
              <p className="eyebrow">Start from a plan</p>
              <h2 id="starter-title">What are you building?</h2>
            </div>
          </div>
          <p className="muted">
            Pick the kind of problem your team is solving. Spark sets up a plan that works, and you change it from there.
          </p>
          <div className="starter-grid" role="radiogroup" aria-label="Kinds of problems">
            {STARTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === picked}
                className={`starter-card ${s.id === picked ? 'is-picked' : ''}`}
                onClick={() => setPicked(s.id)}
                onDoubleClick={() => onPick(s)}
                autoFocus={s.id === picked}
              >
                <strong>{s.title}</strong>
                <small>{s.examples}</small>
                <Chain starter={s} />
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Start with a blank map
          </button>
          <button className="btn btn-primary" onClick={() => onPick(starter)}>
            Start with this plan ▶
          </button>
        </div>
      </div>
    </div>
  );
}

/** The plan's pieces in order: an arrow when a piece is fed by the one before it, a plus when it's a second branch. */
function Chain({ starter }: { starter: Starter }) {
  const { nodes, edges } = starter.diagram;
  return (
    <span className="starter-chain" aria-label={nodes.map((n) => SERVICES[n.service].name).join(', ')}>
      {nodes.map((n, i) => {
        const fed = i > 0 && edges.some((e) => e.source === nodes[i - 1].id && e.target === n.id);
        return (
          <span key={n.id} className="starter-step">
            {i > 0 && <i aria-hidden="true">{fed ? '→' : '+'}</i>}
            <img src={iconUrl(n.service)} alt="" />
          </span>
        );
      })}
    </span>
  );
}
