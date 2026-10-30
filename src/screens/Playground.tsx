import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import {
  displayName,
  isPiece,
  makeEdge,
  makePiece,
  toSim,
  zoneNodes,
  type AppEdge,
  type AppNode,
  type Rect,
} from '../components/canvas/model';
import { PieceDock } from '../components/canvas/PieceDock';
import { newId, useDiagram, useDropPiece } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import { ServiceCard } from '../components/ServiceCard';
import { topProblem } from '../data/feedback';
import { CATEGORIES, SERVICE_LIST } from '../data/services';
import type { SourceSpec } from '../data/types';
import { simulate } from '../engine/simulate';
import { href } from '../router';
import { useApp, useBand, type SavedDiagram } from '../store';

const TOWN: Rect = { x: -10, y: -50, width: 200, height: 700 };
const CLOUD: Rect = { x: 290, y: -120, width: 1060, height: 770 };
const DEFAULT_SOURCE: SourceSpec = { demand: 50 };

function fromSaved(saved: SavedDiagram | null): { nodes: AppNode[]; edges: AppEdge[] } {
  const pieces = saved?.nodes.length
    ? saved.nodes.map((n) => makePiece(n.id, { service: n.service, label: n.service === 'users' ? 'Townsfolk' : undefined, source: n.source }, n.pos))
    : [makePiece(newId('users'), { service: 'users', label: 'Townsfolk', source: DEFAULT_SOURCE }, { x: 30, y: 260 })];
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const edges = (saved?.edges ?? [])
    .map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      return s && t ? makeEdge(s.id, t.id, s.data.service, t.data.service) : null;
    })
    .filter((e): e is AppEdge => !!e);
  return { nodes: [...zoneNodes(TOWN, CLOUD), ...pieces], edges };
}

export function Playground() {
  return (
    <ReactFlowProvider>
      <PlaygroundInner />
    </ReactFlowProvider>
  );
}

function PlaygroundInner() {
  const band = useBand();
  const savePlayground = useApp((s) => s.savePlayground);
  const init = useCallback(() => fromSaved(useApp.getState().playground), []);
  const d = useDiagram(init);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const drop = useDropPiece(d.setNodes, CLOUD);

  // Save (debounced) whenever the diagram changes.
  useEffect(() => {
    const t = window.setTimeout(() => {
      savePlayground({
        nodes: d.nodes.filter(isPiece).map((n) => ({ id: n.id, service: n.data.service, pos: n.position, source: n.data.source })),
        edges: d.edges.map((e) => ({ source: e.source, target: e.target })),
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [d.nodes, d.edges, savePlayground]);

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
            setRunning(false);
            setSelected(null);
            d.reset(fromSaved(null));
          }}
        >
          🧹 Clear
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
                    drop(service, at, service === 'users' ? { label: 'Townsfolk', source: DEFAULT_SOURCE } : undefined)
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
          onSelect={setSelected}
          available={available}
        >
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

        {selectedNode && (
          <aside className="inspector">
            <ServiceCard
              service={selectedNode.data.service}
              label={selectedNode.data.label}
              available={available}
              onClose={() => setSelected(null)}
            />
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
    </div>
  );
}
