import type { Category, ServiceDef, ServiceId } from './types';

const INF = Number.POSITIVE_INFINITY;

const list: ServiceDef[] = [
  // ── Town (not AWS) ──────────────────────────────────────────
  {
    id: 'users', name: 'Users', nickname: 'Townsfolk', category: 'town', basic: true,
    job: 'are the people using the app',
    blurb: {
      explorer: 'People in town who want to use the website.',
      builder: 'People using phones and laptops. Every arrow starts with them.',
      architect: 'Clients (browsers, mobile apps) that send requests into your system.',
    },
    capacity: INF, forward: 'split', answers: false, source: true,
  },
  {
    id: 'phone', name: 'Mobile devices', nickname: 'Phones', category: 'town', basic: true,
    job: 'receive messages',
    blurb: {
      explorer: 'Phones that can get a "ding!" message.',
      builder: 'Phones and tablets that receive texts and notifications.',
      architect: 'SMS / mobile push endpoints subscribed to notifications.',
    },
    capacity: INF, forward: 'none', answers: true,
  },

  // ── Networking ──────────────────────────────────────────────
  {
    id: 'route53', name: 'Amazon Route 53', nickname: 'Address Book', category: 'networking', basic: true,
    job: 'gives out website addresses',
    blurb: {
      explorer: 'Turns a website name into the address computers use, like a phone book.',
      builder: 'The internet’s address book. It turns names like crumbandco.town into number addresses.',
      architect: 'Managed DNS. Resolves domain names to endpoints with alias records, health checks, and routing policies.',
    },
    capacity: INF, forward: 'split', answers: false,
  },
  {
    id: 'cloudfront', name: 'Amazon CloudFront', nickname: 'Copy Shop', category: 'networking', basic: true,
    job: 'keeps copies of files close to people',
    blurb: {
      explorer: 'Keeps copies of the website near everyone so it loads fast.',
      builder: 'Keeps copies of files in places all over the world so pages load fast for everyone.',
      architect: 'CDN with 600+ edge locations. Caches content near viewers to cut latency and offload the origin.',
    },
    capacity: 3000, forward: 'split', answers: false, cdnHitRate: 0.8,
  },
  {
    id: 'apigw', name: 'Amazon API Gateway', nickname: 'Front Desk', category: 'networking', basic: true,
    job: 'takes requests at the front desk',
    blurb: {
      explorer: 'The front desk. It takes requests and passes them to helpers.',
      builder: 'The front door for apps. It takes requests and sends them to the right code.',
      architect: 'Managed REST/HTTP/WebSocket APIs with auth, throttling, and integrations to Lambda and AWS services.',
    },
    capacity: 1000, forward: 'split', answers: false,
  },
  {
    id: 'elb', name: 'Elastic Load Balancing', nickname: 'Crossing Guard', category: 'networking', basic: true,
    job: 'shares visitors between servers',
    blurb: {
      explorer: 'Sends each visitor to a computer that isn’t busy.',
      builder: 'Spreads visitors evenly across servers so no single one gets overloaded.',
      architect: 'Distributes traffic across healthy targets (EC2, Lambda, IPs) in multiple Availability Zones.',
    },
    capacity: 1000, forward: 'split', answers: false,
  },

  // ── Security ────────────────────────────────────────────────
  {
    id: 'waf', name: 'AWS WAF', nickname: 'Gate Guard', category: 'security', basic: true,
    job: 'blocks bad bots at the gate',
    blurb: {
      explorer: 'A guard at the gate who keeps out gremlin bots.',
      builder: 'A web firewall. It checks each visitor and blocks bots and attacks.',
      architect: 'Web application firewall. Rules, rate limits, and Bot Control filter requests to CloudFront, ALB, and API Gateway.',
    },
    capacity: INF, forward: 'split', answers: false, filtersBots: true,
  },
  {
    id: 'cognito', name: 'Amazon Cognito', nickname: 'Name Tag Desk', category: 'security',
    job: 'handles signing in',
    blurb: {
      explorer: 'Gives people a name tag when they sign in.',
      builder: 'Handles sign-up and sign-in so apps know who you are.',
      architect: 'User pools issue JWTs after authentication; identity pools exchange them for AWS credentials.',
    },
    capacity: 1000, forward: 'none', answers: true,
  },

  // ── Compute ─────────────────────────────────────────────────
  {
    id: 'lambda', name: 'AWS Lambda', nickname: 'Helper Robot', category: 'compute', basic: true,
    job: 'runs little bits of code when asked',
    blurb: {
      explorer: 'A helper robot that wakes up, does one job, then naps.',
      builder: 'Runs your code only when it’s needed. No computer to look after, and it grows with the crowd.',
      architect: 'Event-driven serverless compute. Scales concurrency automatically and bills per request and duration.',
    },
    capacity: 1000, forward: 'broadcast', answers: true,
  },
  {
    id: 'ec2', name: 'Amazon EC2', nickname: 'Cloud Computer', category: 'compute', basic: true,
    job: 'is a computer you rent in the cloud',
    blurb: {
      explorer: 'A computer you borrow in the cloud. It can only help so many people at once.',
      builder: 'A virtual server you rent. You pick its size, and it can only handle so much at a time.',
      architect: 'Virtual machines with chosen instance types. You scale them horizontally behind a load balancer.',
    },
    capacity: 50, forward: 'broadcast', answers: true,
  },
  {
    id: 'autoscaling', name: 'Amazon EC2 Auto Scaling', nickname: 'Clone Machine', category: 'compute',
    job: 'adds or removes servers',
    blurb: {
      explorer: 'Makes more Cloud Computers when it gets busy.',
      builder: 'Adds servers when it’s busy and removes them when it’s quiet.',
      architect: 'Auto Scaling groups launch and terminate instances from a launch template using scaling policies.',
    },
    capacity: INF, forward: 'none', answers: false,
  },

  // ── Storage ─────────────────────────────────────────────────
  {
    id: 's3', name: 'Amazon S3', nickname: 'Storage Bucket', category: 'storage', basic: true,
    job: 'stores files like pictures and web pages',
    blurb: {
      explorer: 'A giant toy box in the cloud for pictures and web pages.',
      builder: 'Stores files (called objects) in buckets. Websites, photos, and videos often live here.',
      architect: 'Object storage designed for 11 nines of durability. Can host static websites and emit events.',
    },
    capacity: 3000, forward: 'broadcast', answers: true,
  },
  {
    id: 'glacier', name: 'Amazon S3 Glacier', nickname: 'Deep Freezer', category: 'storage',
    job: 'stores old files cheaply in the deep freeze',
    blurb: {
      explorer: 'Keeps old stuff frozen and safe for a long time.',
      builder: 'Super cheap storage for old files you rarely need.',
      architect: 'Archive storage classes with retrieval times from milliseconds to hours, at very low cost.',
    },
    capacity: INF, forward: 'none', answers: true,
  },

  // ── Databases ───────────────────────────────────────────────
  {
    id: 'dynamodb', name: 'Amazon DynamoDB', nickname: 'Speedy Notebook', category: 'databases', basic: true,
    job: 'saves data super fast',
    blurb: {
      explorer: 'A super-fast notebook that never runs out of pages.',
      builder: 'A super-fast database that grows as big as you need.',
      architect: 'Serverless key-value / document database with single-digit-millisecond latency at any scale.',
    },
    capacity: 1000, forward: 'broadcast', answers: true,
  },
  {
    id: 'rds', name: 'Amazon RDS', nickname: 'Filing Cabinet', category: 'databases',
    job: 'keeps data in neat tables',
    blurb: {
      explorer: 'A filing cabinet with neat folders. Looking things up takes a little time.',
      builder: 'A database with tables, like a spreadsheet. A single one can only answer so many questions at once.',
      architect: 'Managed relational databases (PostgreSQL, MySQL, and more). Capacity is bound by instance size.',
    },
    capacity: 60, forward: 'none', answers: true,
  },
  {
    id: 'elasticache', name: 'Amazon ElastiCache', nickname: 'Sticky Notes', category: 'databases',
    job: 'remembers recent answers for a short time',
    blurb: {
      explorer: 'Sticky notes that remember popular answers.',
      builder: 'Super-fast memory that remembers popular answers so the database gets a break.',
      architect: 'In-memory cache (Valkey, Redis OSS, Memcached) for microsecond reads and cache-aside patterns.',
    },
    capacity: 1000, forward: 'none', answers: true, cache: true,
  },

  // ── Application integration ─────────────────────────────────
  {
    id: 'sqs', name: 'Amazon SQS', nickname: 'Ticket Line', category: 'integration', basic: true,
    job: 'holds tickets in a waiting line',
    blurb: {
      explorer: 'A waiting line. Everyone gets a ticket and waits their turn.',
      builder: 'A queue. Work waits safely in line until a worker is ready.',
      architect: 'Fully managed message queue. Buffers bursts and decouples producers from consumers.',
    },
    capacity: INF, forward: 'split', answers: false, queue: true,
  },
  {
    id: 'sns', name: 'Amazon SNS', nickname: 'Megaphone', category: 'integration', basic: true,
    job: 'sends one message to many places',
    blurb: {
      explorer: 'Say it once and everyone who signed up hears it!',
      builder: 'Sends one message to lots of places at once: phones, emails, and other services.',
      architect: 'Pub/sub topics that fan out messages to SQS, Lambda, HTTP, SMS, and mobile push subscribers.',
    },
    capacity: INF, forward: 'broadcast', answers: false,
  },
  {
    id: 'eventbridge', name: 'Amazon EventBridge', nickname: 'Mail Sorter', category: 'integration',
    job: 'sorts events and sends them where they belong',
    blurb: {
      explorer: 'Sorts news into the right mailboxes.',
      builder: 'Watches for events, like “new order!”, and sends each one to whoever needs it.',
      architect: 'Serverless event bus. Rules match events by pattern and route them to targets.',
    },
    capacity: INF, forward: 'broadcast', answers: false,
  },
  {
    id: 'stepfunctions', name: 'AWS Step Functions', nickname: 'Checklist', category: 'integration',
    job: 'runs steps in order like a checklist',
    blurb: {
      explorer: 'A checklist that does step 1, then step 2, then step 3.',
      builder: 'Runs a list of steps in order, and retries if one fails.',
      architect: 'Visual state machines that orchestrate Lambda and 200+ AWS service integrations with retries.',
    },
    capacity: 1000, forward: 'broadcast', answers: false,
  },

  // ── Management ──────────────────────────────────────────────
  {
    id: 'cloudwatch', name: 'Amazon CloudWatch', nickname: 'Watchtower', category: 'management',
    job: 'watches everything and keeps score',
    blurb: {
      explorer: 'A watchtower that keeps an eye on everything.',
      builder: 'Collects numbers and logs from your services and sounds an alarm when something looks wrong.',
      architect: 'Metrics, logs, dashboards, and alarms that can trigger SNS or Auto Scaling actions.',
    },
    capacity: INF, forward: 'none', answers: true,
  },

  // ── Analytics ───────────────────────────────────────────────
  {
    id: 'kinesis', name: 'Amazon Kinesis Data Streams', nickname: 'Conveyor Belt', category: 'analytics',
    job: 'carries a nonstop stream of data',
    blurb: {
      explorer: 'A conveyor belt that never stops moving data along.',
      builder: 'Carries a nonstop stream of data, like game scores or sensor readings.',
      architect: 'Real-time streaming with shards. Multiple consumers read ordered records within a retention window.',
    },
    capacity: 1000, forward: 'broadcast', answers: true,
  },

  // ── AI ──────────────────────────────────────────────────────
  {
    id: 'rekognition', name: 'Amazon Rekognition', nickname: 'Picture Detective', category: 'ai', basic: true,
    job: 'recognizes what’s in pictures',
    blurb: {
      explorer: 'Looks at a picture and says what’s in it: “A cat!”',
      builder: 'Looks at pictures and videos and finds objects, text, and faces.',
      architect: 'Computer-vision APIs for labels, text, moderation, and face analysis.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'polly', name: 'Amazon Polly', nickname: 'Talking Parrot', category: 'ai', basic: true,
    job: 'turns text into speech',
    blurb: {
      explorer: 'Reads words out loud, like a talking parrot.',
      builder: 'Turns written text into lifelike speech.',
      architect: 'Text-to-speech with neural voices and SSML control.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'translate', name: 'Amazon Translate', nickname: 'Translator', category: 'ai',
    job: 'translates languages',
    blurb: {
      explorer: 'Changes words from one language to another.',
      builder: 'Translates text between dozens of languages.',
      architect: 'Neural machine translation API with custom terminology.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'bedrock', name: 'Amazon Bedrock', nickname: 'AI Brain', category: 'ai',
    job: 'gives access to AI models that can write and answer questions',
    blurb: {
      explorer: 'A smart AI helper that can write and answer questions.',
      builder: 'Lets apps use powerful AI models to write, summarize, and chat.',
      architect: 'Managed access to foundation models via a single API, with guardrails, knowledge bases, and agents.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
];

export const SERVICES: Record<ServiceId, ServiceDef> = Object.fromEntries(list.map((s) => [s.id, s])) as Record<
  ServiceId,
  ServiceDef
>;

export const SERVICE_LIST = list;

export const CATEGORIES: { id: Category; label: string; icon?: string }[] = [
  { id: 'town', label: 'Town' },
  { id: 'networking', label: 'Front doors & roads', icon: 'cat-networking' },
  { id: 'compute', label: 'Workers', icon: 'cat-compute' },
  { id: 'storage', label: 'Storage', icon: 'cat-storage' },
  { id: 'databases', label: 'Databases', icon: 'cat-databases' },
  { id: 'integration', label: 'Messengers', icon: 'cat-integration' },
  { id: 'security', label: 'Security', icon: 'cat-security' },
  { id: 'management', label: 'Watching', icon: 'cat-management' },
  { id: 'analytics', label: 'Data streams', icon: 'cat-analytics' },
  { id: 'ai', label: 'AI helpers', icon: 'cat-ai' },
];

export function iconUrl(id: string): string {
  return `${import.meta.env.BASE_URL}icons/${id}.svg`;
}
