import type { BandText, ServiceId, SourceSpec, XY } from './types';

export type Mood = 'happy' | 'think' | 'worried' | 'cheer';

export interface Beat {
  who: 'sparky' | 'rosa' | 'pager';
  mood?: Mood;
  text: BandText;
}

export interface LevelNode {
  id: string;
  service: ServiceId;
  pos: XY;
  label?: string;
  capacity?: number;
  /** Pre-placed pieces can be moved but not removed. */
  locked?: boolean;
  source?: SourceSpec;
}

/** An arrow that must exist. `from` and `to` are node ids or service ids, like `SourceSpec.needs`. */
export interface Requirement {
  from: string;
  to: string;
  /** What the arrow achieves, shown in the goal list. */
  label: string;
}

export interface Level {
  id: string;
  number: number;
  title: string;
  /** Short concept tag shown on the map. */
  concept: string;
  teaches: ServiceId[];
  intro: Beat[];
  goal: BandText;
  nodes: LevelNode[];
  edges: [string, string][];
  palette: { service: ServiceId; count: number }[];
  hints: BandText[];
  lesson: { title: string; text: BandText };
  /** Highest estimated monthly cost (see `COST`) for every piece on the board. */
  budget?: number;
  /** Arrows that must exist, such as an IAM role on a Lambda function. */
  requires?: Requirement[];
  /** Most requests per second that may pile up in queues. 0 means every queue must drain. */
  maxBacklog?: number;
  /** The intended answer. Used by tests and by the final "show me" hint. */
  solution: { add: { id: string; service: ServiceId }[]; connect: [string, string][]; remove?: [string, string][] };
}

export interface Chapter {
  id: string;
  /** Shown above the map title, e.g. "Chapter 1". */
  eyebrow: string;
  title: string;
  blurb: string;
  ending: BandText;
  /** What each level is called, e.g. "Level 3" or "Ticket 3". */
  unit: string;
  /** Speaker names shown in the story cards. */
  cast: Record<Beat['who'], string>;
  levels: Level[];
}

export const CHAPTER = {
  title: 'Crumb & Co. Goes Online',
  blurb: 'Help Baker Rosa bring the best bakery in Maple Hollow onto the internet.',
  ending: {
    builder:
      'Crumb & Co. is now the busiest bakery on the internet: fast, safe, and ready for any rush. You used 14 AWS services to build it!',
    explorer: 'Crumb & Co. is the most famous bakery online! You built it with 14 cloud helpers!',
    architect:
      'You built a CDN-fronted static site, a serverless order API, fan-out notifications, a horizontally scaled tier, a cache, a queue-backed worker, and a WAF. Nice architecture!',
  } as BandText,
};

const town = (id: string, label: string, y: number, source: SourceSpec): LevelNode => ({
  id,
  service: 'users',
  pos: { x: 30, y },
  label,
  locked: true,
  source,
});

