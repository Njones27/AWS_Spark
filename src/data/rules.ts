import { SERVICES, shortName } from './services';
import type { EdgeKind, Rule, ServiceId } from './types';

type R = [from: ServiceId, to: ServiceId, verb: string, simple: string, tech: string, kind?: EdgeKind];

// Directional allow-list: requests flow from → to. Anything not listed can't connect.
const TABLE: R[] = [
  // People in town
  ['users', 'route53', 'looks up', 'People ask Route 53 where a website lives, like looking up an address.', 'Browsers resolve the domain through Route 53 DNS before connecting.'],
  ['users', 'cloudfront', 'visits', 'People get pages from the nearest CloudFront location.', 'Clients connect to the nearest CloudFront edge location over HTTPS.'],
  ['users', 'apigw', 'sends requests to', 'Apps send their requests to API Gateway.', 'Clients call REST/HTTP endpoints exposed by API Gateway.'],
  ['users', 'elb', 'visits', 'Visitors arrive at the load balancer, which shares them out.', 'Clients hit the load balancer’s DNS name; it forwards to healthy targets.'],
  ['users', 'waf', 'walks past', 'Every visitor passes through WAF first.', 'In real AWS, a WAF web ACL is attached to CloudFront, API Gateway, or an ALB. Here it’s drawn as its own stop.'],
  ['users', 's3', 'downloads from', 'People can download files straight from an S3 bucket.', 'S3 can serve a static website directly. Putting CloudFront in front is the best practice.'],
  ['users', 'ec2', 'visits', 'People can visit a single EC2 server directly.', 'Clients connect to the instance’s public IP. This is fine for small apps, but it’s a single point of failure.'],
  ['users', 'cognito', 'signs in with', 'People sign in with Cognito.', 'Users authenticate against a Cognito user pool and receive JWTs.'],

  // Route 53
  ['route53', 'cloudfront', 'points to', 'Route 53 points people to CloudFront.', 'An alias record maps the domain to the CloudFront distribution.'],
  ['route53', 'elb', 'points to', 'Route 53 points people to the load balancer.', 'An alias record targets the load balancer.'],
  ['route53', 'apigw', 'points to', 'Route 53 points people to API Gateway.', 'A custom domain on API Gateway is mapped with an alias record.'],
  ['route53', 's3', 'points to', 'Route 53 points people to the website in S3.', 'An alias record targets the S3 website endpoint (the bucket name must match the domain).'],
  ['route53', 'ec2', 'points to', 'Route 53 points people to an EC2 server.', 'An A record points to the instance’s Elastic IP.'],

  // WAF
  ['waf', 'cloudfront', 'lets good visitors into', 'WAF only lets real visitors through to CloudFront.', 'A WAF web ACL associated with the distribution filters requests at the edge.'],
  ['waf', 'apigw', 'lets good visitors into', 'WAF only lets real visitors through to API Gateway.', 'A WAF web ACL associated with the API stage.'],
  ['waf', 'elb', 'lets good visitors into', 'WAF only lets real visitors through to the load balancer.', 'A WAF web ACL associated with the Application Load Balancer.'],

  // CDN
  ['cloudfront', 's3', 'keeps copies from', 'CloudFront copies files from S3 and keeps them close to people.', 'S3 origin with Origin Access Control. Edges cache objects based on TTLs.'],
  ['cloudfront', 'elb', 'forwards to', 'CloudFront sends the trickier requests on to the load balancer.', 'The ALB is a custom origin for dynamic content.'],
  ['cloudfront', 'apigw', 'forwards to', 'CloudFront sends API requests on to API Gateway.', 'API Gateway is an origin behind a cache behavior such as /api/*.'],
  ['cloudfront', 'ec2', 'forwards to', 'CloudFront sends requests on to an EC2 server.', 'An EC2 instance is a custom origin.'],

  // API Gateway
  ['apigw', 'lambda', 'calls', 'API Gateway hands each request to a Lambda function.', 'Lambda proxy integration invokes the function once per request.'],
  ['apigw', 'sqs', 'drops tickets into', 'API Gateway can drop requests straight into an SQS queue.', 'Direct service integration calls SQS SendMessage with no Lambda in between.'],
  ['apigw', 'stepfunctions', 'starts', 'API Gateway can start a Step Functions workflow.', 'Service integration calls StartExecution.'],
  ['apigw', 'kinesis', 'streams into', 'API Gateway can put data onto a Kinesis stream.', 'Service integration calls Kinesis PutRecord.'],
  ['apigw', 'ec2', 'forwards to', 'API Gateway can pass requests to an EC2 server.', 'HTTP integration, using a VPC Link for private instances.'],
  ['apigw', 'elb', 'forwards to', 'API Gateway can pass requests to a load balancer.', 'A VPC Link to a private NLB or ALB.'],
  ['apigw', 'cognito', 'checks sign-ins with', 'API Gateway checks with Cognito that you’re signed in before letting you in.', 'A Cognito user pool authorizer validates the JWT on each request.', 'control'],

  // Load balancer
  ['elb', 'ec2', 'shares visitors with', 'The load balancer spreads visitors across servers so none get too busy.', 'A target group of EC2 instances, with health checks.'],
  ['elb', 'lambda', 'shares visitors with', 'The load balancer can send visitors to a Lambda function.', 'An ALB can use a Lambda function as a target.'],

  // Auto Scaling & CloudWatch
  ['autoscaling', 'ec2', 'makes copies of', 'Auto Scaling adds more servers when it gets busy and removes them when it’s quiet.', 'The Auto Scaling group launches instances from a launch template based on scaling policies.', 'control'],
  ['cloudwatch', 'autoscaling', 'tells', 'CloudWatch tells Auto Scaling when the servers are busy.', 'An alarm or target-tracking policy triggers scale-out and scale-in.', 'control'],
  ['cloudwatch', 'sns', 'sounds the alarm with', 'When something looks wrong, CloudWatch sounds the alarm with SNS.', 'The CloudWatch alarm action publishes to an SNS topic.', 'control'],
];

