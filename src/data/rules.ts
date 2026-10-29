import { SERVICES } from './services';
import type { EdgeKind, Rule, ServiceId } from './types';

type R = [from: ServiceId, to: ServiceId, verb: string, simple: string, tech: string, kind?: EdgeKind];

// Directional allow-list: requests flow from → to. Anything not listed can't connect.
const TABLE: R[] = [
  // People in town
  ['users', 'route53', 'looks up', 'People ask Route 53 where a website lives, like looking up an address.', 'Browsers resolve the domain through Route 53 DNS before connecting.'],
  ['users', 'cloudfront', 'visits', 'People grab pages from the nearest CloudFront copy shop.', 'Clients connect to the nearest CloudFront edge location over HTTPS.'],
  ['users', 'apigw', 'sends requests to', 'Apps send their requests to the API Gateway front desk.', 'Clients call REST/HTTP endpoints exposed by API Gateway.'],
  ['users', 'elb', 'visits', 'Visitors arrive at the load balancer, which shares them out.', 'Clients hit the load balancer’s DNS name; it forwards to healthy targets.'],
  ['users', 'waf', 'walks past', 'Every visitor walks past the WAF gate guard first.', 'In real AWS, a WAF web ACL is attached to CloudFront, API Gateway, or an ALB. Here it’s drawn as its own stop.'],
  ['users', 's3', 'downloads from', 'People can download files straight from an S3 bucket.', 'S3 can serve a static website directly. Putting CloudFront in front is the best practice.'],
  ['users', 'ec2', 'visits', 'People can visit a single cloud computer directly.', 'Clients connect to the instance’s public IP. This is fine for small apps, but it’s a single point of failure.'],
  ['users', 'cognito', 'signs in with', 'People sign in at the Cognito name tag desk.', 'Users authenticate against a Cognito user pool and receive JWTs.'],

  // Address book
  ['route53', 'cloudfront', 'points to', 'The address book points people to CloudFront.', 'An alias record maps the domain to the CloudFront distribution.'],
  ['route53', 'elb', 'points to', 'The address book points people to the load balancer.', 'An alias record targets the load balancer.'],
  ['route53', 'apigw', 'points to', 'The address book points people to the front desk.', 'A custom domain on API Gateway is mapped with an alias record.'],
  ['route53', 's3', 'points to', 'The address book points people to the website bucket.', 'An alias record targets the S3 website endpoint (the bucket name must match the domain).'],
  ['route53', 'ec2', 'points to', 'The address book points people to a cloud computer.', 'An A record points to the instance’s Elastic IP.'],

  // Gate guard
  ['waf', 'cloudfront', 'lets good visitors into', 'The gate guard only lets real visitors through to CloudFront.', 'A WAF web ACL associated with the distribution filters requests at the edge.'],
  ['waf', 'apigw', 'lets good visitors into', 'The gate guard only lets real visitors through to the front desk.', 'A WAF web ACL associated with the API stage.'],
  ['waf', 'elb', 'lets good visitors into', 'The gate guard only lets real visitors through to the load balancer.', 'A WAF web ACL associated with the Application Load Balancer.'],

  // CDN
  ['cloudfront', 's3', 'keeps copies from', 'CloudFront copies files from S3 and keeps them close to people.', 'S3 origin with Origin Access Control. Edges cache objects based on TTLs.'],
  ['cloudfront', 'elb', 'forwards to', 'CloudFront sends the trickier requests on to the load balancer.', 'The ALB is a custom origin for dynamic content.'],
  ['cloudfront', 'apigw', 'forwards to', 'CloudFront sends API requests on to the front desk.', 'API Gateway is an origin behind a cache behavior such as /api/*.'],
  ['cloudfront', 'ec2', 'forwards to', 'CloudFront sends requests on to a cloud computer.', 'An EC2 instance is a custom origin.'],

  // Front desk
  ['apigw', 'lambda', 'calls', 'The front desk hands each request to a Lambda helper robot.', 'Lambda proxy integration invokes the function once per request.'],
  ['apigw', 'sqs', 'drops tickets into', 'The front desk can drop requests straight into a waiting line.', 'Direct service integration calls SQS SendMessage with no Lambda in between.'],
  ['apigw', 'stepfunctions', 'starts', 'The front desk can start a Step Functions checklist.', 'Service integration calls StartExecution.'],
  ['apigw', 'kinesis', 'streams into', 'The front desk can put data onto the conveyor belt.', 'Service integration calls Kinesis PutRecord.'],
  ['apigw', 'ec2', 'forwards to', 'The front desk can pass requests to a cloud computer.', 'HTTP integration, using a VPC Link for private instances.'],
  ['apigw', 'elb', 'forwards to', 'The front desk can pass requests to a load balancer.', 'A VPC Link to a private NLB or ALB.'],
  ['apigw', 'cognito', 'checks name tags with', 'The front desk checks your name tag with Cognito before letting you in.', 'A Cognito user pool authorizer validates the JWT on each request.', 'control'],

  // Load balancer
  ['elb', 'ec2', 'shares visitors with', 'The load balancer spreads visitors across servers so none get too busy.', 'A target group of EC2 instances, with health checks.'],
  ['elb', 'lambda', 'shares visitors with', 'The load balancer can send visitors to a Lambda helper.', 'An ALB can use a Lambda function as a target.'],

  // Auto Scaling & CloudWatch
  ['autoscaling', 'ec2', 'makes copies of', 'Auto Scaling adds more servers when it gets busy and removes them when it’s quiet.', 'The Auto Scaling group launches instances from a launch template based on scaling policies.', 'control'],
  ['cloudwatch', 'autoscaling', 'tells', 'CloudWatch tells Auto Scaling when the servers are busy.', 'An alarm or target-tracking policy triggers scale-out and scale-in.', 'control'],
  ['cloudwatch', 'sns', 'sounds the alarm with', 'When something looks wrong, CloudWatch rings the SNS megaphone.', 'The CloudWatch alarm action publishes to an SNS topic.', 'control'],
];

