import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import { displayName, isPiece, toSim, type PieceData } from '../components/canvas/model';
import { PieceDock } from '../components/canvas/PieceDock';
import { DEFAULT_SOURCE, DEFAULT_TOWN_LABEL, fromSaved, isBlank, PLAY_CLOUD, toSaved } from '../components/canvas/saved';
import { useDiagram, useDropPiece } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import { GoalCard } from '../components/playground/GoalCard';
import { JudgePanel } from '../components/playground/JudgePanel';
import { PlanExport } from '../components/playground/PlanExport';
import { ProjectNotes } from '../components/playground/ProjectNotes';
import { OpenShared, ShareDialog } from '../components/playground/ShareDialog';
import { StarterPicker } from '../components/playground/StarterPicker';
import { ServiceCard } from '../components/ServiceCard';
import { topProblem } from '../data/feedback';
import { CATEGORIES, SERVICE_LIST } from '../data/services';
import type { SourceSpec } from '../data/types';
import { judgeQuestions } from '../engine/judge';
import { decodeDesign } from '../engine/share';
import { simulate } from '../engine/simulate';
import { href } from '../router';
import { useApp, useBand, type PlanInfo, type SavedDiagram } from '../store';

const EMPTY_PLAN: PlanInfo = { title: '', uses: {} };

export function Playground({ share }: { share?: string }) {
  return (
    <ReactFlowProvider>
      <PlaygroundInner share={share} />
    </ReactFlowProvider>
  );
}

function PlaygroundInner({ share }: { share?: string }) {
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
  const [shared, setShared] = useState<{ design: SavedDiagram | null } | null>(null);
  const [showStarters, setShowStarters] = useState(
    () => !share && isBlank(useApp.getState().playground ?? { nodes: [], edges: [] }),
  );
  // Read a share link, then take the design out of the address bar so a reload doesn't ask again.
  useEffect(() => {
    if (!share) return;
    setShared({ design: decodeDesign(share) });
    setShowStarters(false);
    window.history.replaceState(null, '', `${window.location.pathname}#/playground`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [share]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const drop = useDropPiece(d.setNodes, PLAY_CLOUD);

  // Save (debounced) whenever the diagram, plan, or goal changes.
  useEffect(() => {
    const t = window.setTimeout(() => savePlayground(toSaved(d.nodes, d.edges, { plan, goal })), 400);
    return () => window.clearTimeout(t);
  }, [d.nodes, d.edges, plan, goal, savePlayground]);

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

  return (
    <div className="screen playground-screen">
      <TopBar back={{ href: href.home, label: 'Home' }} title="Playground">
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (!window.confirm('Clear the playground and start fresh?')) return;
            load(null);
            setShowStarters(true);
          }}
        >
          🧹 Clear
        </button>
        <button className="btn btn-ghost" onClick={() => setShowStarters(true)}>
          ✨ Starters
        </button>
        <button
          className="btn btn-ghost"
          aria-pressed={showJudge}
          onClick={() => {
            setSelected(null);
            setShowJudge((j) => !j);
          }}
        >
          🎤 Judge practice
        </button>
        <button className="btn btn-ghost" onClick={() => setShowShare(true)}>
          🔗 Share
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelected(null);
            setShowPlan(true);
          }}
        >
          📄 Our AWS plan
        </button>
      </TopBar>

      <div className="play-body">
        <aside className="catalog" aria-label="Pieces">
          <input
            className="search"
            type="search"
            placeholder={band === 'explorer' ? 'Find a piece…' : 'Search services…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="muted small">Drag a piece onto the map, or tap it to drop it in.</p>
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
                    drop(service, at, service === 'users' ? { label: DEFAULT_TOWN_LABEL, source: DEFAULT_SOURCE } : undefined)
                  }
                />
              </section>
            );
          })}
        </aside>

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
            <button className={`btn btn-run ${running ? 'is-stop' : ''}`} onClick={() => setRunning((r) => !r)}>
              {running ? '■ Stop' : '▶ Run'}
            </button>
          </div>
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
          ok={!!shared.design}
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