// Workers (Lambda and EC2) can talk to the same back-end services.
const workerTargets: [ServiceId, string, string, string][] = [
  ['dynamodb', 'saves to', 'writes and reads data in DynamoDB', 'SDK calls such as PutItem and GetItem, authorized by the IAM role'],
  ['rds', 'saves to', 'looks things up in an RDS database', 'SQL over the VPC. RDS Proxy pools connections'],
  ['s3', 'stores files in', 'saves files into an S3 bucket', 'PutObject and GetObject through the SDK'],
  ['elasticache', 'checks memory in', 'checks ElastiCache first before asking the database', 'Cache-aside: read ElastiCache first, and fall back to the database on a miss'],
  ['sqs', 'sends tickets to', 'puts work into an SQS queue for later', 'SendMessage to a queue'],
  ['sns', 'announces with', 'tells SNS to send a message', 'Publish to an SNS topic'],
  ['eventbridge', 'posts events to', 'posts news to EventBridge', 'PutEvents to an event bus'],
  ['stepfunctions', 'starts', 'starts a Step Functions workflow', 'StartExecution'],
  ['kinesis', 'streams to', 'puts data onto a Kinesis stream', 'PutRecords'],
  ['rekognition', 'asks', 'asks Rekognition what’s in a photo', 'The DetectLabels API'],
  ['polly', 'asks', 'asks Polly to read text out loud', 'The SynthesizeSpeech API'],
  ['translate', 'asks', 'asks for a translation', 'The TranslateText API'],
  ['bedrock', 'asks', 'asks an AI model in Bedrock to write or answer', 'The InvokeModel and Converse APIs'],
  ['aurora', 'saves to', 'looks things up in an Aurora database', 'SQL over the VPC, often through RDS Proxy'],
  ['redshift', 'asks', 'asks Redshift a big question', 'SQL through the Redshift Data API'],
  ['opensearch', 'searches', 'searches for matches in OpenSearch', 'Search and index requests to the domain endpoint'],
  ['firehose', 'streams to', 'sends a stream of data into Firehose', 'PutRecordBatch to a Firehose stream'],
  ['athena', 'asks', 'asks Athena a question about files in S3', 'StartQueryExecution with SQL'],
  ['sagemaker', 'asks', 'asks a custom model in SageMaker for a prediction', 'InvokeEndpoint on a SageMaker AI endpoint'],
  ['transcribe', 'asks', 'asks Transcribe to turn a recording into words', 'StartTranscriptionJob on audio in S3'],
  ['comprehend', 'asks', 'asks Comprehend what mood a message has', 'DetectSentiment and DetectEntities'],
  ['textract', 'asks', 'asks Textract to read a scanned page', 'AnalyzeDocument on an image or PDF'],
  ['agentcore', 'asks an agent in', 'asks an AI agent in AgentCore to handle a tricky job', 'InvokeAgentRuntime on an AgentCore Runtime endpoint'],
];
const WORKERS = { lambda: 'Lambda', ec2: 'The EC2 server', ecs: 'ECS', eks: 'EKS' };
for (const [worker, who] of Object.entries(WORKERS) as [ServiceId, string][]) {
  for (const [to, verb, simple, tech] of workerTargets) {
    TABLE.push([worker, to, verb, `${who} ${simple}.`, `${tech}.`]);
  }
}

