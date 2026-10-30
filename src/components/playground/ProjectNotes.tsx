import { alternativesOf, PICK_WHEN } from '../../data/alternatives';
import { iconUrl, SERVICES, shortName } from '../../data/services';
import type { ServiceId } from '../../data/types';
import type { PieceNode } from '../canvas/model';
import { useServiceTip } from '../ServiceTip';

interface Props {
  piece: PieceNode;
  onChange: (patch: { label?: string; note?: string }) => void;
}

/** The team's own name for a piece, why they chose it, and what else could do the same job. */
export function ProjectNotes({ piece, onChange }: Props) {
  const { service, label, note } = piece.data;
  const isTown = SERVICES[service].category === 'town';
  const others = alternativesOf(service);
  return (
    <section className="project-notes">
      <label className="field">
        <span>Name in our project</span>
        <input
          id={`piece-name-${piece.id}`}
          value={label ?? ''}
          placeholder={shortName(service)}
          maxLength={40}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
      </label>
      {!isTown && (
        <label className="field">
          <span>Why we chose it</span>
          <textarea
            id={`piece-note-${piece.id}`}
            value={note ?? ''}
            rows={3}
            maxLength={400}
            placeholder={`What made ${shortName(service)} the right fit for your project?`}
            onChange={(e) => onChange({ note: e.target.value || undefined })}
          />
        </label>
      )}
      {others.length > 0 && (
        <div className="field">
          <span>Other services that could do this</span>
          {others.map((s) => (
            <Alternative key={s} service={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function Alternative({ service }: { service: ServiceId }) {
  const { props, tip } = useServiceTip(service);
  return (
    <div className="alternative">
      <img src={iconUrl(service)} alt="" {...props} />
      <p>
        <strong>{SERVICES[service].name}</strong>. {PICK_WHEN[service]}
      </p>
      {tip}
    </div>
  );
}
