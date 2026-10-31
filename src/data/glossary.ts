import { SERVICES, shortName } from './services';
import type { ServiceId } from './types';

/**
 * Tap-to-define words for the Architect band, which is also what College players get. The text stays technical; any
 * term in it can be tapped for a definition in everyday words. Each definition must make sense read on its own.
 */
export interface Term {
  id: string;
  title: string;
  def: string;
}

const TERMS: (Term & { words: string[] })[] = [
  // ── the web ─────────────────────────────────────────────────
  {
    id: 'url', title: 'URL', words: ['URL', 'web address'],
    def: 'A web address, like crumbandco.town/order. Typing it into a browser, or calling it from an app, reaches that page or service.',
  },
  {
    id: 'api', title: 'API', words: ['API', 'public API'],
    def: 'How one program asks another for something. An app sends a request like “place this order,” and the API sends back an answer.',
  },
  {
    id: 'api-key', title: 'API key', words: ['API key'],
    def: 'A secret code an app sends with each request to prove it’s allowed to use another company’s API.',
  },
  {
    id: 'endpoint', title: 'Endpoint', words: ['endpoint'],
    def: 'An address (a URL) where a service waits for requests.',
  },
  {
    id: 'reqs', title: 'req/s', words: ['req/s'],
    def: 'Requests per second: how many times each second people’s apps ask your system for something.',
  },
  {
    id: 'traffic', title: 'Traffic', words: ['traffic'],
    def: 'All the requests flowing into your system. More traffic means more work for every piece.',
  },
  {
    id: 'latency', title: 'Latency', words: ['latency'],
    def: 'The wait between asking for something and getting the answer. Lower is faster.',
  },
  {
    id: 'cdn', title: 'CDN', words: ['CDN'],
    def: 'A content delivery network: copies of files kept near people, so pages load quickly everywhere.',
  },
  {
    id: 'dns', title: 'DNS', words: ['DNS'],
    def: 'The internet’s address book. It turns names people can remember into the number addresses computers use.',
  },
  {
    id: 'edge', title: 'Edge', words: ['edge', 'edge location'],
    def: 'AWS sites all over the world, close to the people using an app, that keep copies of files so they load fast.',
  },
  {
    id: 'origin', title: 'Origin', words: ['origin'],
    def: 'The main place a website’s files and answers come from. A CDN asks the origin only when it doesn’t have a copy.',
  },
  {
    id: 'cache', title: 'Cache', words: ['cache'],
    def: 'A nearby copy of an answer, kept so the same request doesn’t have to go all the way back to the origin.',
  },
  {
    id: 'static', title: 'Static', words: ['static'],
    def: 'Files that are the same for everyone, like pictures and the menu page.',
  },
  {
    id: 'dynamic', title: 'Dynamic', words: ['dynamic'],
    def: 'Pages built fresh for each person, like a checkout that knows what’s in your cart.',
  },

  // ── running code ────────────────────────────────────────────
  {
    id: 'function', title: 'Function', words: ['function'],
    def: 'A small piece of code that runs when something asks for it. On AWS, Lambda runs functions.',
  },
  {
    id: 'serverless', title: 'Serverless', words: ['serverless'],
    def: 'AWS runs the computers for you. You hand over code or data and pay only for what you use.',
  },
  {
    id: 'instance', title: 'Instance', words: ['instance'],
    def: 'One virtual computer rented from AWS. Each one can only handle so much work at a time.',
  },
  {
    id: 'monolith', title: 'Monolith', words: ['monolith', 'Monolith'],
    def: 'One big program that does every job, so the whole thing has to grow, or fail, together.',
  },
  {
    id: 'container', title: 'Container', words: ['container'],
    def: 'A neat package that holds a program and everything it needs, so it runs the same anywhere.',
  },
  {
    id: 'scaling', title: 'Scaling', words: ['scaling', 'scales', 'scaling out'],
    def: 'Adding more workers when requests go up, and removing them when things are quiet, so you only pay for what you need.',
  },
  {
    id: 'capacity', title: 'Capacity', words: ['capacity'],
    def: 'How much work a piece can handle at once before requests start failing.',
  },

  // ── data ────────────────────────────────────────────────────
  {
    id: 'database', title: 'Database', words: ['database'],
    def: 'An organized store of information that an app can search and update quickly.',
  },
  {
    id: 'table', title: 'Table', words: ['table'],
    def: 'Where a database keeps one kind of record, like every order, in rows like a spreadsheet.',
  },
  {
    id: 'queue', title: 'Queue', words: ['queue'],
    def: 'A waiting line for work. Jobs wait safely in order until a worker is free to take the next one.',
  },
  {
    id: 'data-lake', title: 'Data lake', words: ['data lake'],
    def: 'One big store that keeps lots of raw information, like every click, ready to study later.',
  },
  {
    id: 'sql', title: 'SQL', words: ['SQL'],
    def: 'A language for asking a database questions, like “how many orders came in this week?”',
  },
  {
    id: 'fan-out', title: 'Fan-out', words: ['fan-out', 'Fan-out'],
    def: 'Sending one message to many listeners at once, so each system gets its own copy.',
  },

  // ── security ────────────────────────────────────────────────
  {
    id: 'role', title: 'Role', words: ['role'],
    def: 'A badge of permissions a service carries. It says exactly what that service is allowed to do.',
  },
  {
    id: 'least-privilege', title: 'Least privilege', words: ['least privilege', 'least-privilege', 'Least Privilege'],
    def: 'Give each part only the permissions it truly needs, and nothing more.',
  },
  {
    id: 'encryption', title: 'Encryption', words: ['encryption', 'encrypt', 'encrypted'],
    def: 'Scrambling information with a key, so only someone with the right key can read it.',
  },
  {
    id: 'key', title: 'Key', words: ['key'],
    def: 'In security, a secret value that locks (encrypts) information and unlocks it again. In S3, a key is simply a file’s name inside its bucket.',
  },
  {
    id: 'cmk', title: 'Customer managed key', words: ['customer managed key'],
    def: 'An encryption key your own team creates and controls, instead of one AWS manages for you.',
  },
  {
    id: 'at-rest', title: 'At rest', words: ['at rest'],
    def: 'Information that is stored, sitting on a disk, rather than moving across the network.',
  },
  {
    id: 'audit-trail', title: 'Audit trail', words: ['audit trail'],
    def: 'A record of who did what, and when, so it can be checked later.',
  },
  {
    id: 'authorizer', title: 'Authorizer', words: ['authorizer'],
    def: 'A check in front of an API that turns away requests from people who haven’t signed in.',
  },
  {
    id: 'credentials', title: 'Credentials', words: ['credentials'],
    def: 'Proof of who you are, like a username and password or a secret key.',
  },
  {
    id: 'identity', title: 'Identity', words: ['identity'],
    def: 'Who is making a request, checked when they sign in.',
  },
  {
    id: 'ddos', title: 'DDoS', words: ['DDoS'],
    def: 'A flood of fake traffic from many computers at once, meant to knock a website offline.',
  },
  {
    id: 'botnet', title: 'Botnet', words: ['botnet'],
    def: 'Many hacked computers controlled by one attacker and used together, often to flood a website with fake traffic.',
  },

  // ── AI ──────────────────────────────────────────────────────
  {
    id: 'model', title: 'AI model', words: ['model', 'language model'],
    def: 'A program trained on lots of examples, so it can make predictions or write and answer in everyday language.',
  },
  {
    id: 'agent', title: 'AI agent', words: ['agent'],
    def: 'An AI helper that decides what steps to take and uses tools, like looking up an order, instead of only chatting.',
  },
];

