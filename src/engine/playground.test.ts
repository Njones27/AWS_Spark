import { describe, expect, it } from 'vitest';
import { fromSaved, isBlank, toSaved } from '../components/canvas/saved';
import { isPiece } from '../components/canvas/model';
import { alternativesOf, PICK_WHEN } from '../data/alternatives';
import { findRule } from '../data/rules';
import { STARTERS } from '../data/starters';
import { planText, summarizePlan } from '../components/playground/PlanExport';
import { EMPTY_PROFILE, migrateSaved, type SavedDiagram } from '../store';
import { judgeQuestions, type JudgeEdge, type JudgeNode } from './judge';
import { decodeDesign, encodeDesign } from './share';
import { simulate } from './simulate';
import { wouldCreateCycle } from './validate';

const simOf = (d: SavedDiagram) =>
  simulate(
    d.nodes.map((n) => ({ id: n.id, service: n.service, source: n.source })),
    d.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target })),
  );

describe('starters', () => {
  it.each(STARTERS.map((s) => [s.id, s] as const))('%s only uses allowed arrows, has no loops, and passes', (_, s) => {
    const service = new Map(s.diagram.nodes.map((n) => [n.id, n.service]));
    for (const e of s.diagram.edges) {
      expect(findRule(service.get(e.source)!, service.get(e.target)!), `${e.source} → ${e.target}`).toBeDefined();
    }
    s.diagram.edges.forEach((e, i) => {
      const others = s.diagram.edges.filter((_, j) => j !== i).map((o) => ({ ...o, data: { kind: 'data' as const } }));
      expect(wouldCreateCycle(others, e.source, e.target)).toBe(false);
    });
    expect(simOf(s.diagram).success).toBe(true);
  });

  it('gives every starter a goal and a named group of people', () => {
    for (const s of STARTERS) {
      expect(s.diagram.goal?.what).toBeTruthy();
      expect(s.diagram.nodes.find((n) => n.source)?.label).toBeTruthy();
    }
  });
});

describe('saved playground', () => {
  it('keeps names, notes, the plan, and the goal through a save and load', () => {
    const saved: SavedDiagram = {
      nodes: [
        { id: 'u', service: 'users', pos: { x: 0, y: 0 }, label: 'Families', source: { demand: 120 } },
        { id: 'fn', service: 'lambda', pos: { x: 300, y: 0 }, label: 'Sign-up checker', note: 'Runs only on a sign-up' },
      ],
      edges: [],
      plan: { title: 'Park Cleanup', uses: { lambda: 'Checks the form' } },
      goal: { what: 'sign up' },
    };
    const { nodes, edges } = fromSaved(saved);
    const again = toSaved(nodes, edges, { plan: saved.plan, goal: saved.goal });
    expect(again.nodes).toEqual(saved.nodes);
    expect(again.plan).toEqual(saved.plan);
    expect(again.goal).toEqual(saved.goal);
  });

  it('leaves out plan notes for services no longer on the map, and treats written text as not blank', () => {
    const { nodes, edges } = fromSaved({ nodes: [{ id: 'u', service: 'users', pos: { x: 0, y: 0 } }], edges: [] });
    const saved = toSaved(nodes, edges, { plan: { title: '', uses: { rds: 'Old note' } } });
    expect(saved.plan?.uses).toEqual({});
    expect(isBlank(saved)).toBe(true);
    expect(isBlank(toSaved(nodes, edges, { goal: { what: 'sign up' } }))).toBe(false);
  });

  it('drops arrows that are not allowed connections', () => {
    const { edges } = fromSaved({
      nodes: [
        { id: 'u', service: 'users', pos: { x: 0, y: 0 } },
        { id: 'db', service: 'dynamodb', pos: { x: 300, y: 0 } },
      ],
      edges: [{ source: 'u', target: 'db' }],
    });
    expect(edges).toHaveLength(0);
  });

  it('starts an empty playground with one group of townsfolk', () => {
    const pieces = fromSaved(null).nodes.filter(isPiece);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].data).toMatchObject({ service: 'users', label: 'Townsfolk', source: { demand: 50 } });
  });

  it('keeps version 1 and 2 saves, adding only an empty Builder Key profile at version 3', () => {
    const v1 = { band: 'builder', completed: ['l1'], playground: { nodes: [], edges: [] }, unlockAll: false };
    expect(migrateSaved(v1, 1)).toEqual({ ...v1, profile: EMPTY_PROFILE });
    const v2 = { ...v1, playground: { nodes: [], edges: [], plan: { title: 'Park Cleanup', uses: {} } } };
    expect(migrateSaved(v2, 2)).toEqual({ ...v2, profile: EMPTY_PROFILE });
    const v3 = { ...v2, profile: { profileId: 'p', token: 't', builderKey: 'MAPLE-OTTER-4821', lastSyncedAt: null } };
    expect(migrateSaved(v3, 3)).toEqual(v3);
  });
});