// Workers (Lambda and EC2) can talk to the same back-end services.
const workerTargets: [ServiceId, string, string, string][] = [
  ['dynamodb', 'saves to', 'writes and reads data in DynamoDB', 'SDK calls such as PutItem and GetItem, authorized by the IAM role'],
  ['rds', 'saves to', 'looks things up in the RDS filing cabinet', 'SQL over the VPC. RDS Proxy pools connections'],
  ['s3', 'stores files in', 'saves files into the S3 bucket', 'PutObject and GetObject through the SDK'],
  ['elasticache', 'checks memory in', 'checks the sticky notes first before asking the database', 'Cache-aside: read ElastiCache first, and fall back to the database on a miss'],
  ['sqs', 'sends tickets to', 'puts work into a waiting line for later', 'SendMessage to a queue'],
  ['sns', 'announces with', 'tells the SNS megaphone to send a message', 'Publish to an SNS topic'],
  ['eventbridge', 'posts events to', 'posts news to the mail sorter', 'PutEvents to an event bus'],
  ['stepfunctions', 'starts', 'starts a Step Functions checklist', 'StartExecution'],
  ['kinesis', 'streams to', 'puts data onto the conveyor belt', 'PutRecords'],
  ['rekognition', 'asks', 'asks the picture detective what’s in a photo', 'The DetectLabels API'],
  ['polly', 'asks', 'asks Polly to read text out loud', 'The SynthesizeSpeech API'],
  ['translate', 'asks', 'asks for a translation', 'The TranslateText API'],
  ['bedrock', 'asks', 'asks an AI model in Bedrock to write or answer', 'The InvokeModel and Converse APIs'],
];
for (const worker of ['lambda', 'ec2'] as const) {
  const who = worker === 'lambda' ? 'The Lambda helper' : 'The cloud computer';
  for (const [to, verb, simple, tech] of workerTargets) {
    TABLE.push([worker, to, verb, `${who} ${simple}.`, `${tech}.`]);
  }
}

