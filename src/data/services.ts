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
    capacity: INF, forward: 'none', answers: false, badge: true,
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
  {
    id: 'agentcore', name: 'Amazon Bedrock AgentCore', nickname: 'Agent Workshop', category: 'ai',
    job: 'runs AI agents that think and use tools',
    blurb: {
      explorer: 'A workshop where AI helpers think with an AI Brain and use tools to get jobs done.',
      builder: 'Runs AI agents: programs that use an AI model to decide what to do, then use tools (like a Lambda helper) to do it.',
      architect: 'Serverless runtime for AI agents, with memory, identity, a tool gateway (MCP), and observability. Works with any framework or model.',
    },
    capacity: 500, forward: 'broadcast', answers: false,
  },
  {
    id: 'sagemaker', name: 'Amazon SageMaker AI', nickname: 'Model Lab', category: 'ai',
    job: 'trains and runs custom AI models',
    blurb: {
      explorer: 'A lab where people teach a computer to spot patterns.',
      builder: 'Build, train, and run your own machine-learning models, like one that guesses how much bread to bake tomorrow.',
      architect: 'Managed ML platform: training jobs, hosted inference endpoints (InvokeEndpoint), and pipelines for custom models.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'lex', name: 'Amazon Lex', nickname: 'Chatbot', category: 'ai',
    job: 'chats with people by text or voice',
    blurb: {
      explorer: 'A chatbot that answers questions in a chat window.',
      builder: 'Builds chatbots that understand what people type or say, and can ask a Lambda helper to finish the job.',
      architect: 'Conversational bots with intents, slots, and Lambda code hooks for fulfillment, over text or voice.',
    },
    capacity: 500, forward: 'broadcast', answers: true,
  },
  {
    id: 'transcribe', name: 'Amazon Transcribe', nickname: 'Listening Ear', category: 'ai',
    job: 'turns speech into text',
    blurb: {
      explorer: 'Listens to talking and writes down the words.',
      builder: 'Turns recordings of speech into written text.',
      architect: 'Automatic speech recognition for batch and streaming audio, with speaker labels and custom vocabularies.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'comprehend', name: 'Amazon Comprehend', nickname: 'Mood Reader', category: 'ai',
    job: 'finds the meaning and mood in text',
    blurb: {
      explorer: 'Reads a message and tells if it sounds happy or sad.',
      builder: 'Reads text and finds its mood (sentiment), key phrases, and the names of people and places.',
      architect: 'NLP APIs for sentiment, entities, key phrases, language detection, and PII detection.',
    },
    capacity: 500, forward: 'none', answers: true,
  },
  {
    id: 'textract', name: 'Amazon Textract', nickname: 'Page Reader', category: 'ai',
    job: 'reads words and tables from documents',
    blurb: {
      explorer: 'Reads the words on a scanned page or a form.',
      builder: 'Pulls text, tables, and form fields out of scanned documents and photos.',
      architect: 'Document analysis: OCR plus structure (forms, tables, queries) from images and PDFs.',
    },
    capacity: 500, forward: 'none', answers: true,
  },

  // ── Security ────────────────────────────────────────────────
  {
    id: 'iam', name: 'AWS IAM', nickname: 'Key Keeper', category: 'security',
    job: 'gives out permission badges',
    blurb: {
      explorer: 'Gives each helper a badge that says what it is allowed to do.',
      builder: 'IAM decides who can do what. Give a worker a permission badge (a role) so it can use other AWS services.',
      architect: 'Identity and Access Management: roles and least-privilege policies that let services and people call AWS APIs.',
    },
    capacity: INF, forward: 'none', answers: false, badge: true,
  },
  {
    id: 'secrets', name: 'AWS Secrets Manager', nickname: 'Secret Safe', category: 'security',
    job: 'keeps passwords safe',
    blurb: {
      explorer: 'A safe for passwords, so nobody has to write them down.',
      builder: 'Keeps passwords and keys locked away and hands them to workers when they need them, so they never sit in the code.',
      architect: 'Stores and automatically rotates database credentials, API keys, and other secrets. Workloads fetch them at runtime.',
    },
    capacity: INF, forward: 'none', answers: false, badge: true,
  },
  {
    id: 'kms', name: 'AWS KMS', nickname: 'Lock Maker', category: 'security',
    job: 'makes the keys that lock data',
    blurb: {
      explorer: 'Makes special locks so only allowed helpers can read the data.',
      builder: 'Makes and guards the keys that scramble (encrypt) your data, so only allowed services can unscramble it.',
      architect: 'Key Management Service: creates and controls the keys used for encryption at rest in S3, DynamoDB, RDS, SQS, and more.',
    },
    capacity: INF, forward: 'none', answers: false, badge: true,
  },
  {
    id: 'shield', name: 'AWS Shield', nickname: 'Flood Wall', category: 'security',
    job: 'protects against giant floods of traffic',
    blurb: {
      explorer: 'A strong wall that keeps giant floods of fake traffic away.',
      builder: 'Protects the front doors from DDoS attacks: huge floods of fake traffic meant to knock a website offline.',
      architect: 'Managed DDoS protection. Shield Standard is automatic; Shield Advanced adds detection, mitigation, and response.',
    },
    capacity: INF, forward: 'none', answers: false, badge: true,
  },

  // ── Management ──────────────────────────────────────────────
  {
    id: 'cloudtrail', name: 'AWS CloudTrail', nickname: 'Logbook', category: 'management',
    job: 'writes down who did what',
    blurb: {
      explorer: 'A logbook that writes down every change anyone makes.',
      builder: 'Records every action taken in your AWS account, so you can see who changed what, and when.',
      architect: 'Audit trail of AWS API calls (management and data events), delivered to S3 and CloudWatch Logs.',
    },
    capacity: INF, forward: 'none', answers: true,
  },

  // ── Containers ──────────────────────────────────────────────
  {
    id: 'ecs', name: 'Amazon ECS', nickname: 'Container Crew', category: 'containers',
    job: 'runs apps packed in containers',
    blurb: {
      explorer: 'Runs apps packed in boxes called containers, like lunchboxes with everything inside.',
      builder: 'Runs your app in containers: neat packages that hold the code and everything it needs. A crew of them can help lots of visitors.',
      architect: 'Container orchestration: services of tasks behind a load balancer, on Fargate or EC2, with service auto scaling.',
    },
    capacity: 100, forward: 'broadcast', answers: true,
  },
  {
    id: 'eks', name: 'Amazon EKS', nickname: 'Container Captain', category: 'containers',
    job: 'runs containers with Kubernetes',
    blurb: {
      explorer: 'A captain who keeps lots of containers working together.',
      builder: 'Runs containers with Kubernetes, a popular open-source system for steering big fleets of containers.',
      architect: 'Managed Kubernetes control plane. Pods run on EC2 nodes or on Fargate.',
    },
    capacity: 100, forward: 'broadcast', answers: true,
  },
  {
    id: 'fargate', name: 'AWS Fargate', nickname: 'Engine Room', category: 'containers',
    job: 'runs containers with no servers to look after',
    blurb: {
      explorer: 'Runs the containers, so nobody has to look after the computers.',
      builder: 'A serverless engine for containers: you say how much power each one needs, and AWS runs it.',
      architect: 'Serverless compute for ECS tasks and EKS pods, sized per task, with no EC2 instances to patch or scale.',
    },
    capacity: INF, forward: 'none', answers: false, badge: true,
  },

  // ── Web apps ────────────────────────────────────────────────
  {
    id: 'amplify', name: 'AWS Amplify', nickname: 'Website Kit', category: 'frontend',
    job: 'hosts websites and web apps',
    blurb: {
      explorer: 'Puts a website online with just a few clicks.',
      builder: 'Hosts web and mobile apps and connects them to sign-in, data, and APIs.',
      architect: 'Full-stack hosting with CI/CD from Git and a managed CDN, plus backends defined in code (auth, data via AppSync, functions).',
    },
    capacity: 3000, forward: 'broadcast', answers: true,
  },
  {
    id: 'appsync', name: 'AWS AppSync', nickname: 'Question Desk', category: 'frontend',
    job: 'answers exactly the questions apps ask',
    blurb: {
      explorer: 'A desk where apps ask for just the data they want.',
      builder: 'A front desk where apps ask for exactly the data they need in one request (GraphQL), with live updates.',
      architect: 'Managed GraphQL and Events APIs, with resolvers for Lambda, DynamoDB, Aurora, OpenSearch, EventBridge, Bedrock, and HTTP.',
    },
    capacity: 1000, forward: 'split', answers: false,
  },

  // ── Data ────────────────────────────────────────────────────
  {
    id: 'aurora', name: 'Amazon Aurora', nickname: 'Turbo Cabinet', category: 'databases',
    job: 'keeps data in fast, tidy tables',
    blurb: {
      explorer: 'A super-fast filing cabinet that keeps extra copies, so nothing gets lost.',
      builder: 'A faster database with tables, built for the cloud. It keeps six copies of your data in three places.',
      architect: 'MySQL- and PostgreSQL-compatible, with distributed storage (six copies across three AZs), read replicas, and Serverless v2.',
    },
    capacity: 150, forward: 'none', answers: true,
  },
  {
    id: 'firehose', name: 'Amazon Data Firehose', nickname: 'Data Hose', category: 'analytics',
    job: 'delivers streams of data to storage',
    blurb: {
      explorer: 'A hose that carries lots of data into storage.',
      builder: 'Collects a nonstop stream of data and delivers it in batches to S3, Redshift, or OpenSearch.',
      architect: 'Managed streaming delivery with buffering, transformation, and format conversion to S3, Redshift, OpenSearch, and more.',
    },
    capacity: 3000, forward: 'split', answers: false,
  },
  {
    id: 'athena', name: 'Amazon Athena', nickname: 'Fact Finder', category: 'analytics',
    job: 'answers questions about data stored in S3',
    blurb: {
      explorer: 'Asks questions about lots of files and finds the answers.',
      builder: 'Ask questions of data stored in S3 using SQL, without setting up a database.',
      architect: 'Serverless SQL over data in S3 (Parquet, CSV, Iceberg) using the Glue Data Catalog. You pay per data scanned.',
    },
    capacity: 500, forward: 'broadcast', answers: false,
  },
  {
    id: 'glue', name: 'AWS Glue', nickname: 'Data Cleaner', category: 'analytics',
    job: 'cleans and moves data',
    blurb: {
      explorer: 'Tidies up messy data and moves it where it belongs.',
      builder: 'Cleans, reshapes, and moves data between places (ETL), and keeps a catalog of the data you have.',
      architect: 'Serverless ETL with Spark jobs, crawlers, and the Data Catalog that Athena and Redshift Spectrum use.',
    },
    capacity: 1000, forward: 'broadcast', answers: false,
  },
  {
    id: 'redshift', name: 'Amazon Redshift', nickname: 'Data Warehouse', category: 'analytics',
    job: 'answers big questions about huge amounts of data',
    blurb: {
      explorer: 'A giant warehouse of data for answering big questions.',
      builder: 'A data warehouse: it holds huge amounts of data so you can answer big questions, like “what sold best this year?”',
      architect: 'Columnar, massively parallel data warehouse (provisioned or Serverless) for analytics SQL at petabyte scale.',
    },
    capacity: 300, forward: 'none', answers: true,
  },
  {
    id: 'opensearch', name: 'Amazon OpenSearch Service', nickname: 'Search Engine', category: 'analytics',
    job: 'finds things fast with search',
    blurb: {
      explorer: 'Finds the right thing fast when you type a search.',
      builder: 'Powers search boxes and log dashboards. Type a word and it finds matches in a flash.',
      architect: 'Managed OpenSearch for full-text search, log analytics, and vector search.',
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
  { id: 'frontend', label: 'Web apps', icon: 'cat-frontend' },
  { id: 'compute', label: 'Workers', icon: 'cat-compute' },
  { id: 'containers', label: 'Containers', icon: 'cat-containers' },
  { id: 'storage', label: 'Storage', icon: 'cat-storage' },
  { id: 'databases', label: 'Databases', icon: 'cat-databases' },
  { id: 'integration', label: 'Messengers', icon: 'cat-integration' },
  { id: 'security', label: 'Security', icon: 'cat-security' },
  { id: 'management', label: 'Watching', icon: 'cat-management' },
  { id: 'analytics', label: 'Data & analytics', icon: 'cat-analytics' },
  { id: 'ai', label: 'AI helpers', icon: 'cat-ai' },
];

export function iconUrl(id: string): string {
  return `${import.meta.env.BASE_URL}icons/${id}.svg`;
}