describe('alternatives', () => {
  it('explains when to pick every service that has alternatives', () => {
    for (const id of Object.keys(PICK_WHEN) as (keyof typeof PICK_WHEN)[]) {
      for (const alt of alternativesOf(id)) expect(PICK_WHEN[alt], `${id} → ${alt}`).toBeTruthy();
    }
  });
});

describe('share links', () => {
  const design: SavedDiagram = {
    nodes: [
      { id: 'u', service: 'users', pos: { x: 30, y: 260 }, label: 'Families', source: { demand: 120 } },
      { id: 'api', service: 'apigw', pos: { x: 360, y: 260 } },
      { id: 'fn', service: 'lambda', pos: { x: 580, y: 260 }, label: 'Sign-up checker', note: 'Só roda quando alguém se inscreve ✓' },
    ],
    edges: [
      { source: 'u', target: 'api' },
      { source: 'api', target: 'fn' },
    ],
    plan: { title: 'Park Cleanup', uses: { lambda: 'Checks the form' } },
    goal: { what: 'sign up' },
  };
  const pack = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('round-trips a design, including names, notes (any language), the plan, and the goal', () => {
    const code = encodeDesign(design);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeDesign(code)!;
    expect(back.nodes.map((n) => [n.service, n.pos, n.label, n.note, n.source?.demand])).toEqual(
      design.nodes.map((n) => [n.service, n.pos, n.label, n.note, n.source?.demand]),
    );
    expect(back.edges).toEqual([
      { source: 'p0', target: 'p1' },
      { source: 'p1', target: 'p2' },
    ]);
    expect(back.plan).toEqual(design.plan);
    expect(back.goal).toEqual(design.goal);
  });

  it('keeps a name the team cleared, so the real service name shows for the teammate too', () => {
    const back = decodeDesign(encodeDesign({ nodes: [{ id: 'u', service: 'users', pos: { x: 0, y: 0 }, label: '' }], edges: [] }))!;
    expect(back.nodes[0].label).toBe('');
    expect(fromSaved(back).nodes.filter(isPiece)[0].data.label).toBe('');
  });

  it('drops repeated arrows from an edited link', () => {
    const back = decodeDesign(pack({ v: 1, n: [['users', 0, 0], ['apigw', 300, 0]], e: [[0, 1], [0, 1]] }))!;
    expect(back.edges).toEqual([{ source: 'p0', target: 'p1' }]);
  });

  it('keeps a visitor count of 0 instead of bringing back the default', () => {
    const back = decodeDesign(encodeDesign({ nodes: [{ id: 'u', service: 'users', pos: { x: 0, y: 0 }, source: { demand: 0 } }], edges: [] }))!;
    expect(back.nodes[0].source?.demand).toBe(0);
  });

  it('returns null for codes that are not a Spark design', () => {
    expect(decodeDesign('not-a-real-code')).toBeNull();
    expect(decodeDesign('')).toBeNull();
    expect(decodeDesign(pack({ v: 2, n: [], e: [] }))).toBeNull();
    expect(decodeDesign(pack({ v: 1, n: [['nope', 0, 0]], e: [] }))).toBeNull();
  });

  it('drops unknown services, arrows Spark does not allow, and oversized text from an edited link', () => {
    const back = decodeDesign(
      pack({
        v: 1,
        n: [['users', 0, 0, 'x'.repeat(500), 9999], ['dynamodb', 300, 0], ['hacker', 1, 1]],
        e: [[0, 1], [0, 2], [5, 0]],
      }),
    )!;
    expect(back.nodes.map((n) => n.service)).toEqual(['users', 'dynamodb']);
    expect(back.nodes[0].label).toHaveLength(40);
    expect(back.nodes[0].source?.demand).toBe(500);
    expect(back.edges).toEqual([]);
  });
});

