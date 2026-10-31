import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rosa, Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import { isPiece, makeEdge, makePiece, toSim, zoneNodes, displayName, type AppNode, type Rect } from '../components/canvas/model';
import { PieceDock, type DockItemSpec } from '../components/canvas/PieceDock';
import { useDiagram, useDropPiece } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import { Sheet, TurnTip } from '../components/PhoneChrome';
import { ServiceCard } from '../components/ServiceCard';
import { ServiceChip } from '../components/ServiceTip';
import { topProblem } from '../data/feedback';
import { chapterOf, levelById, STORY } from '../data/chapters';
import { type Level, type Mood } from '../data/levels';
import { iconUrl, SERVICES } from '../data/services';
import { bt } from '../data/text';
import type { ServiceId } from '../data/types';
import { checkObjectives, firstFailed } from '../engine/objectives';
import { useDevice } from '../device';
import { simulate, type SimResult } from '../engine/simulate';
import { go, href } from '../router';
import { BandOverride, useApp, useBand } from '../store';
import { AdvancedChip } from './LevelMap';

const RAMP_MS = 2600;
const PIECE_W = 132;
const PIECE_H = 150;

/** Fit the town and cloud backdrops snugly around the level's pieces so they render big on small screens. */
export function levelZones(level: Level): { town: Rect; cloud: Rect } {
  const ys = level.nodes.map((n) => n.pos.y);
  const top = Math.min(...ys) - 70;
  const bottom = Math.max(...ys, top + 400) + PIECE_H + 40;
  const cloudRight = Math.max(...level.nodes.filter((n) => n.pos.x > 250).map((n) => n.pos.x + PIECE_W), 0);
  return {
    town: { x: -10, y: top, width: 200, height: bottom - top },
    cloud: { x: 290, y: top - 70, width: Math.max(660, cloudRight + 80 - 290), height: bottom - top + 70 },
  };
}

export function LevelPlay({ id }: { id: string }) {
  const level = levelById(id);
  useEffect(() => {
    if (!level) go(href.map);
  }, [level]);
  if (!level) return null;
  return (
    <BandOverride.Provider value={chapterOf(level).id === 'adv' ? 'architect' : null}>
      <ReactFlowProvider key={level.id}>
        <LevelInner level={level} />
      </ReactFlowProvider>
    </BandOverride.Provider>
  );
}

function buildLevel(level: Level) {
  const zones = levelZones(level);
  const nodes: AppNode[] = [
    ...zoneNodes(zones.town, zones.cloud),
    ...level.nodes.map((n) =>
      makePiece(n.id, { service: n.service, label: n.label, capacity: n.capacity, locked: n.locked, source: n.source }, n.pos),
    ),
  ];
  const svc = (nid: string) => level.nodes.find((n) => n.id === nid)!.service;
  const edges = level.edges.map(([s, t]) => makeEdge(s, t, svc(s), svc(t))!);
  return { nodes, edges };
}

type Phase = 'intro' | 'build' | 'running' | 'win' | 'fail';

