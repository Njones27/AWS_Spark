import { alternativesOf, PICK_WHEN } from '../data/alternatives';
import { topProblem } from '../data/feedback';
import { findRule } from '../data/rules';
import { SERVICES, shortName } from '../data/services';
import type { Band, ServiceId, SourceSpec } from '../data/types';
import { badgesFor } from './badges';
import { simulate } from './simulate';

export interface JudgeNode {
  id: string;
  service: ServiceId;
  label?: string;
  source?: SourceSpec;
}
export interface JudgeEdge {
  source: string;
  target: string;
}

/** good: the map already answers it. fix: the map needs a change. think: the student answers in their own words. */
export type Verdict = 'good' | 'fix' | 'think';

export interface JudgeQuestion {
  id: string;
  ask: string;
  verdict: Verdict;
  answer: string;
}

export const CROWD = 10;
/** Where data is kept, and can be locked with a KMS key. */
const STORES: ServiceId[] = ['dynamodb', 'rds', 'aurora', 's3', 'redshift', 'opensearch'];
/** Asked about first in "why X instead of Y", since judges ask about the main building blocks. */
const WHY_ORDER: ServiceId[] = ['lambda', 'ec2', 'ecs', 'eks', 'dynamodb', 'rds', 'aurora', 'apigw', 'appsync', 'elb', 'sqs', 'sns'];

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/**
 * Questions a judge might ask about this map, each checked against the map itself where the map can answer it.
 * Only questions that fit the map are asked: no data question without somewhere data is kept, and so on.
 */
export function judgeQuestions(nodes: JudgeNode[], edges: JudgeEdge[], band: Band): JudgeQuestion[] {
  const tech = band === 'architect';
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const aws = nodes.filter((n) => SERVICES[n.service].category !== 'town');
  const out: JudgeQuestion[] = [];

  // 1. A crowd: run the map with ten times the people.
  const sources = nodes.filter((n) => n.source);
  if (sources.length && aws.length) {
    const simNodes = nodes.map((n) => ({ id: n.id, service: n.service, source: n.source }));
    const simEdges = edges.map((e, i) => ({ id: `j${i}`, source: e.source, target: e.target }));
    const nameOf = (id: string) => {
      const n = byId.get(id);
      return n ? { name: n.label || shortName(n.service), service: n.service } : undefined;
    };
    const people = sources.reduce((a, n) => a + (n.source?.demand ?? 0), 0) * CROWD;
    const ask = `What if ${CROWD} times more people show up?`;
    const normal = simulate(simNodes, simEdges, 1);
    if (!normal.success) {
      out.push({
        id: 'crowd',
        ask,
        verdict: 'fix',
        answer: 'Your map doesn’t work yet, even with the usual number of people. Press Run and fix that first.',
      });
    } else {
      const crowd = simulate(simNodes, simEdges, CROWD);
      out.push(
        crowd.success
          ? {
              id: 'crowd',
              ask,
              verdict: 'good',
              answer: `Everything keeps up with ${people.toLocaleString('en-US')} people. You can tell the judges your plan is ready for a crowd.`,
            }
          : {
              id: 'crowd',
              ask,
              verdict: 'fix',
              answer: `With ${people.toLocaleString('en-US')} people: ${topProblem(crowd, nameOf, band)?.text ?? 'some requests don’t get through.'} ${
                tech
                  ? 'Consider a queue (SQS) to absorb bursts, more capacity behind a load balancer, or a cache.'
                  : 'Try SQS so work waits in line, or add more of the busy piece.'
              }`,
            },
      );
    }
  }

  // 2. Data: is it locked, and does everything that writes to it have only the permissions it needs?
  const stores = aws.filter((n) => STORES.includes(n.service));
  if (stores.length) {
    const badges = badgesFor(nodes, edges);
    const unlocked = stores.filter((s) => !badges[s.id]?.includes('kms'));
    const writers = unique(
      edges
        .filter((e) => stores.some((s) => s.id === e.target))
        .map((e) => byId.get(e.source))
        .filter((n): n is JudgeNode => !!n && findRule('iam', n.service)?.kind === 'control'),
    );
    const noRole = writers.filter((w) => !badges[w.id]?.includes('iam'));
    const storeNames = list(unique(stores.map((s) => shortName(s.service))));
    const fixes = [
      ...(unlocked.length
        ? [
            tech
              ? `Encrypt ${list(unique(unlocked.map((s) => shortName(s.service))))} with a KMS key.`
              : `Point KMS at ${list(unique(unlocked.map((s) => shortName(s.service))))} to lock the data.`,
          ]
        : []),
      ...(noRole.length
        ? [
            tech
              ? `Give ${list(unique(noRole.map((w) => shortName(w.service))))} an IAM role with only the permissions it needs.`
              : `Point IAM at ${list(unique(noRole.map((w) => shortName(w.service))))} so it gets only the permissions it needs.`,
          ]
        : []),
    ];
    out.push({
      id: 'data',
      ask: `Who is allowed to read the data in ${storeNames}?`,
      verdict: fixes.length ? 'fix' : 'good',
      answer: fixes.length
        ? `Nothing on your map says yet. ${fixes.join(' ')}`
        : writers.length
          ? `Only ${list(unique(writers.map((w) => shortName(w.service))))} can reach it, because IAM gives each one a permission badge, and KMS locks the data.`
          : 'KMS locks the data, so only services with permission can read it.',
    });
  }

  // 3. Watching: would anyone notice if something broke?
  if (aws.length) {
    const watched = unique(
      edges
        .filter((e) => byId.get(e.target)?.service === 'cloudwatch')
        .map((e) => byId.get(e.source))
        .filter((n): n is JudgeNode => !!n)
        .map((n) => shortName(n.service)),
    );
    const first = aws.find((n) => findRule(n.service, 'cloudwatch'));
    out.push({
      id: 'watch',
      ask: 'How would you know if something broke?',
      verdict: watched.length ? 'good' : 'fix',
      answer: watched.length
        ? `CloudWatch watches ${list(watched)}. Add an arrow from CloudWatch to SNS, and it can text you when something looks wrong.`
        : `Nothing on your map is watching for problems yet. Try an arrow from ${first ? shortName(first.service) : 'a piece'} to CloudWatch.`,
    });
  }

  // 4. Choices: why this service and not another one that could do the job?
  const used = unique(aws.map((n) => n.service));
  const why = [...WHY_ORDER.filter((s) => used.includes(s)), ...used.filter((s) => !WHY_ORDER.includes(s))]
    .filter((s) => PICK_WHEN[s] && alternativesOf(s).some((a) => PICK_WHEN[a]))
    .slice(0, 2);
  for (const s of why) {
    const other = alternativesOf(s).find((a) => PICK_WHEN[a] && !used.includes(a)) ?? alternativesOf(s)[0];
    out.push({
      id: `why-${s}`,
      ask: `Why did you use ${shortName(s)} instead of ${shortName(other)}?`,
      verdict: 'think',
      answer: `${shortName(s)}: ${PICK_WHEN[s]} ${shortName(other)}: ${PICK_WHEN[other]}`,
    });
  }
  return out;
}
