import { targetsOf } from '../data/rules';
import { iconUrl, SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';
import { useBand } from '../store';

/** Info card for a selected piece: what it is, and what it can connect to. */
export function ServiceCard({ service, label, onClose }: { service: ServiceId; label?: string; onClose?: () => void }) {
  const band = useBand();
  const def = SERVICES[service];
  const to = targetsOf(service).filter((t) => t !== 'cloudwatch' || band === 'architect');
  const short = (id: ServiceId) => (band === 'architect' ? SERVICES[id].name.replace(/^(Amazon|AWS) /, '') : SERVICES[id].nickname);
  return (
    <section className={`service-card cat-${def.category}`} aria-label={`${def.nickname} info`}>
      <header>
        <img src={iconUrl(service)} alt="" />
        <div>
          <h3>{label ?? (band === 'architect' ? def.name : def.nickname)}</h3>
          <p className="service-card-real">{band === 'architect' ? def.nickname : def.name}</p>
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
              <span key={t} className="chip">
                <img src={iconUrl(t)} alt="" />
                {short(t)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="service-card-end">🏁 This is an end stop. Arrows go in, but not out.</p>
      )}
    </section>
  );
}