TABLE.push(
  // Storage & database events
  ['s3', 'lambda', 'wakes up', 'When a new file lands in S3, it can wake up a Lambda function.', 'An S3 event notification (ObjectCreated) invokes Lambda asynchronously.'],
  ['s3', 'sqs', 'sends a note to', 'When a new file lands in S3, it can put a message in an SQS queue.', 'An S3 event notification sent to SQS.'],
  ['s3', 'sns', 'sends a note to', 'When a new file lands in S3, it can tell SNS.', 'An S3 event notification sent to SNS.'],
  ['s3', 'eventbridge', 'sends a note to', 'When a new file lands in S3, it can tell EventBridge.', 'S3 sends its events to EventBridge.'],
  ['s3', 'glacier', 'moves old files to', 'Old files can move to Glacier to save money. It’s like a deep freezer for files.', 'A lifecycle rule moves objects to Glacier storage classes.'],
  ['dynamodb', 'lambda', 'wakes up', 'When data changes, DynamoDB can wake up a Lambda function.', 'A DynamoDB Streams event source mapping.'],

  // Queues & messengers
  ['sqs', 'lambda', 'hands tickets to', 'Lambda picks up messages from the queue, a few at a time.', 'An event source mapping polls the queue and invokes Lambda with batches.'],
  ['sqs', 'ec2', 'hands tickets to', 'EC2 servers take the next message from the queue when they’re ready.', 'Workers long-poll ReceiveMessage and delete each message after processing it.'],
  ['sns', 'sqs', 'copies messages to', 'SNS can drop a copy of each message into an SQS queue.', 'SNS-to-SQS fan-out.'],
  ['sns', 'lambda', 'wakes up', 'SNS can wake up a Lambda function.', 'Lambda subscribed to the topic.'],
  ['sns', 'phone', 'texts', 'SNS sends a text message or a “ding!” notification to phones.', 'SMS or mobile push through platform endpoints.'],
  ['eventbridge', 'lambda', 'routes events to', 'EventBridge sends matching news to a Lambda function.', 'A rule with Lambda as the target.'],
  ['eventbridge', 'sqs', 'routes events to', 'EventBridge drops matching news into an SQS queue.', 'A rule with SQS as the target.'],
  ['eventbridge', 'sns', 'routes events to', 'EventBridge hands matching news to SNS.', 'A rule with SNS as the target.'],
  ['eventbridge', 'stepfunctions', 'routes events to', 'EventBridge starts a Step Functions workflow.', 'A rule with a Step Functions state machine as the target.'],
  ['stepfunctions', 'lambda', 'runs a step on', 'Each step in a Step Functions workflow can ask a Lambda function.', 'A Task state invokes Lambda.'],
  ['stepfunctions', 'dynamodb', 'saves to', 'Step Functions can write straight into DynamoDB.', 'Optimized integration calls PutItem.'],
  ['stepfunctions', 'sns', 'announces with', 'Step Functions can tell SNS when it’s done.', 'Optimized integration publishes to SNS.'],
  ['stepfunctions', 'sqs', 'sends tickets to', 'Step Functions can put a message in an SQS queue.', 'Optimized integration calls SQS SendMessage.'],
  ['stepfunctions', 'bedrock', 'asks', 'Step Functions can ask an AI model in Bedrock for help.', 'Optimized integration calls Bedrock InvokeModel.'],
  ['kinesis', 'lambda', 'feeds', 'Lambda reads things off the Kinesis stream.', 'An event source mapping reads shards in batches.'],

  // Containers
  ['elb', 'ecs', 'shares visitors with', 'The load balancer spreads visitors across the containers in ECS.', 'An ALB target group of ECS tasks.'],
  ['elb', 'eks', 'shares visitors with', 'The load balancer spreads visitors across the containers in EKS.', 'The AWS Load Balancer Controller registers pods as ALB targets.'],
  ['apigw', 'ecs', 'forwards to', 'API Gateway can pass requests to containers in ECS.', 'HTTP integration through a VPC Link to a private load balancer in front of the service.'],
  ['apigw', 'eks', 'forwards to', 'API Gateway can pass requests to containers in EKS.', 'HTTP integration through a VPC Link to a private load balancer in front of the pods.'],
  ['sqs', 'ecs', 'hands tickets to', 'Containers take the next message from the queue when they’re ready.', 'Tasks long-poll ReceiveMessage. Service auto scaling can track queue depth.'],
  ['sqs', 'eks', 'hands tickets to', 'Containers take the next message from the queue when they’re ready.', 'Pods long-poll the queue. KEDA can scale them on queue depth.'],
  ['eventbridge', 'ecs', 'starts a task on', 'EventBridge can start a container job in ECS when news arrives.', 'A rule with an ECS RunTask target.'],
  ['stepfunctions', 'ecs', 'runs a step on', 'A Step Functions step can run in a container on ECS.', 'Optimized integration: ecs:runTask (.sync).'],
  ['stepfunctions', 'eks', 'runs a step on', 'A Step Functions step can run as a job on EKS.', 'Optimized integration: eks:runJob.'],

  // AI & agents
  ['agentcore', 'bedrock', 'thinks with', 'An AgentCore agent asks a Bedrock model to think through each job.', 'The agent calls a Bedrock model (InvokeModel / Converse) to reason and plan.'],
  ['agentcore', 'sagemaker', 'thinks with', 'An AgentCore agent can think with a custom model from SageMaker.', 'The agent calls a model hosted on a SageMaker AI endpoint.'],
  ['agentcore', 'lambda', 'uses a tool on', 'An agent can ask a Lambda function to do a job for it, like looking up an order.', 'AgentCore Gateway exposes the Lambda function to the agent as an MCP tool.'],
  ['agentcore', 'cognito', 'checks sign-ins with', 'AgentCore checks with Cognito who is asking before it helps.', 'Inbound auth: AgentCore Identity validates Cognito-issued JWTs.', 'control'],
  ['users', 'lex', 'chats with', 'People type their questions to a Lex chatbot.', 'Clients call the Lex runtime (RecognizeText / RecognizeUtterance).'],
  ['lex', 'lambda', 'asks for help from', 'The Lex chatbot asks a Lambda function to finish the job, like placing an order.', 'A Lambda code hook fulfills the intent.'],
  ['apigw', 'sagemaker', 'asks', 'API Gateway can ask a custom SageMaker model directly.', 'AWS service integration calls InvokeEndpoint on the SageMaker runtime.'],
  ['stepfunctions', 'sagemaker', 'trains a model in', 'A Step Functions step can train a new model in SageMaker.', 'Optimized integration: sagemaker:createTrainingJob (.sync).'],

  // Web apps
  ['users', 'amplify', 'visits', 'People visit the website that Amplify put online.', 'Amplify Hosting serves the app over its managed CDN.'],
  ['route53', 'amplify', 'points to', 'Route 53 points people to the Amplify website.', 'A custom domain on Amplify Hosting, managed in Route 53.'],
  ['amplify', 'appsync', 'loads data from', 'The web app asks AppSync for the data it shows.', 'The frontend calls the AppSync GraphQL API (Amplify Data).'],
  ['amplify', 'apigw', 'calls', 'The web app sends its requests to API Gateway.', 'The frontend calls REST endpoints on API Gateway.'],
  ['amplify', 'cognito', 'signs people in with', 'The web app uses Cognito so people can sign in.', 'Amplify Auth uses a Cognito user pool.', 'control'],
  ['users', 'appsync', 'asks questions at', 'Apps ask AppSync for exactly the data they need.', 'Clients send GraphQL queries, mutations, and subscriptions to AppSync.'],
  ['waf', 'appsync', 'lets good visitors into', 'WAF only lets real visitors through to AppSync.', 'A WAF web ACL associated with the AppSync API.'],
  ['appsync', 'lambda', 'asks', 'AppSync can ask a Lambda function to work out an answer.', 'A Lambda resolver.'],
  ['appsync', 'dynamodb', 'reads and writes', 'AppSync can read and write data in DynamoDB directly.', 'A DynamoDB data source with JavaScript resolvers.'],
  ['appsync', 'aurora', 'reads and writes', 'AppSync can look things up in an Aurora database.', 'An Aurora data source through the RDS Data API.'],
  ['appsync', 'opensearch', 'searches', 'AppSync can search with OpenSearch.', 'An OpenSearch Service data source.'],
  ['appsync', 'eventbridge', 'posts events to', 'AppSync can post news to EventBridge.', 'An EventBridge data source (PutEvents).'],
  ['appsync', 'bedrock', 'asks', 'AppSync can ask an AI model in Bedrock directly.', 'A Bedrock runtime data source (InvokeModel / Converse).'],
  ['appsync', 'cognito', 'checks sign-ins with', 'AppSync checks with Cognito that you’re signed in.', 'A Cognito user pool authorization mode.', 'control'],

  // Data & analytics
  ['kinesis', 'firehose', 'feeds', 'A Kinesis stream can feed Firehose.', 'Firehose with a Kinesis Data Streams source.'],
  ['apigw', 'firehose', 'streams into', 'API Gateway can send data straight into Firehose.', 'Service integration calls Firehose PutRecord.'],
  ['eventbridge', 'firehose', 'routes events to', 'EventBridge can send news into Firehose.', 'A rule with a Firehose stream target.'],
  ['firehose', 's3', 'delivers to', 'Firehose saves the stream as files in an S3 bucket.', 'S3 destination with buffering and optional Parquet conversion.'],
  ['firehose', 'redshift', 'delivers to', 'Firehose delivers data to Redshift, a data warehouse.', 'Redshift destination, staged through S3 and loaded with COPY.'],
  ['firehose', 'opensearch', 'delivers to', 'Firehose delivers data to OpenSearch.', 'OpenSearch Service destination.'],
  ['athena', 's3', 'reads data in', 'Athena reads the files in S3 to find answers.', 'Athena scans objects in S3 and writes query results back to S3.'],
  ['athena', 'glue', 'checks the table list in', 'Athena checks the Glue Data Catalog to learn what the files hold.', 'The Glue Data Catalog holds the table schemas that Athena queries.', 'control'],
  ['stepfunctions', 'athena', 'runs a query on', 'A Step Functions step can ask Athena a question.', 'Optimized integration: athena:startQueryExecution (.sync).'],
  ['stepfunctions', 'glue', 'starts a job on', 'A Step Functions step can start a Glue data-cleaning job.', 'Optimized integration: glue:startJobRun (.sync).'],
  ['eventbridge', 'glue', 'starts', 'EventBridge can start a Glue data-cleaning job when news arrives.', 'An EventBridge event triggers a Glue workflow.'],
  ['glue', 's3', 'cleans and saves data to', 'Glue tidies data and saves it in S3.', 'Glue ETL jobs write their output to S3, often as Parquet.'],
  ['glue', 'redshift', 'loads data into', 'Glue loads tidy data into Redshift.', 'Glue ETL jobs load data into Redshift tables.'],
  ['cloudtrail', 's3', 'saves its logbook to', 'CloudTrail saves its log as files in an S3 bucket.', 'A trail delivers log files to an S3 bucket.', 'monitor'],
);

