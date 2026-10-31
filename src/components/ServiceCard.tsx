import { targetsOf } from '../data/rules';
import { iconUrl, SERVICES } from '../data/services';
import { ServiceChip } from './ServiceTip';
import type { ServiceId } from '../data/types';
import { useBand } from '../store';

interface Props {
  service: ServiceId;
  label?: string;
  /** The pieces that can be placed here (the tray plus the map). Targets outside it are only counted. */
  available?: ServiceId[];
  onClose?: () => void;
}

/** Info card for a selected piece: what it is, and what it can connect to. */
export function ServiceCard({ service, label, available, onClose }: Props) {
  const band = useBand();
  const def = SERVICES[service];
  const all = targetsOf(service, band === 'architect');
  const to = available ? all.filter((t) => available.includes(t)) : all;
  const more = all.length - to.length;
  return (
    <section className={`service-card cat-${def.category}`} aria-label={`${def.name} info`}>
      <header>
        <img src={iconUrl(service)} alt="" />
        <div>
          <h3>{label ?? def.name}</h3>
          {label && <p className="service-card-real">{def.name}</p>}
        </div>
        {onClose && (
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        )}
      </header>
      <p>{def.blurb[band]}</p>
      {band !== 'explorer' && Number.isFinite(def.capacity) && def.category !== 'town' && (
        <p className="service-card-cap">
          Can handle about <strong>{def.capacity}</strong> {band === 'architect' ? 'req/s' : 'visitors at once'} in this game.
        </p>
      )}
      {to.length > 0 ? (
        <div className="service-card-links">
          <span>Can send arrows to</span>
          <div>
            {to.map((t) => (
              <ServiceChip key={t} service={t} />
            ))}
            {more > 0 && <span className="chip chip-more">+{more} more</span>}
          </div>
        </div>
      ) : all.length > 0 ? (
        <p className="service-card-end">It can send arrows to other pieces, but none of them are in this tray.</p>
      ) : (
        <p className="service-card-end">🏁 This is an end stop. Arrows go in, but not out.</p>
      )}
    </section>
  );
}
