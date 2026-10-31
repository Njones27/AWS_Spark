import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getShare } from '../api/shares';
import { Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import { displayName, isPiece, toSim, type PieceData } from '../components/canvas/model';
import { PieceDock } from '../components/canvas/PieceDock';
import { DEFAULT_SOURCE, DEFAULT_TOWN_LABEL, fromSaved, isBlank, PLAY_CLOUD, toSaved } from '../components/canvas/saved';
import { useDiagram, useDropPiece } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import { Sheet } from '../components/PhoneChrome';
import { GoalCard } from '../components/playground/GoalCard';
import { JudgePanel } from '../components/playground/JudgePanel';
import { PlanExport } from '../components/playground/PlanExport';
import { ProjectNotes } from '../components/playground/ProjectNotes';
import { OpenShared, ShareDialog, type SharedState } from '../components/playground/ShareDialog';
import { StarterPicker } from '../components/playground/StarterPicker';
import { ServiceCard } from '../components/ServiceCard';
import { SidePanel } from '../components/SidePanel';
import { topProblem } from '../data/feedback';
import { CATEGORIES, SERVICE_LIST } from '../data/services';
import type { SourceSpec } from '../data/types';
import { useDevice } from '../device';
import { judgeQuestions } from '../engine/judge';
import { decodeDesign } from '../engine/share';
import { simulate } from '../engine/simulate';
import { href } from '../router';
import { useApp, useBand, type PlanInfo, type SavedDiagram } from '../store';

const EMPTY_PLAN: PlanInfo = { title: '', uses: {} };

/** Takes a share link out of the address bar, so a reload doesn't ask again. */
function clearShareLink() {
  window.history.replaceState(null, '', `${window.location.pathname}#/playground`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** A teammate's design from a share code, ready to ask about. */
function openCode(code: string): { design: SavedDiagram | null; state: SharedState } {
  const design = decodeDesign(code);
  return { design, state: design ? 'ready' : 'broken' };
}

/** `share` is a long link's design code; `shareId` is a short link's id. */
export function Playground({ share, shareId }: { share?: string; shareId?: string }) {
  return (
    <ReactFlowProvider>
      <PlaygroundInner share={share} shareId={shareId} />
    </ReactFlowProvider>
  );
}

function PlaygroundInner({ share, shareId }: { share?: string; shareId?: string }) {
  const band = useBand();
  const savePlayground = useApp((s) => s.savePlayground);
  const init = useCallback(() => fromSaved(useApp.getState().playground), []);
  const d = useDiagram(init);
  const [plan, setPlan] = useState<PlanInfo>(() => useApp.getState().playground?.plan ?? EMPTY_PLAN);
  const [goal, setGoal] = useState<{ what: string }>(() => useApp.getState().playground?.goal ?? { what: '' });
  // A fresh Playground opens with the starter plans, so a team doesn't face an empty map.
  const [showPlan, setShowPlan] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showJudge, setShowJudge] = useState(false);
  // A teammate's design from a share link waits here until the student says to open it.
  const [shared, setShared] = useState<{ design: SavedDiagram | null; state: SharedState } | null>(null);
  const [showStarters, setShowStarters] = useState(
    () => !share && !shareId && isBlank(useApp.getState().playground ?? { nodes: [], edges: [] }),
  );
  // Read a share link, then take the design out of the address bar so a reload doesn't ask again.
  useEffect(() => {
    if (!share) return;
    setShared(openCode(share));
    setShowStarters(false);
    clearShareLink();
  }, [share]);
  // A short link is looked up first, then opens just like a long one. The ref stops a second lookup when React runs
  // the effect twice in development; it resets once the link leaves the address bar, so the same link can be tried again.
  const lookedUp = useRef<string | null>(null);
  useEffect(() => {
    if (!shareId) {
      lookedUp.current = null;
      return;
    }
    if (lookedUp.current === shareId) return;
    lookedUp.current = shareId;
    setShared({ design: null, state: 'loading' });
    setShowStarters(false);
    clearShareLink();
    getShare(shareId)
      .then(openCode, (e): { design: null; state: SharedState } => ({
        design: null,
        state: e instanceof ApiError && e.offline ? 'offline' : 'missing',
      }))
      // Only if the student is still waiting for it, not after "Keep my map".
      .then((next) => setShared((cur) => (cur?.state === 'loading' ? next : cur)));
  }, [shareId]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const phone = useDevice().device === 'phone';
  const [piecesOpen, setPiecesOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The sheet belongs to the phone layout; don't bring it back after a trip to the laptop layout.
  useEffect(() => {
    setPiecesOpen(false);
    setDragging(false);
  }, [phone]);
  const drop = useDropPiece(d.setNodes, PLAY_CLOUD);

  // Save (debounced) whenever the diagram, plan, or goal changes.
  const lastSaved = useRef(useApp.getState().playground);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const saved = toSaved(d.nodes, d.edges, { plan, goal });
      lastSaved.current = saved;
      savePlayground(saved);
    }, 400);
    return () => window.clearTimeout(t);
  }, [d.nodes, d.edges, plan, goal, savePlayground]);
  // A newer design can arrive from the student's Builder Key while this screen is open (the start-up sync). Show it,
  // rather than letting this screen's next save put the older copy back.
  const resetDiagram = d.reset;
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.playground === prev.playground || s.playground === lastSaved.current) return;
        lastSaved.current = s.playground;
        setRunning(false);
        setSelected(null);
        resetDiagram(fromSaved(s.playground));
        setPlan(s.playground?.plan ?? EMPTY_PLAN);
        setGoal(s.playground?.goal ?? { what: '' });
      }),
    [resetDiagram],
  );

  // The playground simulates live: change anything while running and the flow updates.
  const structure = useMemo(() => toSim(d.nodes, d.edges), [d.nodes, d.edges]);
  const sim = useMemo(() => (running ? simulate(structure.nodes, structure.edges, 1) : null), [running, structure]);

  const pieces = d.nodes.filter(isPiece);
  const catalog = useMemo(() => SERVICE_LIST.filter((s) => band !== 'explorer' || s.basic), [band]);
  // Pieces on hand: this band's catalog, plus anything already on the map.
  const available = useMemo(
    () => [...new Set([...catalog.map((s) => s.id), ...d.nodes.filter(isPiece).map((n) => n.data.service)])],
    [catalog, d.nodes],
  );
  const selectedNode = pieces.find((n) => n.id === selected);
  const nameOf = (nid: string) => {
    const n = pieces.find((x) => x.id === nid);
    return n ? { name: displayName(n.data).main, service: n.data.service } : undefined;
  };
  const totals = sim
    ? Object.values(sim.sources).reduce((a, s) => ({ ok: a.ok + s.ok, demand: a.demand + s.demand }), { ok: 0, demand: 0 })
    : null;
  const problem = sim ? topProblem(sim, nameOf, band) : null;

  const q = query.trim().toLowerCase();
  const visible = catalog.filter((s) => !q || [s.name, s.job].some((t) => t.toLowerCase().includes(q)));

  /** Replaces the whole map, plan, and goal (Clear, a starter, or a teammate's link). */
  const load = (saved: SavedDiagram | null) => {
    setRunning(false);
    setSelected(null);
    d.reset(fromSaved(saved));
    setPlan(saved?.plan ?? EMPTY_PLAN);
    setGoal(saved?.goal ?? { what: '' });
  };

  const sources = pieces.filter((n) => n.data.source);
  const demand = sources.reduce((a, n) => a + (n.data.source?.demand ?? 0), 0);
  const groups = [...new Set(sources.map((n) => displayName(n.data).main))];
  // One group is named; several groups together are just "people".
  const who = groups.length === 1 ? groups[0] : 'people';
  const questions = useMemo(
    () =>
      showJudge
        ? judgeQuestions(
            pieces.map((n) => ({ id: n.id, service: n.data.service, label: n.data.label, source: n.data.source })),
            d.edges,
            band,
          )
        : [],
    // `pieces` is derived from d.nodes on every render, so depend on d.nodes itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showJudge, d.nodes, d.edges, band],
  );

  const setPiece = (id: string, patch: Partial<PieceData>) =>
    d.setNodes((ns) => ns.map((n) => (n.id === id && isPiece(n) ? { ...n, data: { ...n.data, ...patch } } : n)));
  const setSource = (id: string, patch: Partial<SourceSpec>) =>
    d.setNodes((ns) =>
      ns.map((n) => (n.id === id && isPiece(n) ? { ...n, data: { ...n.data, source: { ...(n.data.source ?? DEFAULT_SOURCE), ...patch } } } : n)),
    );

  const openPlan = () => {
    // Clear the selection so the map picture doesn't show a highlighted piece and its ✕ button.
    setSelected(null);
    d.setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setShowPlan(true);
  };
  const runButton = (
    <button
      className={`btn btn-run ${running ? 'is-stop' : ''}`}
      onClick={() => {
        setPiecesOpen(false);
        setRunning((r) => !r);
      }}
    >
      {running ? '■ Stop' : '▶ Run'}
    </button>
  );
  const pieceList = (
    <>
      <input
        className="search"
        type="search"
        placeholder={band === 'explorer' ? 'Find a piece…' : 'Search services…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="muted small">
        {/* On a phone the catalog scrolls up and down, so a drag up to the map would scroll it instead. */}
        {phone ? 'Tap a piece to drop it on the map.' : 'Drag a piece onto the map, or tap it to drop it in.'}
      </p>
      {CATEGORIES.map((c) => {
        const items = visible.filter((s) => s.category === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} className={`catalog-group cat-${c.id}`}>
            <h4>{c.label}</h4>
            <PieceDock
              size="sm"
              items={items.map((s) => ({ service: s.id }))}
              onDrop={(service, at) =>
                drop(service, at, service === 'users' ? { label: DEFAULT_TOWN_LABEL, source: DEFAULT_SOURCE } : undefined) &&
                setPiecesOpen(false)
              }
              onDragChange={setDragging}
            />
          </section>
        );
      })}
    </>
  );

  return (
    <div className="screen playground-screen">
      <TopBar back={{ href: href.home, label: 'Home' }} title="Playground">
        <button
          className="btn btn-ghost"
          title="Clear"
          aria-label="Clear"
          onClick={() => {
            if (!window.confirm('Clear the playground and start fresh?')) return;
            load(null);
            setShowStarters(true);
          }}
        >
          <span aria-hidden="true">🧹</span>
          <span className="btn-label">Clear</span>
        </button>
        <button className="btn btn-ghost" title="Starters" aria-label="Starters" onClick={() => setShowStarters(true)}>
          <span aria-hidden="true">✨</span>
          <span className="btn-label">Starters</span>
        </button>
        <button
          className="btn btn-ghost"
          aria-pressed={showJudge}
          title="Judge practice"
          aria-label="Judge practice"
          onClick={() => {
            setSelected(null);
            setShowJudge((j) => !j);
          }}
        >
          <span aria-hidden="true">🎤</span>
          <span className="btn-label">Judge practice</span>
        </button>
        <button className="btn btn-ghost" title="Share" aria-label="Share" onClick={() => setShowShare(true)}>
          <span aria-hidden="true">🔗</span>
          <span className="btn-label">Share</span>
        </button>
        {!phone && (
          <button className="btn btn-primary" title="Our AWS plan" aria-label="Our AWS plan" onClick={openPlan}>
            <span aria-hidden="true">📄</span>
            <span className="btn-label btn-label-main">Our AWS plan</span>
          </button>
        )}
      </TopBar>

      <div className="play-body">
        {!phone && (
          <SidePanel id="playground" label="Pieces" width={window.innerWidth <= 900 ? 220 : 260} className="catalog">
            {pieceList}
          </SidePanel>
        )}

        <BuilderCanvas
          nodes={d.nodes}
          edges={d.edges}
          onNodesChange={d.onNodesChange}
          onEdgesChange={d.onEdgesChange}
          setEdges={d.setEdges}
          sim={{ result: sim, running }}
          onSelect={(id) => {
            setSelected(id);
            if (id) setShowJudge(false);
          }}
          available={available}
        >
          {sources.length > 0 && (
            <GoalCard
              demand={demand}
              who={who}
              what={goal.what}
              onWhat={(what) => setGoal({ what })}
              answered={totals ? totals.ok : null}
            />
          )}
          <div className="canvas-dock canvas-dock-right">
            {running && totals && (
              <div className={`run-summary ${problem ? 'has-problem' : 'is-happy'}`} aria-live="polite">
                <Sparky mood={problem ? 'worried' : 'cheer'} size={52} bob={false} />
                <div>
                  <strong>
                    {totals.demand ? Math.round((totals.ok / totals.demand) * 100) : 0}% of requests answered
                  </strong>
                  <span>{problem ? problem.text : 'Everything flows. Nice system!'}</span>
                </div>
              </div>
            )}
            {!phone && runButton}
          </div>
          {piecesOpen && (
            <Sheet title="Pieces" hidden={dragging} onClose={() => setPiecesOpen(false)}>
              <div className="sheet-body catalog-sheet">{pieceList}</div>
            </Sheet>
          )}
        </BuilderCanvas>

        {showJudge && !selectedNode && (
          <JudgePanel questions={questions} onClose={() => setShowJudge(false)} />
        )}
        {selectedNode && (
          <aside className="inspector">
            <ServiceCard
              service={selectedNode.data.service}
              label={selectedNode.data.label || undefined}
              available={available}
              onClose={() => setSelected(null)}
            >
              <ProjectNotes piece={selectedNode} onChange={(patch) => setPiece(selectedNode.id, patch)} />
            </ServiceCard>
            {selectedNode.data.source && (
              <section className="source-controls">
                <label>
                  <span>
                    👥 Visitors <strong>{selectedNode.data.source.demand}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={10}
                    value={selectedNode.data.source.demand}
                    onChange={(e) => setSource(selectedNode.id, { demand: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>
                    👾 Gremlin bots <strong>{selectedNode.data.source.bots ?? 0}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={10}
                    value={selectedNode.data.source.bots ?? 0}
                    onChange={(e) => setSource(selectedNode.id, { bots: Number(e.target.value) })}
                  />
                </label>
              </section>
            )}
          </aside>
        )}
      </div>

      {phone && (
        <nav className="phone-bar" aria-label="Playground tools">
          <button className="phone-tab" aria-pressed={piecesOpen} onClick={() => setPiecesOpen((o) => !o)}>
            <span aria-hidden="true">🧩</span> Pieces
          </button>
          <button className="phone-tab" onClick={openPlan}>
            <span aria-hidden="true">📄</span> Our plan
          </button>
          {runButton}
        </nav>
      )}

      {showPlan && (
        <PlanExport
          pieces={pieces}
          edges={d.edges}
          plan={plan}
          onPlan={setPlan}
          band={band}
          onClose={() => setShowPlan(false)}
        />
      )}
      {showShare && <ShareDialog design={toSaved(d.nodes, d.edges, { plan, goal })} onClose={() => setShowShare(false)} />}
      {shared && (
        <OpenShared
          state={shared.state}
          onClose={() => setShared(null)}
          onOpen={() => {
            load(shared.design);
            setShared(null);
          }}
        />
      )}
      {showStarters && (
        <StarterPicker
          onClose={() => setShowStarters(false)}
          onPick={(starter) => {
            if (!isBlank(toSaved(d.nodes, d.edges, { plan, goal })) && !window.confirm('Replace your map with this starter plan?')) return;
            load(starter.diagram);
            setShowStarters(false);
          }}
        />
      )}
    </div>
  );
}
