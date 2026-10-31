import type { Chapter, Level, LevelNode } from './levels';
import type { SourceSpec } from './types';

/*
 * Advanced Track (college and up). Two years after Chapter 1, Crumb & Co. delivers bread to 40 cities and the player is
 * its first cloud engineer. Each ticket adds a constraint beyond "everyone is happy": a monthly budget, arrows that
 * must exist (roles, keys, alarms), or a queue that has to drain. Text is written once, for this audience, so it is
 * plain strings rather than per-band text.
 */

const source = (id: string, label: string, y: number, spec: SourceSpec): LevelNode => ({
  id,
  service: 'users',
  pos: { x: 30, y },
  label,
  locked: true,
  source: spec,
});

export const ADVANCED_LEVELS: Level[] = [
  {
    id: 'a1',
    number: 1,
    title: 'Day One: Least Privilege',
    concept: 'IAM & encryption',
    teaches: ['iam', 'kms', 'cognito', 'cloudtrail'],
    intro: [
      {
        who: 'sparky',
        mood: 'cheer',
        text: 'Welcome to your first day as Crumb & Co.’s cloud engineer! Two years ago this was one bakery. Now it delivers bread to 40 cities.',
      },
      {
        who: 'rosa',
        text: 'Checkout works, but an auditor from our payment partner visits on Friday. They’ll ask who can read customer data, and how we would know if someone did.',
      },
      {
        who: 'sparky',
        text: 'Quick tip before we dig in: when a word has a dotted line under it, tap it to see what it means in plain words. Try one on the next line!',
      },
      {
        who: 'sparky',
        mood: 'think',
        text: 'Right now the Checkout function has no role of its own, the orders table uses no key we control, and anyone with the URL can call the API. Let’s fix all three and add an audit trail, without blowing the budget.',
      },
    ],
    goal: 'Pass the security review: a role for Checkout, a customer managed key, sign-in on the API, and an audit trail, all for $300/month or less.',
    nodes: [
      source('orders', 'Order App', 200, { demand: 200, needs: ['apigw', 'lambda', 'dynamodb'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 200 }, locked: true },
      { id: 'fn', service: 'lambda', pos: { x: 640, y: 200 }, label: 'Checkout', locked: true },
      { id: 'ddb', service: 'dynamodb', pos: { x: 920, y: 200 }, label: 'Orders table', locked: true },
    ],
    edges: [
      ['orders', 'apigw'],
      ['apigw', 'fn'],
      ['fn', 'ddb'],
    ],
    palette: [
      { service: 'iam', count: 1 },
      { service: 'kms', count: 1 },
      { service: 'cognito', count: 1 },
      { service: 'cloudtrail', count: 1 },
      { service: 'secrets', count: 1 },
      { service: 'shield', count: 1 },
    ],
    requires: [
      { from: 'iam', to: 'fn', label: 'Checkout runs with its own least-privilege IAM role' },
      { from: 'kms', to: 'ddb', label: 'The orders table is encrypted with a customer managed KMS key' },
      { from: 'apigw', to: 'cognito', label: 'The API only accepts signed-in customers (Cognito authorizer)' },
      { from: 'ddb', to: 'cloudtrail', label: 'Calls to the orders table are recorded in CloudTrail' },
    ],
    budget: 300,
    hints: [
      'IAM, KMS, Secrets Manager, and Shield don’t carry traffic. Their arrows attach a role, a key, or a protection to the piece they point at.',
      'Checkout reaches DynamoDB through its IAM role, so it needs no password. Secrets Manager is for credentials like a database password or a partner API key.',
      'IAM → Checkout, KMS → Orders table, API Gateway → Cognito, and Orders table → CloudTrail. Shield Advanced costs $3,000 a month, so leave it out.',
    ],
    lesson: {
      title: 'Least privilege, encryption, and audit',
      text: 'Production-ready means more than “it works.” Give each function its own IAM role that allows only the actions it needs, encrypt data at rest with KMS keys you control, put an authorizer in front of every public API, and keep a CloudTrail record so you can answer “who did what, and when?” Shield Standard already protects every AWS account at no charge. Shield Advanced is worth $3,000 a month only for large, frequently attacked targets.',
    },
    solution: {
      add: [
        { id: 'role', service: 'iam' },
        { id: 'key', service: 'kms' },
        { id: 'cog', service: 'cognito' },
        { id: 'trail', service: 'cloudtrail' },
      ],
      connect: [['role', 'fn'], ['key', 'ddb'], ['apigw', 'cog'], ['ddb', 'trail']],
    },
  },
  {
    id: 'a2',
    number: 2,
    title: 'Prime Time',
    concept: 'Cost-aware scaling',
    teaches: ['cloudfront', 'lambda'],
    intro: [
      {
        who: 'rosa',
        text: 'Big news: our ad runs during the national cooking final tonight. Marketing expects 900 visitors a second on the website and 150 checkouts a second.',
      },
      {
        who: 'pager',
        text: 'FORECAST: The Monolith, a single EC2 instance rated for about 50 req/s, serves both the website and checkout.',
      },
      {
        who: 'sparky',
        mood: 'worried',
        text: 'We could buy a fleet of servers, but finance capped the bill at $450 a month. Let’s split the static site from the dynamic checkout and give each the cheapest service that can carry it.',
      },
    ],
    goal: 'Serve 900 viewers and 150 shoppers per second for $450/month or less.',
    nodes: [
      source('viewers', 'TV Viewers', 90, { demand: 900, needs: ['cloudfront', 's3'] }),
      source('shoppers', 'Shoppers', 330, { demand: 150, needs: ['dynamodb'] }),
      { id: 'r53', service: 'route53', pos: { x: 380, y: 90 }, locked: true },
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 330 }, locked: true },
      { id: 'mono', service: 'ec2', pos: { x: 640, y: 210 }, label: 'Monolith' },
      { id: 'site', service: 's3', pos: { x: 920, y: 90 }, label: 'Website bucket', locked: true },
      { id: 'ddb', service: 'dynamodb', pos: { x: 920, y: 330 }, label: 'Orders table', locked: true },
    ],
    edges: [
      ['viewers', 'r53'],
      ['r53', 'mono'],
      ['shoppers', 'apigw'],
      ['apigw', 'mono'],
      ['mono', 'site'],
      ['mono', 'ddb'],
    ],
    palette: [
      { service: 'cloudfront', count: 1 },
      { service: 'lambda', count: 1 },
      { service: 'elb', count: 1 },
      { service: 'ec2', count: 2 },
      { service: 'autoscaling', count: 1 },
    ],
    budget: 450,
    hints: [
      'The website is static files. Which service answers static files from the edge, with no servers at all?',
      'Checkout is short, bursty requests. Lambda scales per request and, here, costs far less than a fleet of EC2 instances. Auto Scaling bills you for every extra instance it launches.',
      'Route 53 → CloudFront → Website bucket, and API Gateway → Lambda → Orders table. Snip both arrows into the Monolith. You can also delete it to save $70.',
    ],
    lesson: {
      title: 'Match the service to the workload',
      text: 'Static content belongs on S3 behind CloudFront: the edge answers most requests, so the origin sees only cache misses. Spiky request/response work fits Lambda, which scales per request with no idle servers. Scaling the Monolith out would also have carried the load, at several times the bill. Architecture is a cost decision as much as a capacity decision.',
    },
    solution: {
      add: [
        { id: 'cf', service: 'cloudfront' },
        { id: 'fn', service: 'lambda' },
      ],
      connect: [['r53', 'cf'], ['cf', 'site'], ['apigw', 'fn'], ['fn', 'ddb']],
      remove: [['r53', 'mono'], ['apigw', 'mono']],
    },
  },
  {
    id: 'a3',
    number: 3,
    title: 'The Midnight Backlog',
    concept: 'Queues & containers',
    teaches: ['ecs', 'fargate'],
    intro: [
      {
        who: 'pager',
        text: 'ALERT 00:42: Fulfillment queue depth is 1.2 million messages and climbing. Oldest message: 51 minutes.',
      },
      {
        who: 'rosa',
        text: 'Half the country ordered bread for the morning, and the shipping labels aren’t printing. The trucks leave at 5 a.m.!',
      },
      {
        who: 'sparky',
        mood: 'think',
        text: 'The queue did its job: nothing was lost. But 400 orders a second go in, and the one Label Printer instance takes out only 50. A print job can run 20 minutes, longer than Lambda’s 15-minute limit, so let’s add containers on Fargate.',
      },
    ],
    goal: 'Drain the queue: readers behind it must keep up with 400 orders a second, for $650/month or less.',
    nodes: [
      source('orders', 'Order Burst', 200, { demand: 400, needs: ['sqs', 'dynamodb'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 200 }, locked: true },
      { id: 'q', service: 'sqs', pos: { x: 600, y: 200 }, label: 'Fulfillment queue', locked: true },
      { id: 'printer', service: 'ec2', pos: { x: 840, y: 40 }, label: 'Label Printer' },
      { id: 'ddb', service: 'dynamodb', pos: { x: 1100, y: 200 }, label: 'Shipments', locked: true },
    ],
    edges: [
      ['orders', 'apigw'],
      ['apigw', 'q'],
      ['q', 'printer'],
      ['printer', 'ddb'],
    ],
    palette: [
      { service: 'ecs', count: 4 },
      { service: 'fargate', count: 1 },
      { service: 'ec2', count: 2 },
      { service: 'autoscaling', count: 1 },
    ],
    requires: [{ from: 'fargate', to: 'ecs', label: 'The containers run on Fargate, so there are no servers to patch' }],
    maxBacklog: 0,
    budget: 650,
    hints: [
      'Readers pull messages when they have room, so a mix of fast and slow readers works. What counts is their total capacity: it has to reach 400 a second.',
      'Each ECS service handles about 100 req/s here. Auto Scaling also works, but you pay for every instance it adds.',
      'Connect the queue to 4 ECS pieces, connect each of them to Shipments, and point Fargate at the containers.',
    ],
    lesson: {
      title: 'Watch queue depth, not just errors',
      text: 'A queue turns overload into delay instead of failure, but only if the readers can catch up. When messages arrive faster than they are processed, the backlog grows forever. Alarm on ApproximateAgeOfOldestMessage, and scale readers on queue depth (ECS service auto scaling, or KEDA on EKS). Readers pull work, so total capacity is what counts.',
    },
    solution: {
      add: [
        { id: 'c1', service: 'ecs' },
        { id: 'c2', service: 'ecs' },
        { id: 'c3', service: 'ecs' },
        { id: 'c4', service: 'ecs' },
        { id: 'fg', service: 'fargate' },
      ],
      connect: [
        ['q', 'c1'], ['q', 'c2'], ['q', 'c3'], ['q', 'c4'],
        ['c1', 'ddb'], ['c2', 'ddb'], ['c3', 'ddb'], ['c4', 'ddb'],
        ['fg', 'c1'], ['fg', 'c2'], ['fg', 'c3'], ['fg', 'c4'],
      ],
    },
  },
  {
    id: 'a4',
    number: 4,
    title: 'Scraper Swarm',
    concept: 'Edge security',
    teaches: ['waf', 'cloudwatch'],
    intro: [
      {
        who: 'pager',
        text: 'ALERT 14:05: Web tier at 150% of capacity. Requests are up 5× in ten minutes, but sales are flat.',
      },
      {
        who: 'sparky',
        mood: 'worried',
        text: 'Look at the traffic: 1,200 of every 1,500 requests come from a botnet copying our prices. CloudFront answers most of them from cache, but enough get through to swamp the web containers.',
      },
      { who: 'rosa', text: 'A vendor says we need Shield Advanced. Do we?' },
      {
        who: 'sparky',
        mood: 'think',
        text: 'Shield Standard already covers network-level floods for free. This is application-layer bot traffic, so the right tool is AWS WAF, at a fraction of the price.',
      },
    ],
    goal: 'Serve all 300 real visitors per second, block the bots, and add a CloudWatch alarm, for $400/month or less.',
    nodes: [
      source('visitors', 'Visitors', 200, { demand: 300, bots: 1200, needs: ['cloudfront', 'ecs'] }),
      { id: 'cf', service: 'cloudfront', pos: { x: 380, y: 200 }, locked: true },
      { id: 'lb', service: 'elb', pos: { x: 640, y: 200 }, locked: true },
      { id: 'web1', service: 'ecs', pos: { x: 920, y: 70 }, label: 'Web 1', locked: true },
      { id: 'web2', service: 'ecs', pos: { x: 920, y: 340 }, label: 'Web 2', locked: true },
    ],
    edges: [
      ['visitors', 'cf'],
      ['cf', 'lb'],
      ['lb', 'web1'],
      ['lb', 'web2'],
    ],
    palette: [
      { service: 'waf', count: 1 },
      { service: 'shield', count: 1 },
      { service: 'ecs', count: 3 },
      { service: 'cloudwatch', count: 1 },
    ],
    requires: [{ from: 'cf', to: 'cloudwatch', label: 'CloudFront metrics feed a CloudWatch alarm' }],
    budget: 400,
    hints: [
      'Filter bots before they reach CloudFront. Every bot request that reaches the origin uses up container capacity.',
      'More containers would carry the load, but then you are paying to serve bots.',
      'Visitors → WAF → CloudFront, snip Visitors → CloudFront, then add CloudFront → CloudWatch.',
    ],
    lesson: {
      title: 'Filter at the edge',
      text: 'Block bad traffic as early as you can. WAF rules on CloudFront (rate-based rules, managed rule groups, and Bot Control) stop it before it uses origin capacity. Scaling out to absorb an attack works, but you pay to serve it. Shield Standard protects every account from network-layer DDoS at no charge; Shield Advanced adds DDoS cost protection and a response team for $3,000 a month.',
    },
    solution: {
      add: [
        { id: 'w', service: 'waf' },
        { id: 'cw', service: 'cloudwatch' },
      ],
      connect: [['visitors', 'w'], ['w', 'cf'], ['cf', 'cw']],
      remove: [['visitors', 'cf']],
    },
  },
  {
    id: 'a5',
    number: 5,
    title: 'One Order, Four Teams',
    concept: 'Event-driven fan-out',
    teaches: ['sns', 'sqs', 'firehose'],
    intro: [
      {
        who: 'rosa',
        text: 'Every order now has to reach four places: the orders table, a text to the customer, the warehouse, and the analytics team’s data lake.',
      },
      {
        who: 'sparky',
        mood: 'think',
        text: 'If Checkout calls each system one after another, a slow warehouse makes checkout slow, and an outage anywhere fails the order. Let’s publish each order once and let every system subscribe.',
      },
    ],
    goal: 'Fan every order out to the table, customer phones, a queue-backed warehouse, and an S3 data lake, for $450/month or less.',
    nodes: [
      source('orders', 'Orders', 120, { demand: 250, needs: ['dynamodb', 'phone', 'ecs', 's3'] }),
      { id: 'cust', service: 'phone', pos: { x: 40, y: 420 }, label: 'Customer Phones', locked: true },
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 120 }, locked: true },
      { id: 'fn', service: 'lambda', pos: { x: 640, y: 120 }, label: 'Checkout', locked: true },
      { id: 'ddb', service: 'dynamodb', pos: { x: 920, y: 40 }, label: 'Orders table', locked: true },
      { id: 'wh', service: 'ecs', pos: { x: 1100, y: 420 }, label: 'Warehouse', capacity: 300, locked: true },
    ],
    edges: [
      ['orders', 'apigw'],
      ['apigw', 'fn'],
      ['fn', 'ddb'],
    ],
    palette: [
      { service: 'sns', count: 1 },
      { service: 'sqs', count: 2 },
      { service: 'firehose', count: 1 },
      { service: 's3', count: 1 },
      { service: 'kinesis', count: 1 },
      { service: 'redshift', count: 1 },
    ],
    requires: [{ from: 'sqs', to: 'wh', label: 'The warehouse reads from its own queue, so it can never slow checkout down' }],
    maxBacklog: 0,
    budget: 450,
    hints: [
      'SNS is the fan-out point: Checkout publishes once, and every subscriber gets its own copy.',
      'Give the warehouse its own SQS queue between SNS and the containers, so it can fall behind without losing orders.',
      'Checkout → SNS → Customer Phones, and SNS → SQS → Warehouse. For analytics, Checkout → Data Firehose → S3. You don’t need Kinesis or Redshift here.',
    ],
    lesson: {
      title: 'Publish once, subscribe many',
      text: 'SNS-to-SQS fan-out decouples producers from consumers: each subscriber gets its own durable queue, retry policy, and pace. Adding a consumer later means adding a subscription, not changing checkout code. Firehose delivers straight to S3 for analytics. Add Kinesis Data Streams only when you need replay or several real-time readers.',
    },
    solution: {
      add: [
        { id: 'topic', service: 'sns' },
        { id: 'whq', service: 'sqs' },
        { id: 'hose', service: 'firehose' },
        { id: 'lake', service: 's3' },
      ],
      connect: [['fn', 'topic'], ['topic', 'cust'], ['topic', 'whq'], ['whq', 'wh'], ['fn', 'hose'], ['hose', 'lake']],
    },
  },
  {
    id: 'a6',
    number: 6,
    title: 'Ask the Data',
    concept: 'Data lake',
    teaches: ['firehose', 'athena', 'glue', 'glacier'],
    intro: [
      { who: 'pager', text: 'ALERT 09:12: Orders database CPU at 100%. Checkout latency is 8 seconds.' },
      {
        who: 'sparky',
        mood: 'worried',
        text: 'Found it. The app saves every click, 800 events a second, as a row in the orders database, and the analysts run their reports on that same database.',
      },
      { who: 'rosa', text: 'The board wants weekly reports on what people browse. Can we keep the reports without breaking checkout?' },
      {
        who: 'sparky',
        mood: 'happy',
        text: 'Yes. Land the events in an S3 data lake and query the files in place with Athena. The orders database goes back to doing one job.',
      },
    ],
    goal: 'Stream clicks into an S3 data lake and point reports at Athena, keeping both off the orders database, for $750/month or less.',
    nodes: [
      source('clicks', 'Clickstream', 90, { demand: 800, needs: ['firehose', 's3'] }),
      source('analysts', 'Analysts', 290, { demand: 40, needs: ['athena', 's3'] }),
      { id: 'api', service: 'apigw', pos: { x: 380, y: 90 }, label: 'Events API', locked: true },
      { id: 'api2', service: 'apigw', pos: { x: 380, y: 290 }, label: 'Reports API', locked: true },
      { id: 'writer', service: 'lambda', pos: { x: 640, y: 90 }, label: 'Event writer' },
      { id: 'reports', service: 'lambda', pos: { x: 640, y: 290 }, label: 'Report runner', locked: true },
      { id: 'rds', service: 'rds', pos: { x: 920, y: 190 }, label: 'Orders database', locked: true },
    ],
    edges: [
      ['clicks', 'api'],
      ['api', 'writer'],
      ['writer', 'rds'],
      ['analysts', 'api2'],
      ['api2', 'reports'],
      ['reports', 'rds'],
    ],
    palette: [
      { service: 'firehose', count: 1 },
      { service: 's3', count: 1 },
      { service: 'athena', count: 1 },
      { service: 'glue', count: 1 },
      { service: 'glacier', count: 1 },
      { service: 'redshift', count: 1 },
    ],
    requires: [
      { from: 'athena', to: 'glue', label: 'Athena reads table definitions from the Glue Data Catalog' },
      { from: 's3', to: 'glacier', label: 'A lifecycle rule moves old raw events to Glacier' },
    ],
    budget: 750,
    hints: [
      'Firehose batches high-volume events into files in S3. No servers, and no database writes.',
      'Athena runs SQL directly on files in S3, but it needs a table definition from the Glue Data Catalog. Redshift would work too, at more than the whole budget.',
      'Events API → Data Firehose → S3. Report runner → Athena → S3, plus Athena → Glue. Snip both arrows into the database, then add S3 → Glacier.',
    ],
    lesson: {
      title: 'Keep analytics off the transactional database',
      text: 'Transactional databases are tuned for many small reads and writes; analytics scans are large and bursty. Land events in S3 as compressed, partitioned files (Firehose can convert them to Parquet), catalog them with Glue, and query them with Athena, paying per terabyte scanned. Lifecycle rules move cold data to Glacier. Reach for Redshift when you have heavy, frequent BI over large joined datasets.',
    },
    solution: {
      add: [
        { id: 'hose', service: 'firehose' },
        { id: 'lake', service: 's3' },
        { id: 'ath', service: 'athena' },
        { id: 'cat', service: 'glue' },
        { id: 'ice', service: 'glacier' },
      ],
      connect: [['api', 'hose'], ['hose', 'lake'], ['reports', 'ath'], ['ath', 'lake'], ['ath', 'cat'], ['lake', 'ice']],
      remove: [['api', 'writer'], ['reports', 'rds']],
    },
  },
  {
    id: 'a7',
    number: 7,
    title: 'The Support Agent',
    concept: 'Agentic AI',
    teaches: ['agentcore', 'bedrock'],
    intro: [
      {
        who: 'rosa',
        text: 'Support gets 120 chats a second, and most of them ask “where is my order?” Can the AI assistant answer those by itself?',
      },
      {
        who: 'sparky',
        mood: 'think',
        text: 'Right now the chat handler sends each message straight to a model. The model writes a friendly reply, but it can’t look anything up, so it guesses. That’s how assistants invent delivery dates.',
      },
      {
        who: 'sparky',
        mood: 'happy',
        text: 'Let’s run it as an agent in AgentCore. It reasons with the Bedrock model and calls an order-lookup tool when it needs facts, using the customer’s identity so it only sees their orders.',
      },
    ],
    goal: 'Route chats through an AgentCore agent that thinks with Bedrock and looks up orders with a tool, with identity checks and a scoped role, for $900/month or less.',
    nodes: [
      source('chats', 'Support Chats', 200, { demand: 120, needs: ['agentcore', 'bedrock', 'dynamodb'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 200 }, locked: true },
      { id: 'fn', service: 'lambda', pos: { x: 620, y: 200 }, label: 'Chat handler', locked: true },
      { id: 'llm', service: 'bedrock', pos: { x: 900, y: 40 }, label: 'Bedrock model', locked: true },
      { id: 'tool', service: 'lambda', pos: { x: 900, y: 290 }, label: 'Order lookup', locked: true },
      { id: 'ddb', service: 'dynamodb', pos: { x: 1160, y: 290 }, label: 'Orders table', locked: true },
    ],
    edges: [
      ['chats', 'apigw'],
      ['apigw', 'fn'],
      ['fn', 'llm'],
      ['tool', 'ddb'],
    ],
    palette: [
      { service: 'agentcore', count: 1 },
      { service: 'cognito', count: 1 },
      { service: 'iam', count: 1 },
      { service: 'sagemaker', count: 1 },
      { service: 'secrets', count: 1 },
    ],
    requires: [
      { from: 'agentcore', to: 'cognito', label: 'The agent checks who is asking (Cognito), so customers only see their own orders' },
      { from: 'iam', to: 'tool', label: 'The order-lookup tool has its own read-only IAM role' },
    ],
    budget: 900,
    hints: [
      'An agent needs two arrows out: one to the model it thinks with, and one to the tool it calls.',
      'A custom SageMaker model costs more and doesn’t help: the problem is missing facts, not a weak model.',
      'Chat handler → AgentCore, AgentCore → Bedrock model, AgentCore → Order lookup, AgentCore → Cognito, and IAM → Order lookup. Snip Chat handler → Bedrock model.',
    ],
    lesson: {
      title: 'Ground the model with tools',
      text: 'Language models are good at language and bad at facts they were never given. An agent pairs a model with tools (APIs, databases, search) and decides when to call them. Scope every tool tightly with a least-privilege role and the caller’s identity, and log tool calls so you can audit what the agent did. Fine-tuning changes how a model writes; it can’t tell it today’s order status.',
    },
    solution: {
      add: [
        { id: 'agent', service: 'agentcore' },
        { id: 'cog', service: 'cognito' },
        { id: 'role', service: 'iam' },
      ],
      connect: [['fn', 'agent'], ['agent', 'llm'], ['agent', 'tool'], ['agent', 'cog'], ['role', 'tool']],
      remove: [['fn', 'llm']],
    },
  },
];

export const ADVANCED: Chapter = {
  id: 'adv',
  eyebrow: 'Advanced Track',
  title: 'Crumb & Co. Scales Up',
  blurb:
    'College & up. You’re the first cloud engineer at a bakery that grew into a national delivery platform: real incidents, budgets, and security reviews.',
  ending:
    'Six months on call: you passed a security review, survived prime time on a budget, drained a million-message backlog, filtered a botnet at the edge, fanned orders out to four teams, built a data lake, and shipped a grounded AI agent. That’s the AWS Well-Architected Framework in practice: security, reliability, performance, cost, and operations.',
  unit: 'Ticket',
  cast: { sparky: 'Sparky', rosa: 'Rosa · CEO', pager: 'On-call pager' },
  levels: ADVANCED_LEVELS,
};