// Badge pieces don't carry requests: their control arrows pin a badge on the piece they point at.
const BADGES: { from: ServiceId; to: ServiceId[]; verb: string; simple: (to: string) => string; tech: (to: string) => string }[] = [
  {
    from: 'iam',
    to: ['lambda', 'ec2', 'ecs', 'eks', 'agentcore', 'stepfunctions', 'apigw', 'glue', 'firehose', 'sagemaker'],
    verb: 'gives a permission badge to',
    simple: (t) => `IAM gives ${t} a permission badge that lists what it’s allowed to do.`,
    tech: (t) => `An IAM role grants ${t} least-privilege permissions to call other AWS services.`,
  },
  {
    from: 'secrets',
    to: ['lambda', 'ec2', 'ecs', 'eks', 'glue'],
    verb: 'hands passwords to',
    simple: (t) => `Secrets Manager hands ${t} its passwords, so they never have to be written in the code.`,
    tech: (t) => `${t} reads credentials at runtime with GetSecretValue instead of hard-coding them.`,
  },
  {
    from: 'kms',
    to: ['s3', 'dynamodb', 'rds', 'aurora', 'sqs', 'sns', 'kinesis', 'redshift', 'opensearch'],
    verb: 'locks data in',
    simple: (t) => `KMS locks the data in ${t}, so only allowed services can read it.`,
    tech: (t) => `${t} encrypts data at rest with a customer managed KMS key.`,
  },
  {
    from: 'shield',
    to: ['cloudfront', 'elb', 'route53'],
    verb: 'guards',
    simple: (t) => `Shield guards ${t} against giant floods of fake traffic.`,
    tech: (t) => `Shield Advanced protection on ${t}, with DDoS detection and mitigation.`,
  },
  {
    from: 'fargate',
    to: ['ecs', 'eks'],
    verb: 'runs the containers for',
    simple: (t) => `Fargate runs the containers for ${t}, so nobody has to look after servers.`,
    tech: (t) => `The Fargate launch type runs ${t} workloads without managing EC2 instances.`,
  },
];
for (const b of BADGES) {
  for (const to of b.to) TABLE.push([b.from, to, b.verb, b.simple(shortName(to)), b.tech(SERVICES[to].name), 'control']);
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
      `${shortName(s.id)} sends its health numbers to CloudWatch.`,
      `${s.name} publishes metrics and logs to CloudWatch.`,
      'monitor',
    ]);
  }
  if (s.id !== 'cloudtrail') {
    TABLE.push([
      s.id,
      'cloudtrail',
      'is recorded in',
      `Every change to ${shortName(s.id)} is written down in CloudTrail.`,
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
    simple: 'People can’t reach into the database directly. That’s like customers walking into the bakery’s back office! Go through API Gateway and Lambda first.',
    tech: 'Databases sit behind an application tier. Clients go through API Gateway with Lambda, or a load balancer with servers.',
  },
  {
    from: ['users'],
    to: ['lambda'],
    simple: 'People can’t reach Lambda directly here. Put API Gateway in front of it.',
    tech: 'In this game, Lambda is reached through API Gateway or a load balancer. Function URLs exist, but they skip throttling and auth features.',
  },
  {
    from: ['users'],
    simple: 'Townsfolk start their trip at a front door: Route 53, CloudFront, API Gateway, a load balancer, WAF, or an app built with Amplify, AppSync, or Lex.',
    tech: 'Clients enter through public endpoints: DNS, CloudFront, API Gateway, AppSync, Amplify, Lex, a load balancer, or an S3 or EC2 endpoint.',
  },
  {
    to: ['users'],
    simple: 'Arrows show requests going into the cloud. To send a message back to people, use SNS and connect it to Phones.',
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
      simple: `This arrow points the wrong way. Try drawing it from ${shortName(to)} to ${shortName(from)}.`,
      tech: `Draw it the other way: ${b.name} ${back.verb} ${a.name}.`,
      suggestions: [],
    };
  }

  const suggestions = targetsOf(from, false);
  const hit = MISTAKES.find((m) => (!m.from || m.from.includes(from)) && (!m.to || m.to.includes(to)));
  if (hit) return { simple: hit.simple, tech: hit.tech, suggestions };

  return {
    simple: `${shortName(from)} ${a.job}. It doesn’t send things to ${shortName(to)}, which ${b.job.replace(/^are /, 'is ')}.`,
    tech: `${a.name} has no integration that sends requests to ${b.name}.`,
    suggestions,
  };
}
