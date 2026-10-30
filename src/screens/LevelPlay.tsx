import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rosa, Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import { isPiece, makeEdge, makePiece, toSim, zoneNodes, displayName, type AppNode, type Rect } from '../components/canvas/model';
import { PieceDock, type DockItemSpec } from '../components/canvas/PieceDock';
import { useDiagram, useDropPiece } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import { ServiceCard } from '../components/ServiceCard';
import { ServiceChip } from '../components/ServiceTip';
import { topProblem } from '../data/feedback';
import { CHAPTER, LEVELS, levelById, type Level, type Mood } from '../data/levels';
import { iconUrl, SERVICES } from '../data/services';
import { bt } from '../data/text';
import type { ServiceId } from '../data/types';
import { simulate, type SimResult } from '../engine/simulate';
import { go, href } from '../router';
import { useApp, useBand } from '../store';

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
    <ReactFlowProvider key={level.id}>
      <LevelInner level={level} />
    </ReactFlowProvider>
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
  const complete = useApp((s) => s.complete);
  const init = useCallback(() => buildLevel(level), [level]);
  const d = useDiagram(init);
  const [phase, setPhase] = useState<Phase>('intro');
  const [beat, setBeat] = useState(0);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [hints, setHints] = useState(level.number === 1 || band === 'explorer' ? 1 : 0);
  const [selected, setSelected] = useState<string | null>(null);
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
  const dock: DockItemSpec[] = level.palette.map((p) => ({
    service: p.service,
    left: p.count - pieces.filter((n) => !n.data.locked && n.data.service === p.service).length,
    isNew: level.teaches.includes(p.service),
  }));

  const run = () => {
    setSelected(null);
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
        if (final.success) {
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

  const next = LEVELS[LEVELS.indexOf(level) + 1];
  const selectedNode = pieces.find((n) => n.id === selected);
  const sources = pieces.filter((n) => n.data.source);

  let sparkyMood: Mood = 'happy';
  let sparkyText = bt(level.goal, band);
  if (phase === 'running') {
    sparkyMood = 'think';
    sparkyText = band === 'explorer' ? 'Here come the visitors! Watch the dots…' : 'Here comes the traffic. Watch the meters!';
  } else if (phase === 'fail' && problem) {
    sparkyMood = 'worried';
    sparkyText = problem.text;
  } else if (phase === 'win') {
    sparkyMood = 'cheer';
    sparkyText = 'Everyone got what they needed. You did it!';
  }

  return (
    <div className={`screen level-screen phase-${phase}`}>
      <TopBar
        back={{ href: href.map, label: 'Map' }}
        title={
          <>
            <small>Level {level.number}</small> {level.title}
          </>
        }
      >
        <button
          className="btn btn-ghost"
          onClick={() => {
            stop();
            d.reset(buildLevel(level));
            setSelected(null);
          }}
          title="Start this level over"
        >
          ↺ Restart
        </button>
      </TopBar>

      <div className="level-body">
        <aside className="story-panel">
          <div className={`speech speech-${sparkyMood}`} aria-live="polite">
            <Sparky mood={sparkyMood} size={78} />
            <p>{sparkyText}</p>
          </div>

          <section className="goals" aria-label="Goals">
            <h3>Goals</h3>
            {sources.map((n) => {
              const res = sim?.sources[n.id];
              const ok = res && res.ok >= res.demand * 0.999 && res.demand > 0;
              const state = !res ? 'pending' : phase === 'running' ? 'live' : ok ? 'ok' : 'bad';
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

          {selectedNode && (
            <ServiceCard
              service={selectedNode.data.service}
              label={selectedNode.data.label}
              available={available}
              onClose={() => setSelected(null)}
            />
          )}
        </aside>

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
          <div className="canvas-dock">
            <PieceDock items={dock} onDrop={(service, at) => drop(service, at)} />
            {phase === 'running' || phase === 'fail' ? (
              <button className="btn btn-run is-stop" onClick={stop}>
                ■ {phase === 'fail' ? 'Keep building' : 'Stop'}
              </button>
            ) : (
              <button className="btn btn-run" onClick={run} disabled={phase === 'intro' || phase === 'win'}>
                ▶ Run
              </button>
            )}
          </div>

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
                <p className="eyebrow">Level {level.number} complete!</p>
                <h2 id="win-title">{level.lesson.title}</h2>
                <p>{bt(level.lesson.text, band)}</p>
                <div className="win-learned">
                  {level.teaches.map((s) => (
                    <ServiceChip key={s} service={s} full />
                  ))}
                </div>
                {!next && <p className="win-ending">{bt(CHAPTER.ending, band)}</p>}
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={stop}>
                    Keep tinkering
                  </button>
                  {next ? (
                    <a className="btn btn-primary btn-lg" href={href.level(next.id)}>
                      Next: {next.title} ›
                    </a>
                  ) : (
                    <a className="btn btn-primary btn-lg" href={href.map}>
                      Back to the map ›
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </BuilderCanvas>
      </div>
    </div>
  );
}

function StoryIntro({ level, beat, onNext, onSkip }: { level: Level; beat: number; onNext: () => void; onSkip: () => void }) {
  const band = useBand();
  const b = level.intro[beat];
  const last = beat === level.intro.length - 1;
  return (
    <div className="modal-backdrop in-canvas">
      <div className={`modal story-card who-${b.who}`} role="dialog" aria-modal="true" aria-label={`Story: ${level.title}`}>
        <p className="eyebrow">
          Level {level.number} · {level.concept}
        </p>
        <h2>{level.title}</h2>
        <div className="story-line" key={beat}>
          <div className="story-face">{b.who === 'sparky' ? <Sparky mood={b.mood ?? 'happy'} size={96} /> : <Rosa size={88} />}</div>
          <div className="story-say">
            <span className="story-who">{b.who === 'sparky' ? 'Sparky' : 'Baker Rosa'}</span>
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
