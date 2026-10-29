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
  ['aurora', 'saves to', 'looks things up in the Aurora turbo cabinet', 'SQL over the VPC, often through RDS Proxy'],
  ['redshift', 'asks', 'asks the data warehouse a big question', 'SQL through the Redshift Data API'],
  ['opensearch', 'searches', 'searches for matches in OpenSearch', 'Search and index requests to the domain endpoint'],
  ['firehose', 'streams to', 'sends a stream of data into the data hose', 'PutRecordBatch to a Firehose stream'],
  ['athena', 'asks', 'asks Athena a question about files in S3', 'StartQueryExecution with SQL'],
  ['sagemaker', 'asks', 'asks a custom model in SageMaker for a prediction', 'InvokeEndpoint on a SageMaker AI endpoint'],
  ['transcribe', 'asks', 'asks Transcribe to turn a recording into words', 'StartTranscriptionJob on audio in S3'],
  ['comprehend', 'asks', 'asks Comprehend what mood a message has', 'DetectSentiment and DetectEntities'],
  ['textract', 'asks', 'asks Textract to read a scanned page', 'AnalyzeDocument on an image or PDF'],
  ['agentcore', 'asks an agent in', 'asks an AI agent to handle a tricky job', 'InvokeAgentRuntime on an AgentCore Runtime endpoint'],
];
const WORKERS = { lambda: 'The Lambda helper', ec2: 'The cloud computer', ecs: 'The container crew', eks: 'The container captain' };
for (const [worker, who] of Object.entries(WORKERS) as [ServiceId, string][]) {
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

  // Containers
  ['elb', 'ecs', 'shares visitors with', 'The load balancer spreads visitors across the container crew.', 'An ALB target group of ECS tasks.'],
  ['elb', 'eks', 'shares visitors with', 'The load balancer spreads visitors across the containers.', 'The AWS Load Balancer Controller registers pods as ALB targets.'],
  ['apigw', 'ecs', 'forwards to', 'The front desk can pass requests to the container crew.', 'HTTP integration through a VPC Link to a private load balancer in front of the service.'],
  ['apigw', 'eks', 'forwards to', 'The front desk can pass requests to the container captain.', 'HTTP integration through a VPC Link to a private load balancer in front of the pods.'],
  ['sqs', 'ecs', 'hands tickets to', 'Containers take the next ticket from the line when they’re ready.', 'Tasks long-poll ReceiveMessage. Service auto scaling can track queue depth.'],
  ['sqs', 'eks', 'hands tickets to', 'Containers take the next ticket from the line when they’re ready.', 'Pods long-poll the queue. KEDA can scale them on queue depth.'],
  ['eventbridge', 'ecs', 'starts a task on', 'The mail sorter can start a container job when news arrives.', 'A rule with an ECS RunTask target.'],
  ['stepfunctions', 'ecs', 'runs a step on', 'A checklist step can run in a container.', 'Optimized integration: ecs:runTask (.sync).'],
  ['stepfunctions', 'eks', 'runs a step on', 'A checklist step can run as a job on the container captain.', 'Optimized integration: eks:runJob.'],

  // AI & agents
  ['agentcore', 'bedrock', 'thinks with', 'The agent workshop asks the AI Brain to think through each job.', 'The agent calls a Bedrock model (InvokeModel / Converse) to reason and plan.'],
  ['agentcore', 'sagemaker', 'thinks with', 'The agent workshop can think with a custom model from the Model Lab.', 'The agent calls a model hosted on a SageMaker AI endpoint.'],
  ['agentcore', 'lambda', 'uses a tool on', 'An agent can ask a Lambda helper to do a job for it, like looking up an order.', 'AgentCore Gateway exposes the Lambda function to the agent as an MCP tool.'],
  ['agentcore', 'cognito', 'checks name tags with', 'The agent workshop checks who is asking before it helps.', 'Inbound auth: AgentCore Identity validates Cognito-issued JWTs.', 'control'],
  ['users', 'lex', 'chats with', 'People type their questions to the chatbot.', 'Clients call the Lex runtime (RecognizeText / RecognizeUtterance).'],
  ['lex', 'lambda', 'asks for help from', 'The chatbot asks a Lambda helper to finish the job, like placing an order.', 'A Lambda code hook fulfills the intent.'],
  ['apigw', 'sagemaker', 'asks', 'The front desk can ask a custom model directly.', 'AWS service integration calls InvokeEndpoint on the SageMaker runtime.'],
  ['stepfunctions', 'sagemaker', 'trains a model in', 'A checklist step can train a new model in the Model Lab.', 'Optimized integration: sagemaker:createTrainingJob (.sync).'],

  // Web apps
  ['users', 'amplify', 'visits', 'People visit the website that the Website Kit put online.', 'Amplify Hosting serves the app over its managed CDN.'],
  ['route53', 'amplify', 'points to', 'The address book points people to the Website Kit.', 'A custom domain on Amplify Hosting, managed in Route 53.'],
  ['amplify', 'appsync', 'loads data from', 'The web app asks the Question Desk for the data it shows.', 'The frontend calls the AppSync GraphQL API (Amplify Data).'],
  ['amplify', 'apigw', 'calls', 'The web app sends its requests to the front desk.', 'The frontend calls REST endpoints on API Gateway.'],
  ['amplify', 'cognito', 'signs people in with', 'The web app uses the name tag desk so people can sign in.', 'Amplify Auth uses a Cognito user pool.', 'control'],
  ['users', 'appsync', 'asks questions at', 'Apps ask the Question Desk for exactly the data they need.', 'Clients send GraphQL queries, mutations, and subscriptions to AppSync.'],
  ['waf', 'appsync', 'lets good visitors into', 'The gate guard only lets real visitors through to the Question Desk.', 'A WAF web ACL associated with the AppSync API.'],
  ['appsync', 'lambda', 'asks', 'The Question Desk can ask a Lambda helper to work out an answer.', 'A Lambda resolver.'],
  ['appsync', 'dynamodb', 'reads and writes', 'The Question Desk can read and write data in DynamoDB directly.', 'A DynamoDB data source with JavaScript resolvers.'],
  ['appsync', 'aurora', 'reads and writes', 'The Question Desk can look things up in the Aurora turbo cabinet.', 'An Aurora data source through the RDS Data API.'],
  ['appsync', 'opensearch', 'searches', 'The Question Desk can search with OpenSearch.', 'An OpenSearch Service data source.'],
  ['appsync', 'eventbridge', 'posts events to', 'The Question Desk can post news to the mail sorter.', 'An EventBridge data source (PutEvents).'],
  ['appsync', 'bedrock', 'asks', 'The Question Desk can ask the AI Brain directly.', 'A Bedrock runtime data source (InvokeModel / Converse).'],
  ['appsync', 'cognito', 'checks name tags with', 'The Question Desk checks your name tag with Cognito.', 'A Cognito user pool authorization mode.', 'control'],

  // Data & analytics
  ['kinesis', 'firehose', 'feeds', 'The conveyor belt can feed the data hose.', 'Firehose with a Kinesis Data Streams source.'],
  ['apigw', 'firehose', 'streams into', 'The front desk can send data straight into the data hose.', 'Service integration calls Firehose PutRecord.'],
  ['eventbridge', 'firehose', 'routes events to', 'The mail sorter can send news into the data hose.', 'A rule with a Firehose stream target.'],
  ['firehose', 's3', 'delivers to', 'The data hose saves the stream as files in an S3 bucket.', 'S3 destination with buffering and optional Parquet conversion.'],
  ['firehose', 'redshift', 'delivers to', 'The data hose delivers data to the data warehouse.', 'Redshift destination, staged through S3 and loaded with COPY.'],
  ['firehose', 'opensearch', 'delivers to', 'The data hose delivers data to the search engine.', 'OpenSearch Service destination.'],
  ['athena', 's3', 'reads data in', 'The fact finder reads the files in S3 to find answers.', 'Athena scans objects in S3 and writes query results back to S3.'],
  ['athena', 'glue', 'checks the table list in', 'The fact finder checks the data catalog to learn what the files hold.', 'The Glue Data Catalog holds the table schemas that Athena queries.', 'control'],
  ['stepfunctions', 'athena', 'runs a query on', 'A checklist step can ask the fact finder a question.', 'Optimized integration: athena:startQueryExecution (.sync).'],
  ['stepfunctions', 'glue', 'starts a job on', 'A checklist step can start a data-cleaning job.', 'Optimized integration: glue:startJobRun (.sync).'],
  ['eventbridge', 'glue', 'starts', 'The mail sorter can start a data-cleaning job when news arrives.', 'An EventBridge event triggers a Glue workflow.'],
  ['glue', 's3', 'cleans and saves data to', 'The data cleaner tidies data and saves it in S3.', 'Glue ETL jobs write their output to S3, often as Parquet.'],
  ['glue', 'redshift', 'loads data into', 'The data cleaner loads tidy data into the data warehouse.', 'Glue ETL jobs load data into Redshift tables.'],
  ['cloudtrail', 's3', 'saves its logbook to', 'The logbook is saved as files in an S3 bucket.', 'A trail delivers log files to an S3 bucket.', 'monitor'],
);

