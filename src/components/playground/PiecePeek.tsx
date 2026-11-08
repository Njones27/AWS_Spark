import type { ReactNode } from 'react';
import { iconUrl, SERVICES } from '../../data/services';
import type { ServiceId } from '../../data/types';
import { useBand } from '../../store';
import { displayName, type PieceNode } from '../canvas/model';
import { Icon } from '../Icon';
import { arrowTargets, ServiceLinks } from '../ServiceCard';
import { ProjectNotes } from './ProjectNotes';

interface Props {
  piece: PieceNode;
  available?: ServiceId[];
  open: boolean;
  /** True until this piece's details have been opened once, so a new piece doesn't stay unnamed by accident. */
  dot: boolean;
  onToggle: () => void;
  onChange: (patch: { label?: string; note?: string }) => void;
  /** The visitor and gremlin sliders, for a piece that makes its own traffic. */
  traffic?: ReactNode;
}

/**
 * The phone's details for a selected piece. It starts as a slim card along the bottom of the map, so the map stays in
 * view, and grows into a short panel when the student taps Edit. Name, arrows and traffic are folded sections.
 */
export function PiecePeek({ piece, available, open, dot, onToggle, onChange, traffic }: Props) {
  const band = useBand();
  const { service } = piece.data;
  const def = SERVICES[service];
  const { to } = arrowTargets(service, band === 'architect', available);
  const name = displayName(piece.data).main;
  const bodyId = `piece-peek-${piece.id}`;
  return (
    <section
      className={`piece-peek cat-${def.category}${open ? ' is-open' : ''}`}
      aria-label={`${name} details`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      <button className="piece-peek-row" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <img src={iconUrl(service)} alt="" />
        <span className="piece-peek-title">
          <strong>{name}</strong>
          <small>{def.name}</small>
        </span>
        <span className="piece-peek-edit">
          {open ? 'Done' : 'Edit'}
          <Icon name="chevron" />
          {dot && (
            <span className="notify-dot">
              <span className="sr-only">, not opened yet</span>
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="piece-peek-body" id={bodyId}>
          <p className="piece-peek-blurb">{def.blurb[band]}</p>
          <details className="peek-section" open>
            <summary>
              Name and notes <Icon name="chevron" />
            </summary>
            <ProjectNotes piece={piece} onChange={onChange} />
          </details>
          <details className="peek-section">
            <summary>
              Arrows
              <span className="peek-count">{to.length === 1 ? '1 piece' : `${to.length} pieces`}</span>
              <Icon name="chevron" />
            </summary>
            <ServiceLinks service={service} available={available} />
          </details>
          {traffic && (
            <details className="peek-section">
              <summary>
                Traffic <Icon name="chevron" />
              </summary>
              {traffic}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