describe('plan export', () => {
  it('lists AWS services left to right with notes, and one sentence per arrow that carries work', () => {
    const { nodes, edges } = fromSaved({
      nodes: [
        { id: 'u', service: 'users', pos: { x: 0, y: 0 } },
        { id: 'db', service: 'dynamodb', pos: { x: 700, y: 0 }, note: 'Fast lookups' },
        { id: 'api', service: 'apigw', pos: { x: 300, y: 0 } },
        { id: 'fn', service: 'lambda', pos: { x: 500, y: 0 } },
        { id: 'cw', service: 'cloudwatch', pos: { x: 500, y: 300 } },
      ],
      edges: [
        { source: 'u', target: 'api' },
        { source: 'api', target: 'fn' },
        { source: 'fn', target: 'db' },
        { source: 'fn', target: 'cw' },
      ],
    });
    const summary = summarizePlan(nodes.filter(isPiece), edges, 'builder');
    expect(summary.services.map((s) => s.service)).toEqual(['apigw', 'lambda', 'cloudwatch', 'dynamodb']);
    expect(summary.services.find((s) => s.service === 'dynamodb')?.notes).toEqual(['Fast lookups']);
    expect(summary.steps).toHaveLength(3);
    const text = planText({ title: 'Park Cleanup', uses: { apigw: 'Gets the form' } }, summary);
    expect(text).toContain('Our AWS plan: Park Cleanup');
    expect(text).toContain('- Amazon API Gateway: Gets the form');
    expect(text).toContain('Why we chose it: Fast lookups');
    expect(text).toContain('Sources: ');
  });
});

describe('judge practice', () => {
  const signups = (demand: number, extra: JudgeNode[] = [], more: JudgeEdge[] = []) => {
    const nodes: JudgeNode[] = [
      { id: 'u', service: 'users', source: { demand } },
      { id: 'api', service: 'apigw' },
      { id: 'fn', service: 'lambda' },
      { id: 'db', service: 'dynamodb' },
      ...extra,
    ];
    const edges: JudgeEdge[] = [
      { source: 'u', target: 'api' },
      { source: 'api', target: 'fn' },
      { source: 'fn', target: 'db' },
      ...more,
    ];
    return judgeQuestions(nodes, edges, 'builder');
  };
  const q = (qs: ReturnType<typeof judgeQuestions>, id: string) => qs.find((x) => x.id === id)!;

  it('a crowd: passes when 10× the people still fit, and names the problem when they don’t', () => {
    expect(q(signups(80), 'crowd').verdict).toBe('good');
    const crowd = q(signups(200), 'crowd');
    expect(crowd.verdict).toBe('fix');
    expect(crowd.answer).toContain('2,000 people');
  });

  it('a crowd: asks to fix the map first when it fails even at normal size', () => {
    const qs = judgeQuestions(
      [
        { id: 'u', service: 'users', source: { demand: 50 } },
        { id: 'api', service: 'apigw' },
      ],
      [{ source: 'u', target: 'api' }],
      'builder',
    );
    expect(q(qs, 'crowd').answer).toMatch(/doesn’t work yet/);
  });

  it('data: asks for KMS on the store and IAM on what writes to it, and passes once both are there', () => {
    const bare = q(signups(50), 'data');
    expect(bare.verdict).toBe('fix');
    expect(bare.answer).toContain('Point KMS at DynamoDB');
    expect(bare.answer).toContain('Point IAM at Lambda');
    const locked = q(
      signups(50, [{ id: 'kms', service: 'kms' }, { id: 'iam', service: 'iam' }], [
        { source: 'kms', target: 'db' },
        { source: 'iam', target: 'fn' },
      ]),
      'data',
    );
    expect(locked.verdict).toBe('good');
  });

  it('watching: passes with a CloudWatch arrow', () => {
    expect(q(signups(50), 'watch').verdict).toBe('fix');
    expect(q(signups(50, [{ id: 'cw', service: 'cloudwatch' }], [{ source: 'fn', target: 'cw' }]), 'watch').verdict).toBe('good');
  });

  it('asks why about the main pieces, comparing each with a service that could do the same job', () => {
    const why = signups(50).filter((x) => x.verdict === 'think');
    expect(why.map((x) => x.ask)).toEqual([
      'Why did you use Lambda instead of EC2?',
      'Why did you use DynamoDB instead of RDS?',
    ]);
  });

  it('skips the data question when nothing on the map keeps data', () => {
    const qs = judgeQuestions(
      [
        { id: 'u', service: 'users', source: { demand: 50 } },
        { id: 'cf', service: 'cloudfront' },
        { id: 'api', service: 'apigw' },
      ],
      [],
      'builder',
    );
    expect(qs.some((x) => x.id === 'data')).toBe(false);
  });
});