// Badge pieces don't carry requests: their control arrows pin a badge on the piece they point at.
const BADGES: { from: ServiceId; to: ServiceId[]; verb: string; simple: (to: string) => string; tech: (to: string) => string }[] = [
  {
    from: 'iam',
    to: ['lambda', 'ec2', 'ecs', 'eks', 'agentcore', 'stepfunctions', 'apigw', 'glue', 'firehose', 'sagemaker'],
    verb: 'gives a permission badge to',
    simple: (t) => `The Key Keeper gives the ${t} a permission badge that lists what it’s allowed to do.`,
    tech: (t) => `An IAM role grants ${t} least-privilege permissions to call other AWS services.`,
  },
  {
    from: 'secrets',
    to: ['lambda', 'ec2', 'ecs', 'eks', 'glue'],
    verb: 'hands passwords to',
    simple: (t) => `The Secret Safe hands the ${t} its passwords, so they never have to be written in the code.`,
    tech: (t) => `${t} reads credentials at runtime with GetSecretValue instead of hard-coding them.`,
  },
  {
    from: 'kms',
    to: ['s3', 'dynamodb', 'rds', 'aurora', 'sqs', 'sns', 'kinesis', 'redshift', 'opensearch'],
    verb: 'locks data in',
    simple: (t) => `The Lock Maker locks the data in the ${t}, so only allowed helpers can read it.`,
    tech: (t) => `${t} encrypts data at rest with a customer managed KMS key.`,
  },
  {
    from: 'shield',
    to: ['cloudfront', 'elb', 'route53'],
    verb: 'guards',
    simple: (t) => `The Flood Wall guards the ${t} against giant floods of fake traffic.`,
    tech: (t) => `Shield Advanced protection on ${t}, with DDoS detection and mitigation.`,
  },
  {
    from: 'fargate',
    to: ['ecs', 'eks'],
    verb: 'runs the containers for',
    simple: (t) => `The Engine Room runs the containers for the ${t}, so nobody has to look after servers.`,
    tech: (t) => `The Fargate launch type runs ${t} workloads without managing EC2 instances.`,
  },
];
for (const b of BADGES) {
  for (const to of b.to) TABLE.push([b.from, to, b.verb, b.simple(SERVICES[to].nickname), b.tech(SERVICES[to].name), 'control']);
}