export const LEVELS: Level[] = [
  {
    id: 'l1',
    number: 1,
    title: 'Open the Shop Window',
    concept: 'Storage',
    teaches: ['s3'],
    intro: [
      { who: 'sparky', mood: 'cheer', text: 'Hi, I’m Sparky! Welcome to Maple Hollow. Baker Rosa runs Crumb & Co., the best bakery in town.' },
      { who: 'rosa', text: 'I want the whole town to find my bakery online! But where do I keep my website’s pictures and pages?' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'In a Storage Bucket! It’s like a giant toy box in the cloud.',
          builder: 'Amazon S3 is a giant storage bucket in the AWS Cloud. It can hold web pages and pictures.',
          architect: 'Amazon S3 is object storage. It can host a static website (HTML, CSS, and images) straight from a bucket.',
        },
      },
    ],
    goal: {
      explorer: 'Put the Storage Bucket in the cloud. Then draw an arrow from the Townsfolk to it.',
      builder: 'Drag S3 into the AWS Cloud and connect the Townsfolk to it.',
      architect: 'Serve the bakery’s static site to 20 visitors from S3.',
    },
    nodes: [town('town', 'Maple Hollow', 200, { demand: 20, needs: ['s3'] })],
    edges: [],
    palette: [{ service: 's3', count: 1 }],
    hints: [
      'Drag the bucket from the tray at the bottom into the big cloud.',
      'Now press the round ⊕ on the Townsfolk and drag the arrow onto the bucket.',
    ],
    lesson: {
      title: 'S3 stores files',
      text: {
        explorer: 'The Storage Bucket keeps the bakery’s pictures and pages safe in the cloud.',
        builder: 'Amazon S3 stores files (called objects) in buckets. Websites, photos, and videos often live in S3.',
        architect: 'S3 is designed for 99.999999999% durability and can serve a static website directly. Objects are addressed by bucket and key.',
      },
    },
    solution: { add: [{ id: 'a', service: 's3' }], connect: [['town', 'a']] },
  },
  {
    id: 'l2',
    number: 2,
    title: 'What’s Our Address?',
    concept: 'DNS',
    teaches: ['route53'],
    intro: [
      { who: 'rosa', text: 'Uh-oh. People keep typing crumbandco.town, but they can’t find the website!' },
      {
        who: 'sparky',
        mood: 'think',
        text: {
          explorer: 'Computers find each other with number addresses. Route 53 is the Address Book that turns a name into a number!',
          builder: 'Computers use number addresses, like 203.0.113.42. Route 53 is the internet’s address book: it turns crumbandco.town into the right number.',
          architect: 'Route 53 is AWS’s DNS service. It resolves the domain name to the endpoint that serves your site.',
        },
      },
    ],
    goal: {
      explorer: 'Help the Townsfolk find the address in the Address Book, then go to the Storage Bucket.',
      builder: 'Townsfolk need to look up the address in Route 53 before they reach the S3 website.',
      architect: 'Resolve crumbandco.town through Route 53 to the S3 website endpoint.',
    },
    nodes: [
      town('town', 'Maple Hollow', 200, { demand: 30, needs: ['route53', 's3'] }),
      { id: 's3', service: 's3', pos: { x: 840, y: 200 }, locked: true },
    ],
    edges: [],
    palette: [{ service: 'route53', count: 1 }],
    hints: [
      'The Townsfolk should ask the Address Book first.',
      'Townsfolk → Address Book → Storage Bucket. Two arrows!',
    ],
    lesson: {
      title: 'Route 53 is the address book',
      text: {
        explorer: 'The Address Book helps people find a website by its name.',
        builder: 'DNS turns names people can remember into addresses computers can use. Route 53 is AWS’s DNS.',
        architect: 'Alias records let Route 53 point an apex domain at AWS resources such as S3 website endpoints, CloudFront, or load balancers.',
      },
    },
    solution: { add: [{ id: 'r', service: 'route53' }], connect: [['town', 'r'], ['r', 's3']] },
  },
  {
    id: 'l3',
    number: 3,
    title: 'Friends Far Away',
    concept: 'CDN',
    teaches: ['cloudfront'],
    intro: [
      { who: 'rosa', text: 'Great news! My cousin’s village across the sea wants to order bread too…' },
      { who: 'rosa', text: '…but they say the website is sooo slow for them.' },
      {
        who: 'sparky',
        mood: 'think',
        text: {
          explorer: 'Their village is far from the cloud. CloudFront is a Copy Shop that keeps copies of the website close to them, so it loads fast!',
          builder: 'Far-away visitors have to wait longer. CloudFront keeps copies of your files all over the world, so pages load fast for everyone.',
          architect: 'CloudFront is a CDN. Edge locations cache content close to viewers, cutting latency and taking load off the origin.',
        },
      },
    ],
    goal: {
      explorer: 'Send Faraway Village through the Copy Shop so the website is fast for them too.',
      builder: 'Make the website fast for Faraway Village by sending visitors through CloudFront.',
      architect: 'Front the S3 origin with CloudFront so far-away viewers get low latency.',
    },
    nodes: [
      town('town', 'Maple Hollow', 90, { demand: 30, needs: ['route53', 's3'] }),
      town('far', 'Faraway Village', 330, { demand: 60, needs: ['route53', 'cloudfront', 's3'], far: true }),
      { id: 'r53', service: 'route53', pos: { x: 400, y: 210 }, locked: true },
      { id: 's3', service: 's3', pos: { x: 960, y: 210 }, locked: true },
    ],
    edges: [
      ['town', 'r53'],
      ['far', 'r53'],
      ['r53', 's3'],
    ],
    palette: [{ service: 'cloudfront', count: 1 }],
    hints: [
      'Faraway Village has to pass through the Copy Shop (CloudFront).',
      'Make it Address Book → Copy Shop → Storage Bucket. Tap the old Address Book → Bucket arrow and snip it with ✂️.',
    ],
    lesson: {
      title: 'CloudFront keeps copies close',
      text: {
        explorer: 'The Copy Shop keeps copies near everyone, so the website is fast even far away.',
        builder: 'A CDN (content delivery network) keeps copies of files near people, so they load quickly everywhere. It also means fewer trips back to S3.',
        architect: 'Cache hits are served at the edge, and only misses go back to the origin. In this level about 80% are hits, so S3 sees only a fifth of the traffic.',
      },
    },
    solution: {
      add: [{ id: 'cf', service: 'cloudfront' }],
      connect: [['r53', 'cf'], ['cf', 's3']],
      remove: [['r53', 's3']],
    },
  },
  {
    id: 'l4',
    number: 4,
    title: 'Order Up!',
    concept: 'Serverless',
    teaches: ['apigw', 'lambda', 'dynamodb'],
    intro: [
      { who: 'rosa', text: 'Customers want to ORDER bread online, not just read the menu!' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'Orders need three helpers: a Front Desk to take the order, a Helper Robot to do the work, and a Speedy Notebook to write it down.',
          builder: 'Taking orders needs a little system: API Gateway takes the request, Lambda runs the code, and DynamoDB saves the order.',
          architect: 'Build a serverless API: API Gateway → Lambda → DynamoDB. There are no servers to manage, and it scales with demand.',
        },
      },
    ],
    goal: {
      explorer: 'Get every order written down in the Speedy Notebook.',
      builder: 'Get all 50 orders from Hungry Customers saved in DynamoDB.',
      architect: 'Persist 50 orders/tick through API Gateway and Lambda into DynamoDB.',
    },
    nodes: [town('hungry', 'Hungry Customers', 200, { demand: 50, needs: ['apigw', 'lambda', 'dynamodb'] })],
    edges: [],
    palette: [
      { service: 'apigw', count: 1 },
      { service: 'lambda', count: 1 },
      { service: 'dynamodb', count: 1 },
    ],
    hints: [
      'Start with the customers: Hungry Customers → Front Desk.',
      'Then Front Desk → Helper Robot → Speedy Notebook.',
    ],
    lesson: {
      title: 'Serverless: no servers to babysit',
      text: {
        explorer: 'The Helper Robot only wakes up when there’s an order. Then it naps!',
        builder: 'Lambda only runs when someone needs it, and you only pay when it runs. API Gateway is the front door, and DynamoDB remembers every order.',
        architect: 'This is the classic serverless pattern. Lambda scales concurrency automatically, and DynamoDB on-demand capacity follows the traffic.',
      },
    },
    solution: {
      add: [
        { id: 'a', service: 'apigw' },
        { id: 'l', service: 'lambda' },
        { id: 'd', service: 'dynamodb' },
      ],
      connect: [['hungry', 'a'], ['a', 'l'], ['l', 'd']],
    },
  },
  {
    id: 'l5',
    number: 5,
    title: 'Ding! Bread’s Ready',
    concept: 'Fan-out',
    teaches: ['sns'],
    intro: [
      { who: 'rosa', text: 'Customers keep calling: “Is my bread ready yet?” I can’t hear the oven timer over all the ringing!' },
      {
        who: 'sparky',
        mood: 'cheer',
        text: {
          explorer: 'SNS is a Megaphone! Say it once, and everyone who signed up hears it.',
          builder: 'Let’s send them a message instead! SNS is a megaphone: one message goes out to lots of places at once.',
          architect: 'SNS is pub/sub messaging. Publish once to a topic, and it fans out to every subscriber, including SMS and mobile push.',
        },
      },
    ],
    goal: {
      explorer: 'Save each order AND ding the Customer Phones and the Kitchen Tablet.',
      builder: 'Save each order AND send a “ready!” message to both Customer Phones and the Kitchen Tablet.',
      architect: 'Keep persisting orders, and fan out a notification to both subscribers.',
    },
    nodes: [
      town('hungry', 'Hungry Customers', 40, { demand: 40, needs: ['dynamodb', 'cust', 'kitchen'] }),
      { id: 'cust', service: 'phone', pos: { x: 40, y: 300 }, label: 'Customer Phones', locked: true },
      { id: 'kitchen', service: 'phone', pos: { x: 40, y: 470 }, label: 'Kitchen Tablet', locked: true },
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 40 }, locked: true },
      { id: 'lambda', service: 'lambda', pos: { x: 640, y: 40 }, locked: true },
      { id: 'ddb', service: 'dynamodb', pos: { x: 920, y: 40 }, locked: true },
    ],
    edges: [
      ['hungry', 'apigw'],
      ['apigw', 'lambda'],
      ['lambda', 'ddb'],
    ],
    palette: [{ service: 'sns', count: 1 }],
    hints: [
      'The Helper Robot can tell the Megaphone, too.',
      'Helper Robot → Megaphone. Then Megaphone → Customer Phones and Megaphone → Kitchen Tablet.',
    ],
    lesson: {
      title: 'One message, many listeners',
      text: {
        explorer: 'The Megaphone says it once, and everybody hears it.',
        builder: 'With SNS, the helper says it once and SNS delivers it to every subscriber. That’s called fan-out.',
        architect: 'Pub/sub decouples publishers from subscribers. You can add email, SQS, or Lambda subscribers without changing the publisher.',
      },
    },
    solution: {
      add: [{ id: 'sns', service: 'sns' }],
      connect: [['lambda', 'sns'], ['sns', 'cust'], ['sns', 'kitchen']],
    },
  },
  {
    id: 'l6',
    number: 6,
    title: 'Cake Designer Rush',
    concept: 'Scaling',
    teaches: ['ec2', 'elb', 'autoscaling'],
    intro: [
      { who: 'rosa', text: 'My new Cake Designer app runs on one Cloud Computer. And today is the BIG birthday-cake sale!' },
      {
        who: 'sparky',
        mood: 'worried',
        text: {
          explorer: 'Uh-oh. 150 people are on the way, but one Cloud Computer can only help 50 at a time. Press Run to see what happens!',
          builder: 'One EC2 server can handle about 50 visitors at a time, and 150 are on the way. Press Run and watch its meter!',
          architect: 'One EC2 instance tops out around 50 req/s for this app, and expected load is 150 req/s. Press Run, then scale out.',
        },
      },
    ],
    goal: {
      explorer: 'Help all 150 cake designers without any computer getting too busy.',
      builder: 'Serve all 150 visitors without overloading any server.',
      architect: 'Handle 150 req/s with no overloaded instance.',
    },
    nodes: [
      town('crowd', 'Birthday Sale Crowd', 200, { demand: 150, needs: ['ec2'] }),
      { id: 'ec2', service: 'ec2', pos: { x: 760, y: 200 }, label: 'Cake Designer', locked: true },
    ],
    edges: [['crowd', 'ec2']],
    palette: [
      { service: 'elb', count: 1 },
      { service: 'ec2', count: 2 },
      { service: 'autoscaling', count: 1 },
    ],
    hints: [
      'One computer can’t do it alone. What if there were more computers?',
      'Put the Crossing Guard between the crowd and the computers, and connect it to all 3. Or let the Clone Machine help the Cake Designer!',
    ],
    lesson: {
      title: 'Scale out: more helpers',
      text: {
        explorer: 'When one computer is too busy, add more and let the Crossing Guard share the work.',
        builder: 'When one server is too busy, add more and let a load balancer share the work. Auto Scaling can even add servers automatically when it gets busy.',
        architect: 'Scaling horizontally behind an ALB, with an Auto Scaling group spread across Availability Zones, gives you both capacity and fault tolerance.',
      },
    },
    solution: {
      add: [
        { id: 'lb', service: 'elb' },
        { id: 'e2', service: 'ec2' },
        { id: 'e3', service: 'ec2' },
      ],
      connect: [['crowd', 'lb'], ['lb', 'ec2'], ['lb', 'e2'], ['lb', 'e3']],
      remove: [['crowd', 'ec2']],
    },
  },
  {
    id: 'l7',
    number: 7,
    title: 'Menu Mania',
    concept: 'Caching',
    teaches: ['rds', 'elasticache'],
    intro: [
      { who: 'rosa', text: 'Everybody keeps checking today’s menu. The Filing Cabinet is getting crushed!' },
      {
        who: 'sparky',
        mood: 'think',
        text: {
          explorer: 'The menu is the same for everyone! Sticky Notes can remember the answer, so the Filing Cabinet doesn’t have to look it up every time.',
          builder: 'Almost everyone asks the same question: “What’s on the menu?” ElastiCache remembers recent answers in super-fast memory, so the RDS database gets a break.',
          architect: 'It’s a read-heavy workload: 200 req/s against an RDS instance that handles about 60. Add a cache-aside layer with ElastiCache.',
        },
      },
    ],
    goal: {
      explorer: 'Answer every menu check without the Filing Cabinet getting too busy.',
      builder: 'Answer 200 menu checks without overloading the RDS filing cabinet.',
      architect: 'Serve 200 req/s of reads while keeping RDS under its ~60 req/s limit.',
    },
    nodes: [
      town('checkers', 'Menu Checkers', 200, { demand: 200, needs: ['apigw', 'lambda', 'rds'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 200 }, locked: true },
      { id: 'lambda', service: 'lambda', pos: { x: 640, y: 200 }, locked: true },
      { id: 'rds', service: 'rds', pos: { x: 940, y: 200 }, locked: true },
    ],
    edges: [
      ['checkers', 'apigw'],
      ['apigw', 'lambda'],
      ['lambda', 'rds'],
    ],
    palette: [{ service: 'elasticache', count: 1 }],
    hints: [
      'Give the Helper Robot something to remember answers with.',
      'Connect Helper Robot → Sticky Notes. The Robot will check the notes first!',
    ],
    lesson: {
      title: 'Caching means remembering answers',
      text: {
        explorer: 'Sticky Notes remember popular answers, so nobody has to look them up again and again.',
        builder: 'A cache keeps answers to popular questions in fast memory. Fewer trips to the database means everything is faster.',
        architect: 'Cache-aside with an ~80% hit ratio cut database load from 200 to 40 req/s. Set TTLs carefully to avoid serving stale data.',
      },
    },
    solution: { add: [{ id: 'c', service: 'elasticache' }], connect: [['lambda', 'c']] },
  },
  {
    id: 'l8',
    number: 8,
    title: 'The Oven Can’t Keep Up',
    concept: 'Queues',
    teaches: ['sqs'],
    intro: [
      { who: 'rosa', text: 'Lunch rush! Orders pour in all at once, and my Oven Computer can only bake 30 at a time. Some orders are getting LOST!' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'Let’s make a Ticket Line! Orders wait their turn, and the oven takes the next one when it’s ready. No order gets lost.',
          builder: 'SQS is a queue, like the ticket line at a deli. Orders wait safely in line, and the oven takes the next one when it’s ready.',
          architect: 'Decouple the API from the worker with SQS. The queue absorbs the burst, and the worker drains it at its own pace.',
        },
      },
    ],
    goal: {
      explorer: 'Don’t lose a single order! Make orders wait in line.',
      builder: 'Don’t lose a single order! Orders should wait in line instead of overloading the oven.',
      architect: 'Zero dropped orders: buffer the 90 req/s burst for a 30 req/s worker.',
    },
    nodes: [
      town('lunch', 'Lunch Rush', 200, { demand: 90, needs: ['ec2'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 200 }, locked: true },
      { id: 'oven', service: 'ec2', pos: { x: 940, y: 200 }, label: 'Oven Computer', capacity: 30, locked: true },
    ],
    edges: [
      ['lunch', 'apigw'],
      ['apigw', 'oven'],
    ],
    palette: [{ service: 'sqs', count: 1 }],
    hints: [
      'Put the Ticket Line between the Front Desk and the oven.',
      'Snip the old Front Desk → Oven arrow with ✂️, so every order goes through the line.',
    ],
    lesson: {
      title: 'Queues smooth out rushes',
      text: {
        explorer: 'In a line, everyone waits their turn, and nobody gets lost!',
        builder: 'A queue holds work until a worker is ready, so a sudden rush doesn’t break anything. The oven just keeps baking until the line is empty.',
        architect: 'SQS buffers bursts, retries through visibility timeouts, and lets producers and consumers scale independently. Watch the queue depth metric.',
      },
    },
    solution: {
      add: [{ id: 'q', service: 'sqs' }],
      connect: [['apigw', 'q'], ['q', 'oven']],
      remove: [['apigw', 'oven']],
    },
  },
  {
    id: 'l9',
    number: 9,
    title: 'Gremlin Bots!',
    concept: 'Security',
    teaches: ['waf'],
    intro: [
      { who: 'rosa', text: 'Something’s wrong! The website is swamped, but hardly anyone is buying…' },
      {
        who: 'sparky',
        mood: 'worried',
        text: {
          explorer: 'Gremlin Bots! They’re fake visitors that clog everything up. A Gate Guard can spot them and keep them out.',
          builder: 'Those aren’t real customers. They’re bots! AWS WAF is a gate guard that checks every visitor and blocks the bad ones.',
          architect: 'It’s a bot flood: 70% of the traffic is malicious. Put AWS WAF in front to filter it with rate-based and Bot Control rules.',
        },
      },
    ],
    goal: {
      explorer: 'Keep the Gremlin Bots out so real customers can shop.',
      builder: 'Keep the gremlin bots out so the 60 real customers get through.',
      architect: 'Filter 140 req/s of bot traffic so the 60 legitimate req/s are served.',
    },
    nodes: [
      town('crowd', 'Visitors', 200, { demand: 60, bots: 140, needs: ['ec2'] }),
      { id: 'lb', service: 'elb', pos: { x: 580, y: 200 }, locked: true },
      { id: 'web1', service: 'ec2', pos: { x: 920, y: 70 }, label: 'Shop Server 1', locked: true },
      { id: 'web2', service: 'ec2', pos: { x: 920, y: 340 }, label: 'Shop Server 2', locked: true },
    ],
    edges: [
      ['crowd', 'lb'],
      ['lb', 'web1'],
      ['lb', 'web2'],
    ],
    palette: [{ service: 'waf', count: 1 }],
    hints: [
      'Every visitor should walk past the Gate Guard first.',
      'Make it Visitors → Gate Guard → Crossing Guard, and snip the old Visitors → Crossing Guard arrow with ✂️.',
    ],
    lesson: {
      title: 'Security: check who’s at the door',
      text: {
        explorer: 'The Gate Guard keeps gremlins out, so real customers can get in.',
        builder: 'WAF (web application firewall) looks at each request and blocks the bad ones, like bots, before they reach your servers.',
        architect: 'WAF web ACLs with managed rule groups, rate-based rules, and Bot Control protect CloudFront, ALB, and API Gateway. Pair WAF with Shield for DDoS protection.',
      },
    },
    solution: {
      add: [{ id: 'w', service: 'waf' }],
      connect: [['crowd', 'w'], ['w', 'lb']],
      remove: [['crowd', 'lb']],
    },
  },
];

export const CHAPTER_1: Chapter = {
  id: 'ch1',
  eyebrow: 'Chapter 1',
  ...CHAPTER,
  unit: 'Level',
  cast: { sparky: 'Sparky', rosa: 'Baker Rosa', pager: 'Alert' },
  levels: LEVELS,
};
