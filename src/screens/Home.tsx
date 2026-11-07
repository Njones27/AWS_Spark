import { TownScene } from '../components/art/Scenery';
import { Sparky } from '../components/art/Sparky';
import { BuilderKeyButton } from '../components/BuilderKey';
import { BandPicker, BandSwitch, LangSwitch, ThemeSwitch } from '../components/Chrome';
import { ADVANCED } from '../data/advanced';
import { STORY } from '../data/chapters';
import { iconUrl, playgroundCatalog } from '../data/services';
import { href } from '../router';
import { useApp, useBand } from '../store';
import { Icon } from '../components/Icon';
import { useT, type MessageKey } from '../i18n';

/** Each Story Mode chapter's line on its card. */
const STORY_BLURB: Record<string, MessageKey> = { ch1: 'home.story.ch1', ch2: 'home.story.ch2' };

export function Home() {
  const t = useT();
  const band = useApp((s) => s.band);
  const completed = useApp((s) => s.completed);
  // The Playground offers fewer pieces at Explorer, so the count follows the chosen band.
  const pieceCount = playgroundCatalog(useBand()).length;
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
          <span className="wordmark-spark" aria-hidden="true">
            <Icon name="bolt" size={24} />
          </span> Spark
        </span>
        <div className="topbar-actions">
          <BuilderKeyButton variant="chip" />
          <ThemeSwitch />
          <LangSwitch />
          <BandSwitch />
        </div>
      </div>
      <main className="home-hero">
        <div className="home-title">
          <Sparky mood="cheer" size={120} />
          <h1>
            Spark <span>{t('home.subtitle')}</span>
          </h1>
          <p>{t('home.tagline')}</p>
        </div>
        <nav className="home-cards" aria-label={t('home.modes')}>
          <a className="mode-card mode-story" href={href.chapter(current.id)}>
            <span className="mode-icon" aria-hidden="true">
              <Icon name="book" size={30} />
            </span>
            <span className="mode-text">
              <strong>{t('home.story')}</strong>
              <span>{STORY_BLURB[current.id] ? t(STORY_BLURB[current.id]) : current.blurb}</span>
              <span className="progress" aria-label={t('home.levelsDone', { done, total: storyLevels.length })}>
                <span className="progress-bar">
                  <span style={{ width: `${(done / storyLevels.length) * 100}%` }} />
                </span>
                <span className="progress-num">
                  {done}/{storyLevels.length}
                </span>
              </span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="chevron" size={28} />
            </span>
          </a>
          <a className="mode-card mode-advanced" href={href.advanced}>
            <span className="mode-icon" aria-hidden="true">
              <Icon name="cap" size={30} />
            </span>
            <span className="mode-text">
              <strong>
                {t('home.advanced')} <span className="mode-tag">{t('home.collegeTag')}</span>
              </strong>
              <span>{t('home.advanced.blurb')}</span>
              <span
                className="progress"
                aria-label={t('home.ticketsDone', { done: advDone, total: ADVANCED.levels.length })}
              >
                <span className="progress-bar">
                  <span style={{ width: `${(advDone / ADVANCED.levels.length) * 100}%` }} />
                </span>
                <span className="progress-num">
                  {advDone}/{ADVANCED.levels.length}
                </span>
              </span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="chevron" size={28} />
            </span>
          </a>
          <a className="mode-card mode-play" href={href.playground}>
            <span className="mode-icon" aria-hidden="true">
              <img src={iconUrl('lambda')} alt="" />
            </span>
            <span className="mode-text">
              <strong>{t('home.playground')}</strong>
              <span>{t('home.playground.blurb', { count: pieceCount })}</span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="chevron" size={28} />
            </span>
          </a>
        </nav>
      </main>
      <footer className="home-foot">
        <a href={href.styleguide}>{t('home.styleGuide')}</a>
        <span>{t('home.credit')}</span>
      </footer>
      {!band && <BandPicker />}
    </div>
  );
}
