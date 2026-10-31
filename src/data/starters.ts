import type { SavedDiagram, SavedNode } from '../store';
import type { ServiceId } from './types';

export interface Starter {
  id: string;
  title: string;
  /** Example problems this kind of plan fits. */
  examples: string;
  diagram: SavedDiagram;
}

const at = (id: string, service: ServiceId, x: number, y: number, extra: Partial<SavedNode> = {}): SavedNode => ({
  id,
  service,
  pos: { x, y },
  ...extra,
});
const people = (label: string, demand: number) => at('people', 'users', 30, 260, { label, source: { demand } });
const arrows = (...pairs: [string, string][]) => pairs.map(([source, target]) => ({ source, target }));

/** Working first plans for the kinds of problems STLP teams pick. Each one passes when you press Run. */
export const STARTERS: Starter[] = [
  {
    id: 'share',
    title: 'Share information',
    examples: 'Library events, club news, a town guide',
    diagram: {
      nodes: [people('Visitors', 200), at('cdn', 'cloudfront', 360, 260), at('files', 's3', 600, 260)],
      edges: arrows(['people', 'cdn'], ['cdn', 'files']),
      goal: { what: 'read the library’s event list' },
    },
  },
  {
    id: 'signups',
    title: 'Collect sign-ups or reports',
    examples: 'Volunteers, pothole reports, lost pets',
    diagram: {
      nodes: [
        people('Volunteers', 80),
        at('api', 'apigw', 360, 260),
        at('fn', 'lambda', 580, 260),
        at('db', 'dynamodb', 800, 260),
      ],
      edges: arrows(['people', 'api'], ['api', 'fn'], ['fn', 'db']),
      goal: { what: 'sign up for the park cleanup' },
    },
  },
  {
    id: 'alerts',
    title: 'Send alerts',
    examples: 'Late buses, weather closings, food pickups',
    diagram: {
      nodes: [
        people('School office', 10),
        at('api', 'apigw', 360, 260),
        at('fn', 'lambda', 580, 260),
        at('alert', 'sns', 800, 260),
        at('phones', 'phone', 1020, 260, { label: 'Family phones' }),
      ],
      edges: arrows(['people', 'api'], ['api', 'fn'], ['fn', 'alert'], ['alert', 'phones']),
      goal: { what: 'send a late-bus alert' },
    },
  },
  {
    id: 'ai',
    title: 'Answer questions with AI',
    examples: 'A helper for new students or visitors',
    diagram: {
      nodes: [
        people('New students', 60),
        at('api', 'apigw', 360, 260),
        at('fn', 'lambda', 580, 260),
        at('ai', 'bedrock', 800, 260),
      ],
      edges: arrows(['people', 'api'], ['api', 'fn'], ['fn', 'ai']),
      goal: { what: 'get answers about clubs and schedules' },
    },
  },
  {
    id: 'photos',
    title: 'Understand photos',
    examples: 'Sort the lost-and-found, spot litter',
    diagram: {
      nodes: [
        people('Students', 40),
        at('photos', 's3', 360, 260),
        at('fn', 'lambda', 580, 260),
        at('look', 'rekognition', 800, 160),
        at('db', 'dynamodb', 800, 360),
      ],
      edges: arrows(['people', 'photos'], ['photos', 'fn'], ['fn', 'look'], ['fn', 'db']),
      goal: { what: 'find a lost item from a photo' },
    },
  },
  {
    id: 'languages',
    title: 'Reach more languages',
    examples: 'Notes home, signs, announcements',
    diagram: {
      nodes: [
        people('Families', 60),
        at('api', 'apigw', 360, 260),
        at('fn', 'lambda', 580, 260),
        at('words', 'translate', 800, 160),
        at('voice', 'polly', 800, 360),
      ],
      edges: arrows(['people', 'api'], ['api', 'fn'], ['fn', 'words'], ['fn', 'voice']),
      goal: { what: 'read and hear notes home in their language' },
    },
  },
];