// Every AWS service reports its health to CloudWatch, and CloudTrail records every change to it.
// IAM is the exception for CloudWatch: it publishes no metrics, and its activity shows up in CloudTrail instead.
for (const s of Object.values(SERVICES)) {
  if (s.category === 'town') continue;
  if (s.id !== 'cloudwatch' && s.id !== 'iam') {
    TABLE.push([
      s.id,
      'cloudwatch',
      'reports to',
      `${s.nickname} sends its health numbers to the CloudWatch watchtower.`,
      `${s.name} publishes metrics and logs to CloudWatch.`,
      'monitor',
    ]);
  }
  if (s.id !== 'cloudtrail') {
    TABLE.push([
      s.id,
      'cloudtrail',
      'is recorded in',
      `Every change to the ${s.nickname} is written down in the CloudTrail logbook.`,
      `API calls to ${s.name} are logged by CloudTrail.`,
      'monitor',
    ]);
  }
}

export const RULES: Rule[] = TABLE.map(([from, to, verb, simple, tech, kind = 'data']) => ({ from, to, verb, simple, tech, kind }));

const index = new Map<string, Rule>(RULES.map((r) => [`${r.from}>${r.to}`, r]));

export function findRule(from: ServiceId, to: ServiceId): Rule | undefined {
  return index.get(`${from}>${to}`);
}