TABLE.push(
  // Storage & database events
  ['s3', 'lambda', 'wakes up', 'When a new file lands in S3, it can wake up a Lambda helper.', 'An S3 event notification (ObjectCreated) invokes Lambda asynchronously.'],
  ['s3', 'sqs', 'sends a note to', 'When a new file lands in S3, it can put a ticket in the waiting line.', 'An S3 event notification sent to SQS.'],
  ['s3', 'sns', 'sends a note to', 'When a new file lands in S3, it can tell the megaphone.', 'An S3 event notification sent to SNS.'],
  ['s3', 'eventbridge', 'sends a note to', 'When a new file lands in S3, it can tell the mail sorter.', 'S3 sends its events to EventBridge.'],
  ['s3', 'glacier', 'moves old files to', 'Old files can move to Glacier, the deep freezer, to save money.', 'A lifecycle rule moves objects to Glacier storage classes.'],
  ['dynamodb', 'lambda', 'wakes up', 'When data changes, DynamoDB can wake up a Lambda helper.', 'A DynamoDB Streams event source mapping.'],

  // Queues & messengers
  ['sqs', 'lambda', 'hands tickets to', 'Lambda picks up tickets from the line, a few at a time.', 'An event source mapping polls the queue and invokes Lambda with batches.'],
  ['sqs', 'ec2', 'hands tickets to', 'Servers take the next ticket from the line when they’re ready.', 'Workers long-poll ReceiveMessage and delete each message after processing it.'],
  ['sns', 'sqs', 'copies messages to', 'The megaphone can drop a copy of each message into a waiting line.', 'SNS-to-SQS fan-out.'],
  ['sns', 'lambda', 'wakes up', 'The megaphone can wake up a Lambda helper.', 'Lambda subscribed to the topic.'],
  ['sns', 'phone', 'texts', 'SNS sends a text message or a “ding!” notification to phones.', 'SMS or mobile push through platform endpoints.'],
  ['eventbridge', 'lambda', 'routes events to', 'The mail sorter sends matching news to a Lambda helper.', 'A rule with Lambda as the target.'],
  ['eventbridge', 'sqs', 'routes events to', 'The mail sorter drops matching news into a waiting line.', 'A rule with SQS as the target.'],
  ['eventbridge', 'sns', 'routes events to', 'The mail sorter hands matching news to the megaphone.', 'A rule with SNS as the target.'],
  ['eventbridge', 'stepfunctions', 'routes events to', 'The mail sorter starts a checklist.', 'A rule with a Step Functions state machine as the target.'],
  ['stepfunctions', 'lambda', 'runs a step on', 'Each step in the checklist can ask a Lambda helper.', 'A Task state invokes Lambda.'],
  ['stepfunctions', 'dynamodb', 'saves to', 'The checklist can write straight into DynamoDB.', 'Optimized integration calls PutItem.'],
  ['stepfunctions', 'sns', 'announces with', 'The checklist can ring the megaphone when it’s done.', 'Optimized integration publishes to SNS.'],
  ['stepfunctions', 'sqs', 'sends tickets to', 'The checklist can put a ticket in a waiting line.', 'Optimized integration calls SQS SendMessage.'],
  ['stepfunctions', 'bedrock', 'asks', 'The checklist can ask an AI model for help.', 'Optimized integration calls Bedrock InvokeModel.'],
  ['kinesis', 'lambda', 'feeds', 'A Lambda helper reads things off the conveyor belt.', 'An event source mapping reads shards in batches.'],
);

