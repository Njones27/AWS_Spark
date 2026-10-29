import { MapScene } from '../components/art/Scenery';
import { Sparky } from '../components/art/Sparky';
import { TopBar } from '../components/Chrome';
import { CHAPTER, LEVELS } from '../data/levels';
import { iconUrl } from '../data/services';
import { bt } from '../data/text';
import { href } from '../router';
import { useApp, useBand } from '../store';

// Stop positions in the 1000×600 map space.
const STOPS = [
  { x: 90, y: 500 },
  { x: 250, y: 430 },
  { x: 170, y: 290 },
  { x: 330, y: 200 },
  { x: 510, y: 260 },
  { x: 610, y: 410 },
  { x: 790, y: 450 },
  { x: 880, y: 310 },
  { x: 780, y: 170 },
];

export function isUnlocked(index: number, completed: string[], unlockAll: boolean) {
  return unlockAll || index === 0 || completed.includes(LEVELS[index - 1].id);
}

export function LevelMap() {
  const band = useBand();
  const completed = useApp((s) => s.completed);
  const unlockAll = useApp((s) => s.unlockAll);
  const setUnlockAll = useApp((s) => s.setUnlockAll);
  const nextIndex = LEVELS.findIndex((l, i) => !completed.includes(l.id) && isUnlocked(i, completed, unlockAll));
  const progress = LEVELS.filter((l) => completed.includes(l.id)).length;
  const finished = progress === LEVELS.length;

  return (
    <div className="screen map-screen">
      <TopBar back={{ href: href.home, label: 'Home' }} title={<><small>Chapter 1</small> {CHAPTER.title}</>} />
      <main className="map-main">
        <div className="map-board">
          <MapScene stops={STOPS} progress={progress} />
          {LEVELS.map((l, i) => {
            const done = completed.includes(l.id);
            const open = isUnlocked(i, completed, unlockAll);
            const p = STOPS[i];
            return (
              <a
                key={l.id}
                href={open ? href.level(l.id) : undefined}
                aria-disabled={!open}
                className={`stop ${done ? 'is-done' : ''} ${open ? 'is-open' : 'is-locked'} ${i === nextIndex ? 'is-next' : ''}`}
                style={{ left: `${p.x / 10}%`, top: `${p.y / 6}%` }}
                title={open ? `${l.number}. ${l.title}` : 'Finish the level before to unlock'}
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
                ? bt(CHAPTER.ending, band)
                : nextIndex >= 0
                  ? `Next up: “${LEVELS[nextIndex].title}”. ${bt(LEVELS[nextIndex].goal, band)}`
                  : CHAPTER.blurb}
            </p>
          </div>
          {nextIndex >= 0 && (
            <a className="btn btn-primary btn-lg" href={href.level(LEVELS[nextIndex].id)}>
              {progress ? 'Keep going' : 'Start the story'} ▶
            </a>
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