// Names the copy uses for a service besides its full and short names.
const ALSO: Partial<Record<ServiceId, string[]>> = {
  autoscaling: ['Auto Scaling'],
  elb: ['load balancer', 'Load Balancer'],
  glacier: ['Glacier'],
  kinesis: ['Kinesis'],
  firehose: ['Firehose'],
  sagemaker: ['SageMaker'],
  agentcore: ['AgentCore'],
  shield: ['Shield Standard', 'Shield Advanced'],
  glue: ['Glue Data Catalog'],
};

// Services are defined with their Builder blurb: the Architect one assumes the words this is here to explain.
const SERVICE_TERMS: (Term & { words: string[] })[] = Object.values(SERVICES)
  .filter((s) => s.category !== 'town')
  .map((s) => ({ id: s.id, title: s.name, def: s.blurb.builder, words: [s.name, shortName(s.id), ...(ALSO[s.id] ?? [])] }));

const BY_WORD = new Map<string, Term>();
for (const t of [...TERMS, ...SERVICE_TERMS]) {
  for (const w of t.words) {
    BY_WORD.set(w, t);
    // A sentence can start with any lowercase term.
    if (/^[a-z]/.test(w)) BY_WORD.set(w[0].toUpperCase() + w.slice(1), t);
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Longest first, so "API Gateway" wins over "API". An optional "s" covers plurals. Every word starts and ends with a
// letter or digit, so \b marks its edges (and older iPads' Safari can't read lookbehinds).
const PATTERN = new RegExp(`\\b(${[...BY_WORD.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')})(s?)\\b`, 'g');

export type Piece = string | { term: Term; text: string };

/** Splits text into plain runs and terms. Only a term's first appearance is marked, so a line doesn't fill with underlines. */
export function findTerms(text: string): Piece[] {
  const out: Piece[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const term = BY_WORD.get(m[1])!;
    if (seen.has(term.id)) continue;
    seen.add(term.id);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ term, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