function LevelInner({ level }: { level: Level }) {
  const band = useBand();
  const chapter = chapterOf(level);
  const advanced = chapter.id === 'adv';
  const complete = useApp((s) => s.complete);
  const init = useCallback(() => buildLevel(level), [level]);
  const d = useDiagram(init);
  const [phase, setPhase] = useState<Phase>('intro');
  const [beat, setBeat] = useState(0);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [hints, setHints] = useState(level.number === 1 || band === 'explorer' ? 1 : 0);
  const [selected, setSelected] = useState<string | null>(null);
  const phone = useDevice().device === 'phone';
  const [sheet, setSheet] = useState<'mission' | 'pieces' | null>(null);
  const [dragging, setDragging] = useState(false);
  // Sheets belong to the phone layout; don't bring one back after a trip to the laptop layout.
  useEffect(() => {
    setSheet(null);
    setDragging(false);
  }, [phone]);
  const raf = useRef(0);
  const timer = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
    setSim(null);
    setPhase((p) => (p === 'intro' ? p : 'build'));
  }, []);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(timer.current);
  }, []);

  const zones = useMemo(() => levelZones(level), [level]);
  const drop = useDropPiece(d.setNodes, zones.cloud, stop);

  const pieces = d.nodes.filter(isPiece);
  // Pieces on hand: the tray, plus everything already on the map.
  const available = useMemo(
    () => [...new Set([...level.palette.map((p) => p.service), ...d.nodes.filter(isPiece).map((n) => n.data.service)])],
    [level, d.nodes],
  );
  // Pre-placed pieces can be unlocked (so they can be deleted), but they never come out of the tray.
  const preset = useMemo(() => new Set(level.nodes.map((n) => n.id)), [level]);
  const dock: DockItemSpec[] = level.palette.map((p) => ({
    service: p.service,
    left: p.count - pieces.filter((n) => !preset.has(n.id) && n.data.service === p.service).length,
    isNew: level.teaches.includes(p.service),
  }));

  const run = () => {
    setSelected(null);
    setSheet(null);
    setPhase('running');
    const g = toSim(d.nodes, d.edges);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / RAMP_MS);
      setSim(simulate(g.nodes, g.edges, 1 - Math.pow(1 - t, 3)));
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      const final = simulate(g.nodes, g.edges, 1);
      setSim(final);
      timer.current = window.setTimeout(() => {
        if (final.success && !firstFailed(checkObjectives(level, g.nodes, g.edges, final))) {
          complete(level.id);
          setPhase('win');
        } else {
          setPhase('fail');
          if (band === 'explorer') setHints((h) => Math.min(level.hints.length, h + 1));
        }
      }, 900);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const nameOf = useCallback(
    (nid: string) => {
      const n = d.nodes.find((x) => x.id === nid);
      if (!n || !isPiece(n)) return undefined;
      return { name: displayName(n.data).main, service: n.data.service };
    },
    [d.nodes, band],
  );
  const problem = useMemo(() => (phase === 'fail' && sim ? topProblem(sim, nameOf, band) : null), [phase, sim, nameOf, band]);
  // Budgets and required arrows update live as you build; the backlog is judged once a run finishes.
  const objectives = useMemo(() => {
    const g = toSim(d.nodes, d.edges);
    return checkObjectives(level, g.nodes, g.edges, phase === 'running' ? null : sim);
  }, [level, d.nodes, d.edges, sim, phase]);
  const unmet = phase === 'fail' && !problem ? firstFailed(objectives) : undefined;

  const next = chapter.levels[chapter.levels.indexOf(level) + 1];
  // After a story chapter's last level, the next story chapter (if any) is the next stop.
  const story = STORY.indexOf(chapter);
  const nextChapter = (next || story < 0) ? undefined : STORY[story + 1];
  const selectedNode = pieces.find((n) => n.id === selected);
  const sources = pieces.filter((n) => n.data.source);

  let sparkyMood: Mood = 'happy';
  let sparkyText = bt(level.goal, band);
  if (phase === 'running') {
    sparkyMood = 'think';
    sparkyText = band === 'explorer' ? 'Here come the visitors! Watch the dots…' : 'Here comes the traffic. Watch the meters!';
  } else if (phase === 'fail' && (problem || unmet)) {
    sparkyMood = 'worried';
    sparkyText = problem?.text ?? unmet!.fail;
  } else if (phase === 'win') {
    sparkyMood = 'cheer';
    sparkyText = advanced ? 'Every request served and every check green. Ticket resolved!' : 'Everyone got what they needed. You did it!';
  }

  const restart = () => {
    stop();
    d.reset(buildLevel(level));
    setSelected(null);
  };
  const sourceState = (id: string) => {
    const res = sim?.sources[id];
    const ok = res && res.ok >= res.demand * 0.999 && res.demand > 0;
    return { res, state: !res ? 'pending' : phase === 'running' ? 'live' : ok ? 'ok' : 'bad' };
  };

  const panel = (
    <>
      <div className={`speech speech-${sparkyMood}`} aria-live={phone ? undefined : 'polite'}>
        <Sparky mood={sparkyMood} size={78} />
        <p>{sparkyText}</p>
      </div>

      <section className="goals" aria-label="Goals">
        <h3>Goals</h3>
        {sources.map((n) => {
          const { res, state } = sourceState(n.id);
          return (
            <div key={n.id} className={`goal goal-${state}`}>
              <span className="goal-mark" aria-hidden="true">
                {state === 'ok' ? '✓' : state === 'bad' ? '!' : '○'}
              </span>
              <div className="goal-body">
                <strong>{n.data.label}</strong>
                <span className="goal-line">
                  {res ? `${Math.round(res.ok)} of ${Math.round(res.demand)} happy` : `${n.data.source!.demand} ${band === 'architect' ? 'req/s' : 'visitors'}`}
                  {!!n.data.source!.bots && !res && <> + {n.data.source!.bots} gremlin bots</>}
                </span>
                {!!n.data.source!.needs?.length && (
                  <span className="goal-needs">
                    must reach
                    {n.data.source!.needs.map((need) => {
                      const svc = (need in SERVICES ? need : pieces.find((p) => p.id === need)?.data.service) as ServiceId;
                      const label = need in SERVICES ? displayName({ service: svc }).main : nameOf(need)?.name;
                      return (
                        <span key={need} className="chip chip-sm" title={label}>
                          <img src={iconUrl(svc)} alt="" />
                          {label}
                        </span>
                      );
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {objectives.length > 0 && (
        <section className="goals constraints" aria-label="Constraints">
          <h3>Constraints</h3>
          {objectives.map((o) => {
            // Going over budget shows at once; a missing arrow only counts as a miss after a run.
            const state = o.ok === null ? 'pending' : o.ok ? 'ok' : phase === 'fail' || o.id === 'budget' ? 'bad' : 'pending';
            return (
              <div key={o.id} className={`goal goal-${state}`}>
                <span className="goal-mark" aria-hidden="true">
                  {state === 'ok' ? '✓' : state === 'bad' ? '!' : '○'}
                </span>
                <div className="goal-body">
                  <strong>{o.label}</strong>
                  {o.detail && <span className="goal-line">{o.detail}</span>}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="hints" aria-label="Hints">
        {level.hints.slice(0, hints).map((h, i) => (
          <p key={i} className="hint">
            <span aria-hidden="true">💡</span> {bt(h, band)}
          </p>
        ))}
        {hints < level.hints.length && (
          <button className="btn btn-ghost btn-sm" onClick={() => setHints((h) => h + 1)}>
            💡 {hints ? 'Another hint' : 'Need a hint?'}
          </button>
        )}
      </section>
    </>
  );

  const serviceCard = selectedNode && (
    <ServiceCard
      service={selectedNode.data.service}
      label={selectedNode.data.label}
      available={available}
      onClose={() => setSelected(null)}
    />
  );
  const runButton =
    phase === 'running' || phase === 'fail' ? (
      <button className="btn btn-run is-stop" onClick={stop}>
        ■ {phase === 'fail' ? 'Keep building' : 'Stop'}
      </button>
    ) : (
      <button className="btn btn-run" onClick={run} disabled={phase === 'intro' || phase === 'win'}>
        ▶ Run
      </button>
    );

  // Phone: the mission bar counts every goal, and the Pieces tab shows how many pieces are still in the tray.
  const goalsMet = sources.filter((n) => sourceState(n.id).state === 'ok').length + objectives.filter((o) => o.ok).length;
  const goalsTotal = sources.length + objectives.length;
  const budget = objectives.find((o) => o.id === 'budget');
  const piecesLeft = dock.reduce((n, p) => n + (p.left ?? 0), 0);
  const toggle = (s: 'mission' | 'pieces') => setSheet((cur) => (cur === s ? null : s));

  return (
    <div className={`screen level-screen phase-${phase}`}>
      <TopBar
        back={{ href: href.chapter(chapter.id), label: 'Map' }}
        title={
          <>
            <small>
              {chapter.unit} {level.number}
            </small>{' '}
            {level.title}
          </>
        }
        hideBand={advanced}
      >
        <button className="btn btn-ghost" onClick={restart} title="Start this level over">
          ↺ Restart
        </button>
        {advanced && <AdvancedChip />}
      </TopBar>

      <div className="level-body">
        {!phone && (
          <aside className="story-panel">
            {panel}
            {serviceCard}
          </aside>
        )}

        <BuilderCanvas
          nodes={d.nodes}
          edges={d.edges}
          onNodesChange={d.onNodesChange}
          onEdgesChange={d.onEdgesChange}
          setEdges={d.setEdges}
          sim={{ result: sim, running: phase === 'running' || phase === 'win' || phase === 'fail' }}
          onStructureChange={stop}
          onSelect={setSelected}
          available={available}
        >
          {phone ? (
            <>
              <button className={`mission-bar mission-${sparkyMood}`} onClick={() => toggle('mission')}>
                <Sparky mood={sparkyMood} size={44} bob={false} />
                <span className="mission-bar-body">
                  <span className="mission-bar-text" aria-live="polite">
                    {sparkyText}
                  </span>
                  <span className="mission-bar-meta">
                    <span>
                      Goals {goalsMet} of {goalsTotal}
                    </span>
                    {budget?.detail && <span className={budget.ok ? 'is-ok' : 'is-bad'}>{budget.detail}</span>}
                  </span>
                </span>
              </button>
              {serviceCard && !sheet && <div className="phone-info">{serviceCard}</div>}
              {!serviceCard && !sheet && <TurnTip />}
              {sheet === 'mission' && (
                <Sheet title="Mission" onClose={() => setSheet(null)}>
                  <div className="sheet-body story-sheet">{panel}</div>
                </Sheet>
              )}
              {sheet === 'pieces' && (
                <Sheet
                  title="Pieces"
                  hint="Tap a piece to drop it on the map, or drag it where you want it."
                  hidden={dragging}
                  onClose={() => setSheet(null)}
                >
                  <div className="sheet-body">
                    <PieceDock
                      items={dock}
                      onDrop={(service, at) => drop(service, at) && setSheet(null)}
                      onDragChange={setDragging}
                    />
                  </div>
                </Sheet>
              )}
            </>
          ) : (
            <div className="canvas-dock">
              <PieceDock items={dock} onDrop={(service, at) => drop(service, at)} />
              {runButton}
            </div>
          )}

          {phase === 'intro' && (
            <StoryIntro
              level={level}
              beat={beat}
              onNext={() => (beat + 1 < level.intro.length ? setBeat(beat + 1) : setPhase('build'))}
              onSkip={() => setPhase('build')}
            />
          )}

          {phase === 'win' && (
            <div className="modal-backdrop in-canvas">
              <div className="modal win-card" role="dialog" aria-modal="true" aria-labelledby="win-title">
                <Confetti />
                <Sparky mood="cheer" size={96} />
                <p className="eyebrow">
                  {chapter.unit} {level.number} {advanced ? 'resolved' : 'complete'}!
                </p>
                <h2 id="win-title">{level.lesson.title}</h2>
                <p>{bt(level.lesson.text, band)}</p>
                <div className="win-learned">
                  {level.teaches.map((s) => (
                    <ServiceChip key={s} service={s} full />
                  ))}
                </div>
                {!next && <p className="win-ending">{bt(chapter.ending, band)}</p>}
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={stop}>
                    Keep tinkering
                  </button>
                  {next ? (
                    <a className="btn btn-primary btn-lg" href={href.level(next.id)}>
                      Next: {next.title} ›
                    </a>
                  ) : nextChapter ? (
                    <a className="btn btn-primary btn-lg" href={href.chapter(nextChapter.id)}>
                      Start {nextChapter.eyebrow}: {nextChapter.title} ›
                    </a>
                  ) : (
                    <a className="btn btn-primary btn-lg" href={href.chapter(chapter.id)}>
                      Back to the map ›
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </BuilderCanvas>
      </div>

      {phone && (
        <nav className="phone-bar" aria-label="Level tools" inert={phase === 'intro' || phase === 'win' ? true : undefined}>
          <button className="phone-tab" aria-pressed={sheet === 'mission'} onClick={() => toggle('mission')}>
            <span aria-hidden="true">🎯</span> Mission
          </button>
          <button className="phone-tab" aria-pressed={sheet === 'pieces'} onClick={() => toggle('pieces')}>
            <span aria-hidden="true">🧩</span> Pieces
            {piecesLeft > 0 && <span className="phone-tab-count">{piecesLeft}</span>}
          </button>
          {runButton}
        </nav>
      )}
    </div>
  );
}

function StoryIntro({ level, beat, onNext, onSkip }: { level: Level; beat: number; onNext: () => void; onSkip: () => void }) {
  const band = useBand();
  const { cast, unit } = chapterOf(level);
  const b = level.intro[beat];
  const last = beat === level.intro.length - 1;
  return (
    <div className="modal-backdrop in-canvas">
      <div className={`modal story-card who-${b.who}`} role="dialog" aria-modal="true" aria-label={`Story: ${level.title}`}>
        <p className="eyebrow">
          {unit} {level.number} · {level.concept}
        </p>
        <h2>{level.title}</h2>
        <div className="story-line" key={beat}>
          <div className="story-face">
            {b.who === 'sparky' ? (
              <Sparky mood={b.mood ?? 'happy'} size={96} />
            ) : b.who === 'rosa' ? (
              <Rosa size={88} />
            ) : (
              <span className="pager-face" aria-hidden="true">
                🚨
              </span>
            )}
          </div>
          <div className="story-say">
            <span className="story-who">{cast[b.who]}</span>
            <p>{bt(b.text, band)}</p>
          </div>
        </div>
        <div className="story-foot">
          <span className="story-dots" aria-hidden="true">
            {level.intro.map((_, i) => (
              <i key={i} className={i === beat ? 'on' : ''} />
            ))}
          </span>
          <button className="btn btn-link" onClick={onSkip}>
            Skip
          </button>
          <button className="btn btn-primary btn-lg" onClick={onNext} autoFocus>
            {last ? 'Let’s build! ▶' : 'Next ›'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1.2,
        color: ['var(--coral)', 'var(--sun)', 'var(--flow)', 'var(--plum)', 'var(--pond-deep)'][i % 5],
        rot: Math.random() * 360,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
