import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVANCED_LEVELS } from '../data/advanced';
import { ALL_LEVELS, levelById } from '../data/chapters';
import { COST } from '../data/costs';
import { LEVELS, type Level } from '../data/levels';
import { RULES, explainRejection, findRule, targetsOf } from '../data/rules';
import { SERVICE_LIST, SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';
import { badgesFor } from './badges';
import { levelSolved, levelStart } from './levelGraph';
import { checkObjectives, costOf, firstFailed } from './objectives';
import { simulate, type SimEdge, type SimNode } from './simulate';
import { checkConnection, wouldCreateCycle } from './validate';

const serviceOf = (level: Level, id: string) =>
  level.nodes.find((n) => n.id === id)?.service ?? level.solution.add.find((a) => a.id === id)?.service;

describe('data', () => {
  it('has an icon for every service', () => {
    for (const s of SERVICE_LIST) expect(existsSync(join(__dirname, '../../public/icons', `${s.id}.svg`)), s.id).toBe(true);
  });

  it('has no duplicate rules', () => {
    const keys = RULES.map((r) => `${r.from}>${r.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only uses allowed connections in level presets and solutions', () => {
    for (const level of ALL_LEVELS) {
      for (const [s, t] of [...level.edges, ...level.solution.connect]) {
        const rule = findRule(serviceOf(level, s)!, serviceOf(level, t)!);
        expect(rule, `${level.id}: ${s} -> ${t}`).toBeDefined();
      }
    }
  });

  it('fits each solution inside the level palette', () => {
    for (const level of ALL_LEVELS) {
      for (const a of level.solution.add) {
        const slot = level.palette.find((p) => p.service === a.service);
        const used = level.solution.add.filter((x) => x.service === a.service).length;
        expect(slot && slot.count >= used, `${level.id} needs ${a.service}`).toBe(true);
      }
    }
  });

  it('gives every level a unique id', () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices every service', () => {
    for (const s of SERVICE_LIST) expect(COST[s.id], s.id).toBeGreaterThanOrEqual(0);
  });

  it('only names pieces that exist in advanced requirements', () => {
    for (const level of ADVANCED_LEVELS) {
      for (const r of level.requires ?? []) {
        for (const end of [r.from, r.to]) {
          const ok = end in SERVICES || level.nodes.some((n) => n.id === end);
          expect(ok, `${level.id}: ${end}`).toBe(true);
        }
        // A requirement on a service the player has to add must be addable.
        if (r.from in SERVICES && !level.nodes.some((n) => n.service === r.from)) {
          expect(level.palette.some((p) => p.service === r.from), `${level.id}: ${r.from} in palette`).toBe(true);
        }
      }
    }
  });

  it('teaches 14 services in chapter 1, as the ending text claims', () => {
    expect(new Set(LEVELS.flatMap((l) => l.teaches)).size).toBe(14);
  });

  it('explains rejected connections with a reason and suggestions', () => {
    const r = explainRejection('s3', 'rds');
    expect(r.simple.length).toBeGreaterThan(10);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(explainRejection('users', 'rds').simple).toMatch(/database/);
    expect(explainRejection('iam', 's3').simple).toMatch(/badge/);
    expect(explainRejection('lambda', 'users').suggestions).not.toContain('cloudwatch');
  });

  it('says how to flip a backwards arrow', () => {
    expect(explainRejection('lambda', 'iam').simple).toMatch(/wrong way.*from IAM to Lambda/);
    expect(explainRejection('rds', 'lambda').tech).toBe('Draw it the other way: AWS Lambda saves to Amazon RDS.');
  });

  it('gives every database the "can’t reach the database" message', () => {
    for (const db of ['dynamodb', 'rds', 'aurora', 'elasticache', 'redshift', 'opensearch'] as ServiceId[]) {
      expect(explainRejection('users', db).simple, db).toMatch(/database/);
    }
  });

  it('only treats the arrows into CloudWatch and CloudTrail as optional extras', () => {
    expect(targetsOf('lambda', false)).not.toContain('cloudwatch');
    expect(targetsOf('lambda', false)).not.toContain('cloudtrail');
    expect(targetsOf('cloudtrail', false)).toEqual(['s3']);
    expect(findRule('iam', 'cloudwatch')).toBeUndefined(); // IAM publishes no CloudWatch metrics
    expect(findRule('kms', 'cloudwatch')).toBeDefined();
  });

  it('gives every service a real connection, not just monitor arrows', () => {
    for (const s of SERVICE_LIST) {
      // CloudTrail is all monitoring: every piece's changes come in, and the logbook goes out to S3.
      if (s.id === 'cloudtrail') continue;
      expect(RULES.some((r) => r.kind !== 'monitor' && (r.from === s.id || r.to === s.id)), s.id).toBe(true);
    }
  });

  it('never lets a badge service carry requests', () => {
    for (const r of RULES) if (SERVICES[r.from].badge) expect(r.kind, `${r.from} -> ${r.to}`).not.toBe('data');
  });
});

describe('badges', () => {
  it('pins badge services on the pieces they point at, and nothing else', () => {
    const n = (id: string, service: ServiceId) => ({ id, service });
    const nodes = [
      n('role', 'iam'),
      n('fn', 'lambda'),
      n('gw', 'apigw'),
      n('tags', 'cognito'),
      n('asg', 'autoscaling'),
      n('vm', 'ec2'),
      n('key', 'kms'),
      n('db', 'dynamodb'),
    ];
    const edges = [
      { source: 'role', target: 'fn' },
      { source: 'role', target: 'fn' }, // a repeat shows once
      { source: 'gw', target: 'tags' }, // a control arrow, but API Gateway isn't a badge service
      { source: 'asg', target: 'vm' },
      { source: 'key', target: 'db' },
      { source: 'fn', target: 'db' }, // a data arrow
    ];
    expect(badgesFor(nodes, edges)).toEqual({ fn: ['iam'], vm: ['autoscaling'], db: ['kms'] });
  });
});

describe('validate', () => {
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ];
  it('detects cycles', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });
  it('rejects self, duplicate, invalid, and looping connections', () => {
    const n = (id: string, service: any) => ({ id, service });
    expect(checkConnection(edges, n('a', 'lambda'), n('a', 'lambda'))).toMatchObject({ ok: false, kind: 'self' });
    expect(checkConnection(edges, n('a', 'apigw'), n('b', 'lambda'))).toMatchObject({ ok: false, kind: 'duplicate' });
    expect(checkConnection(edges, n('a', 's3'), n('x', 'route53'))).toMatchObject({ ok: false, kind: 'rule' });
    expect(checkConnection(edges, n('c', 'sqs'), n('a', 'lambda'))).toMatchObject({ ok: false, kind: 'cycle' });
    expect(checkConnection(edges, n('a', 'apigw'), n('x', 'lambda'))).toMatchObject({ ok: true });
  });
  it('lets control and monitor arrows close a loop, but still refuses a data loop', () => {
    const n = (id: string, service: ServiceId) => ({ id, service });
    const monitor = { kind: 'monitor' as const };
    const control = { kind: 'control' as const };
    // EC2 reports to CloudWatch, CloudWatch tells Auto Scaling, Auto Scaling makes copies of EC2.
    const scaling = [
      { source: 'ec2', target: 'cw', data: monitor },
      { source: 'asg', target: 'ec2', data: control },
    ];
    expect(checkConnection(scaling, n('cw', 'cloudwatch'), n('asg', 'autoscaling'))).toMatchObject({ ok: true });
    // SNS reports to CloudWatch, and a CloudWatch alarm rings SNS.
    expect(checkConnection([{ source: 'sns', target: 'cw', data: monitor }], n('cw', 'cloudwatch'), n('sns', 'sns'))).toMatchObject({
      ok: true,
    });
    // A data arrow may close a loop that runs through monitor and control arrows:
    // Lambda reports to CloudWatch, CloudWatch rings SNS, then SNS wakes up Lambda.
    const alarm = [
      { source: 'fn', target: 'cw', data: monitor },
      { source: 'cw', target: 'sns', data: control },
    ];
    expect(checkConnection(alarm, n('sns', 'sns'), n('fn', 'lambda'))).toMatchObject({ ok: true });
    // A monitor arrow next to the path doesn't hide a real request loop.
    const loop = [
      { source: 'sns', target: 'fn', data: { kind: 'data' as const } },
      { source: 'fn', target: 'cw', data: monitor },
    ];
    expect(checkConnection(loop, n('fn', 'lambda'), n('sns', 'sns'))).toMatchObject({ ok: false, kind: 'cycle' });
  });
});

/** Wins exactly when the Run button would: everyone is happy and no constraint fails. */
const passes = (level: Level, g: { nodes: SimNode[]; edges: SimEdge[] }) => {
  const res = simulate(g.nodes, g.edges);
  return res.success && !firstFailed(checkObjectives(level, g.nodes, g.edges, res));
};

describe('simulate', () => {
  for (const level of ALL_LEVELS) {
    it(`${level.id} "${level.title}": the start fails and the solution succeeds`, () => {
      expect(passes(level, levelStart(level))).toBe(false);
      const solved = levelSolved(level);
      const res = simulate(solved.nodes, solved.edges);
      expect(res.success, JSON.stringify(res.sources)).toBe(true);
      expect(Object.values(res.nodes).some((n) => n.status === 'overload')).toBe(false);
      const failed = firstFailed(checkObjectives(level, solved.nodes, solved.edges, res));
      expect(failed?.fail).toBeUndefined();
    });
  }

  const byId = (id: string) => levelById(id)!;

  it('l2: skipping the address book is reported as a missing need', () => {
    const level = byId('l2');
    const res = simulate(levelStart(level).nodes, [{ id: 'e', source: 'town', target: 's3' }]);
    expect(res.sources.town.failures[0].reason).toEqual({ kind: 'missing', need: 'route53' });
  });

  it('l3: CloudFront only sends a fifth of the traffic to S3', () => {
    const solved = levelSolved(byId('l3'));
    const res = simulate(solved.nodes, solved.edges);
    expect(res.nodes.s3.load).toBeCloseTo(90 * 0.2);
  });

  it('l6: one EC2 overloads; auto scaling alone also fixes it', () => {
    const level = byId('l6');
    const start = levelStart(level);
    const before = simulate(start.nodes, start.edges);
    expect(before.nodes.ec2.status).toBe('overload');
    expect(before.sources.crowd.failures[0].reason).toEqual({ kind: 'overload', node: 'ec2' });
    const scaled = simulate(
      [...start.nodes, { id: 'asg', service: 'autoscaling' }],
      [...start.edges, { id: 'x', source: 'asg', target: 'ec2' }],
    );
    expect(scaled.success).toBe(true);
  });

  it('l7: the cache cuts database load to 20%', () => {
    const solved = levelSolved(byId('l7'));
    const res = simulate(solved.nodes, solved.edges);
    expect(res.nodes.rds.load).toBeCloseTo(40);
  });

  it('cache hits never meet an overloaded origin, so only the dropped requests fail', () => {
    // 500 visitors → CloudFront → one EC2 (50): 100 reach EC2 and 50 are dropped, so 450 of 500 finish.
    const cdn = simulate(
      [
        { id: 'u', service: 'users', source: { demand: 500, needs: ['ec2'] } },
        { id: 'cf', service: 'cloudfront' },
        { id: 'e', service: 'ec2' },
      ],
      [
        { id: '1', source: 'u', target: 'cf' },
        { id: '2', source: 'cf', target: 'e' },
      ],
    );
    expect(cdn.nodes.e.dropped).toBeCloseTo(50);
    expect(cdn.sources.u.ok).toBeCloseTo(450);
    expect(cdn.sources.u.failures).toEqual([{ reason: { kind: 'overload', node: 'e' }, amount: expect.closeTo(50) }]);

    // L7 with 400 checkers: the cache leaves RDS 80 reads for 60 slots, so 20 are dropped.
    const level = byId('l7');
    const solved = levelSolved(level);
    const busy = simulate(
      solved.nodes.map((n) => (n.id === 'checkers' ? { ...n, source: { ...n.source!, demand: 400 } } : n)),
      solved.edges,
    );
    expect(busy.nodes.rds.dropped).toBeCloseTo(20);
    expect(busy.sources.checkers.ok).toBeCloseTo(380);
  });

  it('a cache-hit share still fails when the origin is a dead end', () => {
    const res = simulate(
      [
        { id: 'u', service: 'users', source: { demand: 10 } },
        { id: 'cf', service: 'cloudfront' },
        { id: 'a', service: 'apigw' },
      ],
      [
        { id: '1', source: 'u', target: 'cf' },
        { id: '2', source: 'cf', target: 'a' },
      ],
    );
    expect(res.sources.u.ok).toBe(0);
    expect(res.sources.u.failures[0].reason).toEqual({ kind: 'deadEnd', node: 'a' });
  });

  it('l8: the queue makes orders wait instead of being dropped', () => {
    const solved = levelSolved(byId('l8'));
    const res = simulate(solved.nodes, solved.edges);
    expect(res.nodes.oven.status).toBe('waiting');
    expect(res.nodes.oven.waiting).toBeCloseTo(60);
    expect(res.nodes.oven.dropped).toBe(0);
  });

  it('l9: WAF blocks bots; leaving the bypass arrow still overloads', () => {
    const level = byId('l9');
    const solved = levelSolved(level);
    expect(simulate(solved.nodes, solved.edges).nodes.w.blocked).toBeCloseTo(140);
    const leaky = simulate(solved.nodes, [...solved.edges, { id: 'bypass', source: 'crowd', target: 'lb' }]);
    expect(leaky.success).toBe(false);
  });

  it('dead ends: a router with nowhere to go fails', () => {
    const res = simulate(
      [
        { id: 'u', service: 'users', source: { demand: 10 } },
        { id: 'a', service: 'apigw' },
      ],
      [{ id: 'e', source: 'u', target: 'a' }],
    );
    expect(res.sources.u.failures[0].reason).toEqual({ kind: 'deadEnd', node: 'a' });
  });

  /** Townsfolk → s0 → s1 → … as a straight line. */
  const line = (services: ServiceId[], demand = 10) => {
    const ids = ['u', ...services.map((_, i) => `s${i}`)];
    return {
      nodes: [{ id: 'u', service: 'users' as ServiceId, source: { demand } }, ...services.map((service, i) => ({ id: `s${i}`, service }))],
      edges: ids.slice(1).map((id, i) => ({ id: `e${i}`, source: ids[i], target: id })),
    };
  };

  it('badges never change loads, capacity, or whether requests finish', () => {
    // Level 6 starts with an overloaded EC2, so a badge that quietly added capacity would show up here.
    for (const g of [levelSolved(byId('l4')), levelStart(byId('l6'))]) {
      const nodes = [...g.nodes];
      const edges = [...g.edges];
      for (const n of g.nodes) {
        for (const b of SERVICE_LIST) {
          // Auto Scaling is the one badge that changes capacity (tested with level 6 above).
          if (!b.badge || b.id === 'autoscaling' || !findRule(b.id, n.service)) continue;
          nodes.push({ id: `${b.id}-${n.id}`, service: b.id });
          edges.push({ id: `${b.id}-${n.id}-arrow`, source: `${b.id}-${n.id}`, target: n.id });
        }
      }
      expect(Object.keys(badgesFor(nodes, edges)).length).toBeGreaterThan(0);
      const plain = simulate(g.nodes, g.edges);
      const badged = simulate(nodes, edges);
      expect(badged.sources).toEqual(plain.sources);
      for (const id of Object.keys(plain.nodes)) expect(badged.nodes[id], id).toEqual(plain.nodes[id]);
    }
  });

  it('an AI agent needs something to think with', () => {
    const alone = line(['apigw', 'lambda', 'agentcore']);
    expect(simulate(alone.nodes, alone.edges).sources.u.failures[0].reason).toEqual({ kind: 'deadEnd', node: 's2' });
    const thinking = line(['apigw', 'lambda', 'agentcore', 'bedrock']);
    expect(simulate(thinking.nodes, thinking.edges).success).toBe(true);
  });

  it('Firehose needs somewhere to deliver', () => {
    const alone = line(['apigw', 'firehose']);
    expect(simulate(alone.nodes, alone.edges).sources.u.failures[0].reason).toEqual({ kind: 'deadEnd', node: 's1' });
    const delivered = line(['apigw', 'firehose', 's3']);
    expect(simulate(delivered.nodes, delivered.edges).success).toBe(true);
  });

  it('ElastiCache takes reads off Aurora too', () => {
    const g = line(['apigw', 'lambda', 'aurora'], 200);
    const res = simulate(
      [...g.nodes, { id: 'c', service: 'elasticache' }],
      [...g.edges, { id: 'cache', source: 's1', target: 'c' }],
    );
    expect(res.nodes.s2.load).toBeCloseTo(40);
    expect(res.success).toBe(true);
  });

  it('a load balancer shares visitors across container crews', () => {
    const res = simulate(
      [
        { id: 'u', service: 'users', source: { demand: 150 } },
        { id: 'lb', service: 'elb' },
        { id: 'a', service: 'ecs' },
        { id: 'b', service: 'ecs' },
      ],
      [
        { id: '1', source: 'u', target: 'lb' },
        { id: '2', source: 'lb', target: 'a' },
        { id: '3', source: 'lb', target: 'b' },
      ],
    );
    expect(res.nodes.a.load).toBeCloseTo(75);
    expect(res.success).toBe(true);
  });

  it('a queue hands work to its readers in proportion to their capacity', () => {
    const res = simulate(
      [
        { id: 'u', service: 'users', source: { demand: 150 } },
        { id: 'gw', service: 'apigw' },
        { id: 'q', service: 'sqs' },
        { id: 'slow', service: 'ec2' },
        { id: 'fast', service: 'ecs' },
      ],
      [
        { id: '0', source: 'u', target: 'gw' },
        { id: '1', source: 'gw', target: 'q' },
        { id: '2', source: 'q', target: 'slow' },
        { id: '3', source: 'q', target: 'fast' },
      ],
    );
    expect(res.nodes.slow.load).toBeCloseTo(50);
    expect(res.nodes.fast.load).toBeCloseTo(100);
    expect(res.nodes.slow.waiting + res.nodes.fast.waiting).toBeCloseTo(0);
  });

  it('a queue hands its work to the reader with free room, not to one busy with other traffic', () => {
    // The busy crew gets 90 of its 100 straight from a load balancer, so it only has room for 10 queue messages.
    const res = simulate(
      [
        { id: 'web', service: 'users', source: { demand: 90 } },
        { id: 'jobs', service: 'users', source: { demand: 100 } },
        { id: 'lb', service: 'elb' },
        { id: 'gw', service: 'apigw' },
        { id: 'q', service: 'sqs' },
        { id: 'busy', service: 'ecs' },
        { id: 'idle', service: 'ecs' },
      ],
      [
        { id: '1', source: 'web', target: 'lb' },
        { id: '2', source: 'lb', target: 'busy' },
        { id: '3', source: 'jobs', target: 'gw' },
        { id: '4', source: 'gw', target: 'q' },
        { id: '5', source: 'q', target: 'busy' },
        { id: '6', source: 'q', target: 'idle' },
      ],
    );
    expect(res.nodes.busy.waiting + res.nodes.idle.waiting).toBeCloseTo(0);
    expect(res.nodes.busy.load).toBeLessThanOrEqual(100 + 1e-6);
    expect(res.success).toBe(true);
  });

  it('ramps with scale', () => {
    const solved = levelSolved(byId('l4'));
    expect(simulate(solved.nodes, solved.edges, 0.5).sources.hungry.demand).toBe(25);
  });
});

describe('advanced constraints', () => {
  const lvl = (id: string) => levelById(id)!;
  /** The solved level with some edits: extra pieces, extra arrows, and arrows to snip. */
  const tweak = (
    level: Level,
    add: SimNode[],
    connect: [string, string][],
    snip: [string, string][] = [],
    base = levelSolved(level),
  ) => ({
    nodes: [...base.nodes, ...add],
    edges: [
      ...base.edges.filter((e) => !snip.some(([s, t]) => e.source === s && e.target === t)),
      ...connect.map(([s, t]) => ({ id: `${s}->${t}`, source: s, target: t })),
    ],
  });

  it('bills an auto-scaled EC2 piece for every instance it runs', () => {
    const nodes = [
      { id: 'e', service: 'ec2' as ServiceId },
      { id: 'asg', service: 'autoscaling' as ServiceId },
    ];
    expect(costOf(nodes, [])).toBe(COST.ec2);
    expect(costOf(nodes, [{ id: 'x', source: 'asg', target: 'e' }])).toBe(COST.ec2 * 4);
  });

  it('a1: checkout already works, so only the security requirements fail', () => {
    const level = lvl('a1');
    const start = levelStart(level);
    const res = simulate(start.nodes, start.edges);
    expect(res.success).toBe(true);
    expect(checkObjectives(level, start.nodes, start.edges, res).filter((o) => o.ok === false)).toHaveLength(4);
    // Shield Advanced on top of the solution blows the budget.
    const shielded = tweak(level, [{ id: 'sh', service: 'shield' }], []);
    expect(passes(level, shielded)).toBe(false);
  });

  it('a2: scaling the Monolith carries checkout but blows the budget', () => {
    const level = lvl('a2');
    const scaled = tweak(level, [{ id: 'asg', service: 'autoscaling' }], [['apigw', 'mono'], ['asg', 'mono']], [['apigw', 'fn']]);
    expect(simulate(scaled.nodes, scaled.edges).success).toBe(true);
    expect(firstFailed(checkObjectives(level, scaled.nodes, scaled.edges, null))?.id).toBe('budget');
  });

  it('a3: three containers plus the old printer leave a backlog', () => {
    const level = lvl('a3');
    const short = tweak(level, [], [], [['q', 'c4']]);
    const res = simulate(short.nodes, short.edges);
    expect(res.success).toBe(true); // nothing is dropped…
    expect(firstFailed(checkObjectives(level, short.nodes, short.edges, res))?.id).toBe('backlog'); // …but it never drains
  });

  it('a4: adding containers instead of WAF works but blows the budget', () => {
    const level = lvl('a4');
    const brute = tweak(
      level,
      ['x1', 'x2', 'x3'].map((id) => ({ id, service: 'ecs' as ServiceId })),
      [['visitors', 'cf'], ['lb', 'x1'], ['lb', 'x2'], ['lb', 'x3']],
      [['visitors', 'w'], ['w', 'cf']],
    );
    expect(simulate(brute.nodes, brute.edges).success).toBe(true);
    expect(firstFailed(checkObjectives(level, brute.nodes, brute.edges, null))?.id).toBe('budget');
  });

  it('a5: routing analytics through Kinesis blows the budget', () => {
    const level = lvl('a5');
    const viaKinesis = tweak(level, [{ id: 'k', service: 'kinesis' }], [['fn', 'k'], ['k', 'hose']], [['fn', 'hose']]);
    expect(simulate(viaKinesis.nodes, viaKinesis.edges).success).toBe(true);
    expect(firstFailed(checkObjectives(level, viaKinesis.nodes, viaKinesis.edges, null))?.id).toBe('budget');
  });

  it('a6: a Redshift warehouse answers the analysts but costs more than the whole budget', () => {
    const level = lvl('a6');
    expect(COST.redshift).toBeGreaterThan(level.budget!);
  });

  it('a7: the agent needs a tool to look up orders', () => {
    const level = lvl('a7');
    const noTool = tweak(level, [], [], [['agent', 'tool']]);
    const res = simulate(noTool.nodes, noTool.edges);
    expect(res.sources.chats.failures[0].reason).toEqual({ kind: 'missing', need: 'dynamodb' });
  });
});
