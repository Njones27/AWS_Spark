import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../data/levels';
import { RULES, explainRejection, findRule, targetsOf } from '../data/rules';
import { SERVICE_LIST, SERVICES } from '../data/services';
import type { ServiceId } from '../data/types';
import { badgesFor } from './badges';
import { levelSolved, levelStart } from './levelGraph';
import { simulate } from './simulate';
import { checkConnection, wouldCreateCycle } from './validate';

const serviceOf = (level: (typeof LEVELS)[number], id: string) =>
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
    for (const level of LEVELS) {
      for (const [s, t] of [...level.edges, ...level.solution.connect]) {
        const rule = findRule(serviceOf(level, s)!, serviceOf(level, t)!);
        expect(rule, `${level.id}: ${s} -> ${t}`).toBeDefined();
      }
    }
  });

  it('fits each solution inside the level palette', () => {
    for (const level of LEVELS) {
      for (const a of level.solution.add) {
        const slot = level.palette.find((p) => p.service === a.service);
        const used = level.solution.add.filter((x) => x.service === a.service).length;
        expect(slot && slot.count >= used, `${level.id} needs ${a.service}`).toBe(true);
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

describe('simulate', () => {
  for (const level of LEVELS) {
    it(`${level.id} "${level.title}": the start fails and the solution succeeds`, () => {
      const start = levelStart(level);
      expect(simulate(start.nodes, start.edges).success).toBe(false);
      const solved = levelSolved(level);
      const res = simulate(solved.nodes, solved.edges);
      expect(res.sources, JSON.stringify(res.sources)).toBeDefined();
      expect(res.success).toBe(true);
      expect(Object.values(res.nodes).some((n) => n.status === 'overload')).toBe(false);
    });
  }

  const byId = (id: string) => LEVELS.find((l) => l.id === id)!;

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

  it('ramps with scale', () => {
    const solved = levelSolved(byId('l4'));
    expect(simulate(solved.nodes, solved.edges, 0.5).sources.hungry.demand).toBe(25);
  });
});
