import { TownScene } from '../components/art/Scenery';
import { Sparky } from '../components/art/Sparky';
import { BandPicker, BandSwitch } from '../components/Chrome';
import { ADVANCED } from '../data/advanced';
import { STORY } from '../data/chapters';
import { CHAPTER } from '../data/levels';
import { iconUrl, SERVICE_LIST } from '../data/services';
import { href } from '../router';
import { useApp } from '../store';

export function Home() {
  const band = useApp((s) => s.band);
  const completed = useApp((s) => s.completed);
  const storyLevels = STORY.flatMap((c) => c.levels);
  const done = completed.filter((id) => storyLevels.some((l) => l.id === id)).length;
  // Story Mode opens the first chapter that isn't finished.
  const current = STORY.find((c) => !c.levels.every((l) => completed.includes(l.id))) ?? STORY[STORY.length - 1];
  const advDone = completed.filter((id) => ADVANCED.levels.some((l) => l.id === id)).length;
  return (
    <div className="home">
      <TownScene />
      <div className="home-top">
        <span className="wordmark">
          <span className="wordmark-spark" aria-hidden="true">⚡</span> Spark
        </span>
        <BandSwitch />
      </div>
      <main className="home-hero">
        <div className="home-title">
          <Sparky mood="cheer" size={120} />
          <h1>
            Spark <span>Cloud Builders</span>
          </h1>
          <p>Connect real AWS services, watch requests flow, and help a little town go online.</p>
        </div>
        <nav className="home-cards" aria-label="Choose a mode">
          <a className="mode-card mode-story" href={href.chapter(current.id)}>
            <span className="mode-icon" aria-hidden="true">📖</span>
            <span className="mode-text">
              <strong>Story Mode</strong>
              <span>{current === STORY[0] ? CHAPTER.blurb : current.blurb}</span>
              <span className="progress" aria-label={`${done} of ${storyLevels.length} levels done`}>
                <span className="progress-bar">
                  <span style={{ width: `${(done / storyLevels.length) * 100}%` }} />
                </span>
                <span className="progress-num">
                  {done}/{storyLevels.length}
                </span>
              </span>
            </span>
            <span className="mode-go" aria-hidden="true">›</span>
          </a>
          <a className="mode-card mode-advanced" href={href.advanced}>
            <span className="mode-icon" aria-hidden="true">🎓</span>
            <span className="mode-text">
              <strong>
                Advanced Track <span className="mode-tag">College & up</span>
              </strong>
              <span>On call at Crumb & Co.: real incidents, monthly budgets, and security reviews.</span>
              <span className="progress" aria-label={`${advDone} of ${ADVANCED.levels.length} tickets done`}>
                <span className="progress-bar">
                  <span style={{ width: `${(advDone / ADVANCED.levels.length) * 100}%` }} />
                </span>
                <span className="progress-num">
                  {advDone}/{ADVANCED.levels.length}
                </span>
              </span>
            </span>
            <span className="mode-go" aria-hidden="true">›</span>
          </a>
          <a className="mode-card mode-play" href={href.playground}>
            <span className="mode-icon" aria-hidden="true">
              <img src={iconUrl('lambda')} alt="" />
            </span>
            <span className="mode-text">
              <strong>Playground</strong>
              <span>Build anything with {SERVICE_LIST.length} pieces. Only connections that make sense will snap together!</span>
            </span>
            <span className="mode-go" aria-hidden="true">›</span>
          </a>
        </nav>
      </main>
      <footer className="home-foot">
        <a href={href.styleguide}>Style guide</a>
        <span>AWS service icons © Amazon Web Services, used for teaching. Not affiliated with or endorsed by AWS.</span>
      </footer>
      {!band && <BandPicker />}
    </div>
  );
}
