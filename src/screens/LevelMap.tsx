import { MapScene } from '../components/art/Scenery';
import { Sparky } from '../components/art/Sparky';
import { TopBar } from '../components/Chrome';
import type { Chapter } from '../data/levels';
import { iconUrl } from '../data/services';
import { bt } from '../data/text';
import { href } from '../router';
import { useApp, useBand } from '../store';

// Stop positions in the 1000×600 map space.
const STOPS: Record<string, { x: number; y: number }[]> = {
  ch1: [
    { x: 90, y: 500 },
    { x: 250, y: 430 },
    { x: 170, y: 290 },
    { x: 330, y: 200 },
    { x: 510, y: 260 },
    { x: 610, y: 410 },
    { x: 790, y: 450 },
    { x: 880, y: 310 },
    { x: 780, y: 170 },
  ],
  adv: [
    { x: 100, y: 490 },
    { x: 270, y: 400 },
    { x: 200, y: 240 },
    { x: 400, y: 170 },
    { x: 560, y: 300 },
    { x: 720, y: 440 },
    { x: 840, y: 260 },
  ],
};

export function isUnlocked(chapter: Chapter, index: number, completed: string[], unlockAll: boolean) {
  return unlockAll || index === 0 || completed.includes(chapter.levels[index - 1].id);
}

export function LevelMap({ chapter }: { chapter: Chapter }) {
  const userBand = useBand();
  const advanced = chapter.id === 'adv';
  const band = advanced ? 'architect' : userBand;
  const levels = chapter.levels;
  const completed = useApp((s) => s.completed);
  const unlockAll = useApp((s) => s.unlockAll);
  const setUnlockAll = useApp((s) => s.setUnlockAll);
  const nextIndex = levels.findIndex((l, i) => !completed.includes(l.id) && isUnlocked(chapter, i, completed, unlockAll));
  const progress = levels.filter((l) => completed.includes(l.id)).length;
  const finished = progress === levels.length;
  const stops = STOPS[chapter.id];

  return (
    <div className={`screen map-screen ${advanced ? 'is-advanced' : ''}`}>
      <TopBar
        back={{ href: href.home, label: 'Home' }}
        title={
          <>
            <small>{chapter.eyebrow}</small> {chapter.title}
          </>
        }
        hideBand={advanced}
      >
        {advanced && <AdvancedChip />}
      </TopBar>
      <main className="map-main">
        <div className="map-board">
          <MapScene stops={stops} progress={progress} variant={advanced ? 'city' : 'town'} />
          {levels.map((l, i) => {
            const done = completed.includes(l.id);
            const open = isUnlocked(chapter, i, completed, unlockAll);
            const p = stops[i];
            return (
              <a
                key={l.id}
                href={open ? href.level(l.id) : undefined}
                aria-disabled={!open}
                className={`stop ${done ? 'is-done' : ''} ${open ? 'is-open' : 'is-locked'} ${i === nextIndex ? 'is-next' : ''}`}
                style={{ left: `${p.x / 10}%`, top: `${p.y / 6}%` }}
                title={open ? `${chapter.unit} ${l.number}. ${l.title}` : `Finish the ${chapter.unit.toLowerCase()} before to unlock`}
              >
                <span className="stop-disc">
                  {open ? <img src={iconUrl(l.teaches[0])} alt="" /> : <span aria-hidden="true">🔒</span>}
                  <span className="stop-num">{done ? '★' : l.number}</span>
                </span>
                <span className="stop-label">
                  <strong>{l.title}</strong>
                  <em>{l.concept}</em>
                </span>
              </a>
            );
          })}
        </div>
        <aside className="map-side">
          <div className="speech">
            <Sparky mood={finished ? 'cheer' : 'happy'} size={84} />
            <p>
              {finished
                ? bt(chapter.ending, band)
                : nextIndex >= 0
                  ? `Next up: “${levels[nextIndex].title}”. ${bt(levels[nextIndex].goal, band)}`
                  : chapter.blurb}
            </p>
          </div>
          {nextIndex >= 0 && (
            <a className="btn btn-primary btn-lg" href={href.level(levels[nextIndex].id)}>
              {progress ? 'Keep going' : advanced ? 'Start your first shift' : 'Start the story'} ▶
            </a>
          )}
          {advanced && (
            <p className="map-note">
              Every ticket uses real AWS names and numbers. Watch the budget: costs are rough monthly estimates for this
              game, not a price list.
            </p>
          )}
          <label className="teacher-toggle">
            <input type="checkbox" checked={unlockAll} onChange={(e) => setUnlockAll(e.target.checked)} />
            Teacher mode: unlock every level
          </label>
        </aside>
      </main>
    </div>
  );
}

/** Stands in for the band switch on Advanced Track screens, which always use Architect text. */
export function AdvancedChip() {
  return (
    <span className="btn btn-chip advanced-chip" title="The Advanced Track always uses real AWS names and numbers">
      <span aria-hidden="true">🎓</span> Advanced
      <span className="band-grades">College & up</span>
    </span>
  );
}