// Every AWS service can report its health to CloudWatch.
for (const s of Object.values(SERVICES)) {
  if (s.category === 'town' || s.id === 'cloudwatch') continue;
  TABLE.push([
    s.id,
    'cloudwatch',
    'reports to',
    `${s.nickname} sends its health numbers to the CloudWatch watchtower.`,
    `${s.name} publishes metrics and logs to CloudWatch.`,
    'monitor',
  ]);
}

export const RULES: Rule[] = TABLE.map(([from, to, verb, simple, tech, kind = 'data']) => ({ from, to, verb, simple, tech, kind }));

const index = new Map<string, Rule>(RULES.map((r) => [`${r.from}>${r.to}`, r]));

export function findRule(from: ServiceId, to: ServiceId): Rule | undefined {
  return index.get(`${from}>${to}`);
}

export function targetsOf(from: ServiceId): ServiceId[] {
  return RULES.filter((r) => r.from === from).map((r) => r.to);
}

export function sourcesOf(to: ServiceId): ServiceId[] {
  return RULES.filter((r) => r.to === to).map((r) => r.from);
}

/** Hand-written explanations for the mistakes students make most often. */
const MISTAKES: { from?: ServiceId[]; to?: ServiceId[]; simple: string; tech: string }[] = [
  {
    from: ['users'],
    to: ['dynamodb', 'rds', 'elasticache'],
    simple: 'People can’t reach into the database directly. That’s like customers walking into the bakery’s back office! Go through a front desk and a helper first.',
    tech: 'Databases sit behind an application tier. Clients go through API Gateway with Lambda, or a load balancer with servers.',
  },
  {
    from: ['users'],
    to: ['lambda'],
    simple: 'People can’t poke a helper robot directly here. Put a front desk (API Gateway) in front of it.',
    tech: 'In this game, Lambda is reached through API Gateway or a load balancer. Function URLs exist, but they skip throttling and auth features.',
  },
  {
    from: ['users'],
    simple: 'Townsfolk start their trip at a front door: the address book (Route 53), a copy shop (CloudFront), the front desk (API Gateway), a load balancer, or the gate guard.',
    tech: 'Clients enter through public endpoints: DNS, CloudFront, API Gateway, a load balancer, or an S3 or EC2 endpoint.',
  },
  {
    to: ['users'],
    simple: 'Arrows show requests going into the cloud. To send a message back to people, use the SNS megaphone and connect it to Phones.',
    tech: 'Responses return along the same path automatically. Use SNS when you need to push notifications to devices.',
  },
  {
    from: ['route53'],
    simple: 'Route 53 only hands out addresses. Point it at a front door: CloudFront, a load balancer, API Gateway, or a website bucket.',
    tech: 'DNS records resolve to endpoints such as CloudFront, ALB, API Gateway, S3 website, or IPs, not to functions or databases.',
  },
  {
    from: ['rds', 'elasticache', 'glacier', 'rekognition', 'polly', 'translate', 'bedrock', 'phone', 'cognito'],
    simple: 'This piece is an end stop. It answers questions, but it doesn’t send requests onward.',
    tech: 'This service is called by others and returns a response. It doesn’t invoke downstream targets.',
  },
];

export interface Rejection {
  simple: string;
  tech: string;
  suggestions: ServiceId[];
}

export function explainRejection(from: ServiceId, to: ServiceId): Rejection {
  const suggestions = targetsOf(from).filter((t) => t !== 'cloudwatch').slice(0, 4);
  const hit = MISTAKES.find((m) => (!m.from || m.from.includes(from)) && (!m.to || m.to.includes(to)));
  if (hit) return { simple: hit.simple, tech: hit.tech, suggestions };

  const a = SERVICES[from];
  const b = SERVICES[to];
  return {
    simple: `${a.nickname} ${a.job}. It doesn’t send things to the ${b.nickname}, which ${b.job.replace(/^are /, 'is ')}.`,
    tech: `${a.name} has no integration that sends requests to ${b.name}.`,
    suggestions,
  };
}
