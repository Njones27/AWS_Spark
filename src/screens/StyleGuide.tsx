import { ReactFlowProvider } from '@xyflow/react';
import { Bakery, House, Tree } from '../components/art/Scenery';
import { Rosa, Sparky } from '../components/art/Sparky';
import { BuilderCanvas } from '../components/canvas/BuilderCanvas';
import { makeEdge, makePiece, type AppEdge, type AppNode } from '../components/canvas/model';
import { useDiagram } from '../components/canvas/useDiagram';
import { TopBar } from '../components/Chrome';
import type { SimResult } from '../engine/simulate';
import { href } from '../router';

const SWATCHES = [
  ['--paper', 'Map paper'],
  ['--meadow', 'Meadow'],
  ['--pond', 'Pond'],
  ['--road', 'Road'],
  ['--ink', 'Ink'],
  ['--coral', 'Action'],
  ['--sun', 'Request dot'],
  ['--flow', 'Data arrow'],
  ['--plum', 'Control arrow'],
  ['--gremlin', 'Bot dot'],
  ['--ok', 'OK'],
  ['--warn', 'Busy'],
  ['--bad', 'Overload'],
];

const node = (id: string, service: any, x: number, y: number, extra = {}) => makePiece(id, { service, ...extra }, { x, y });

const DEMO_NODES: AppNode[] = [
  node('u', 'users', 0, 120, { label: 'Townsfolk', source: { demand: 120, bots: 40 }, locked: true }),
  node('waf', 'waf', 220, 120),
  node('lb', 'elb', 420, 120),
  node('ok', 'ec2', 640, 0, { label: 'Happy server' }),
  node('busy', 'ec2', 640, 170, { label: 'Busy server' }),
  node('asg', 'autoscaling', 420, 330),
  node('q', 'sqs', 860, 0),
  node('wait', 'ec2', 1060, 0, { label: 'Waiting worker', capacity: 20 }),
  node('over', 'rds', 860, 220, { label: 'Overloaded DB' }),
  node('cw', 'cloudwatch', 1060, 260),
];
const pair = (s: string, t: string) => {
  const sv = (id: string) => (DEMO_NODES.find((n) => n.id === id)!.data as { service: any }).service;
  return makeEdge(s, t, sv(s), sv(t))!;
};
const DEMO_EDGES: AppEdge[] = [
  pair('u', 'waf'),
  pair('waf', 'lb'),
  pair('lb', 'ok'),
  pair('lb', 'busy'),
  pair('asg', 'busy'),
  pair('ok', 'q'),
  pair('q', 'wait'),
  pair('busy', 'over'),
  pair('over', 'cw'),
];
const r = (load: number, capacity: number, status: any, extra = {}) => ({ load, bots: 0, capacity, dropped: 0, waiting: 0, blocked: 0, status, ...extra });
const DEMO_SIM: SimResult = {
  success: false,
  sources: {},
  nodes: {
    u: r(160, Infinity, 'ok'),
    waf: r(160, Infinity, 'ok', { blocked: 40 }),
    lb: r(120, 1000, 'ok'),
    ok: r(20, 50, 'ok'),
    busy: r(45, 50, 'busy'),
    q: r(60, Infinity, 'ok'),
    wait: r(60, 20, 'waiting', { waiting: 40 }),
    over: r(140, 60, 'overload', { dropped: 80 }),
  },
  edges: Object.fromEntries(
    DEMO_EDGES.map((e) => [e.id, { flow: e.data?.kind === 'data' ? 60 : 0, bots: e.source === 'u' ? 40 : 0 }]),
  ),
};

function DemoCanvas() {
  const d = useDiagram(() => ({ nodes: DEMO_NODES, edges: DEMO_EDGES }));
  return (
    <div className="sg-canvas">
      <BuilderCanvas
        nodes={d.nodes}
        edges={d.edges}
        onNodesChange={d.onNodesChange}
        onEdgesChange={d.onEdgesChange}
        setEdges={d.setEdges}
        sim={{ result: DEMO_SIM, running: true }}
      />
    </div>
  );
}

export function StyleGuide() {
  return (
    <div className="screen styleguide">
      <TopBar back={{ href: href.home, label: 'Home' }} title="Style guide" />
      <main className="sg-main">
        <section>
          <h2>Color</h2>
          <div className="sg-swatches">
            {SWATCHES.map(([v, name]) => (
              <div key={v} className="sg-swatch">
                <span style={{ background: `var(${v})` }} />
                <strong>{name}</strong>
                <code>{v}</code>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Type</h2>
          <p className="sg-display">Fredoka: friendly, rounded display</p>
          <p className="sg-body">
            Lexend is the body font. It was designed to make reading easier, which matters when a 2nd grader and a 12th grader share
            the same app.
          </p>
        </section>
        <section>
          <h2>Characters</h2>
          <div className="sg-row">
            {(['happy', 'think', 'worried', 'cheer'] as const).map((m) => (
              <figure key={m}>
                <Sparky mood={m} size={110} />
                <figcaption>Sparky · {m}</figcaption>
              </figure>
            ))}
            <figure>
              <Rosa size={100} />
              <figcaption>Baker Rosa</figcaption>
            </figure>
          </div>
        </section>
        <section>
          <h2>Scenery</h2>
          <svg viewBox="0 0 520 140" className="sg-scenery" aria-hidden="true">
            <rect width="520" height="140" rx="24" fill="var(--meadow)" />
            <Tree x={50} y={88} s={1.2} />
            <House x={140} y={92} />
            <House x={220} y={96} s={0.85} roof="#7c9bc4" />
            <Bakery x={360} y={80} s={0.8} />
            <Tree x={470} y={90} tone="#86b86f" />
          </svg>
        </section>
        <section>
          <h2>Pieces, arrows &amp; states</h2>
          <p className="muted">
            Teal dashed arrows carry requests (yellow dots, pink dots for bots). Purple dotted arrows are controls, like Auto
            Scaling. Grey dotted arrows report to CloudWatch. Meters fill green, then amber, then red.
          </p>
          <ReactFlowProvider>
            <DemoCanvas />
          </ReactFlowProvider>
        </section>
      </main>
    </div>
  );
}