/** The pieces every AWS piece can send a monitor arrow to. */
const MONITORS: ServiceId[] = ['cloudwatch', 'cloudtrail'];

/**
 * Where `from` can send arrows. The monitor arrows every piece can send to CloudWatch and CloudTrail are optional
 * extras, so `includeMonitor = false` leaves them out (but keeps CloudTrail → S3, which is CloudTrail's real job).
 */
export function targetsOf(from: ServiceId, includeMonitor = true): ServiceId[] {
  return RULES.filter((r) => r.from === from && (includeMonitor || r.kind !== 'monitor' || !MONITORS.includes(r.to))).map(
    (r) => r.to,
  );
}

export function sourcesOf(to: ServiceId): ServiceId[] {
  return RULES.filter((r) => r.to === to).map((r) => r.from);
}

/** Hand-written explanations for the mistakes students make most often. */
const MISTAKES: { from?: ServiceId[]; to?: ServiceId[]; simple: string; tech: string }[] = [
  {
    from: ['users'],
    to: ['dynamodb', 'rds', 'aurora', 'elasticache', 'redshift', 'opensearch'],
    simple: 'People can’t reach into the database directly. That’s like customers walking into the bakery’s back office! Go through a front desk and a helper first.',
    tech: 'Databases sit behind an application tier. Clients go through API Gateway with Lambda, or a load balancer with servers.',
  },
  {
    from: ['users'],
    to: ['lambda'],
    simple: 'People can’t reach a helper robot directly here. Put a front desk (API Gateway) in front of it.',
    tech: 'In this game, Lambda is reached through API Gateway or a load balancer. Function URLs exist, but they skip throttling and auth features.',
  },
  {
    from: ['users'],
    simple: 'Townsfolk start their trip at a front door: the address book (Route 53), a copy shop (CloudFront), the front desk (API Gateway), a load balancer, the gate guard, or an app like the Website Kit, the Question Desk, or the Chatbot.',
    tech: 'Clients enter through public endpoints: DNS, CloudFront, API Gateway, AppSync, Amplify, Lex, a load balancer, or an S3 or EC2 endpoint.',
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
    from: ['iam', 'secrets', 'kms', 'shield', 'fargate', 'autoscaling'],
    simple: 'This piece doesn’t carry requests. It pins a badge on the piece it points at, so connect it to a piece that needs it.',
    tech: 'This service attaches to other resources (roles, secrets, keys, protections, capacity) instead of handling requests.',
  },
  {
    from: [
      'rds', 'aurora', 'elasticache', 'glacier', 'redshift', 'opensearch', 'rekognition', 'polly', 'translate', 'bedrock',
      'sagemaker', 'transcribe', 'comprehend', 'textract', 'phone', 'cognito',
    ],
    simple: 'This piece is an end stop. It answers questions, but it doesn’t send requests onward.',
    tech: 'This service is called by others and returns a response. It doesn’t invoke downstream targets.',
  },
];

export interface Rejection {
  simple: string;
  tech: string;
  suggestions: ServiceId[];
}

/** Why `from → to` can't connect. `suggestions` lists every piece `from` can send to; callers pick the ones on hand. */
export function explainRejection(from: ServiceId, to: ServiceId): Rejection {
  const a = SERVICES[from];
  const b = SERVICES[to];
  const back = findRule(to, from);
  if (back) {
    return {
      simple: `This arrow points the wrong way. Try drawing it from the ${b.nickname} to the ${a.nickname}.`,
      tech: `Draw it the other way: ${b.name} ${back.verb} ${a.name}.`,
      suggestions: [],
    };
  }

  const suggestions = targetsOf(from, false);
  const hit = MISTAKES.find((m) => (!m.from || m.from.includes(from)) && (!m.to || m.to.includes(to)));
  if (hit) return { simple: hit.simple, tech: hit.tech, suggestions };

  return {
    simple: `${a.nickname} ${a.job}. It doesn’t send things to the ${b.nickname}, which ${b.job.replace(/^are /, 'is ')}.`,
    tech: `${a.name} has no integration that sends requests to ${b.name}.`,
    suggestions,
  };
}
