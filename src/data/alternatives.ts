import type { ServiceId } from './types';

// Services that can do the same job, so teams can say why they picked one over the others.
const GROUPS: ServiceId[][] = [
  ['apigw', 'appsync', 'elb'],
  ['amplify', 'cloudfront'],
  ['dynamodb', 'rds', 'aurora'],
  ['s3', 'glacier'],
  ['lambda', 'ec2', 'ecs', 'eks'],
  ['sqs', 'sns', 'eventbridge', 'kinesis'],
  ['bedrock', 'sagemaker', 'lex', 'agentcore'],
  ['athena', 'redshift', 'opensearch'],
];

/** When to pick each service, in one plain sentence. */
export const PICK_WHEN: Partial<Record<ServiceId, string>> = {
  apigw: 'Pick it when an app sends requests to your code, like a form or a button.',
  appsync: 'Pick it when an app needs to ask for exactly the data it wants, with live updates.',
  elb: 'Pick it when you run your own servers and need to share visitors between them.',
  amplify: 'Pick it when you want to build and host a whole website or app in one place.',
  cloudfront: 'Pick it when people far away need your site to load fast.',
  dynamodb: 'Pick it when you look up one record at a time and need it fast, even with lots of people.',
  rds: 'Pick it when your data fits in tables and you need to ask big questions across all of it.',
  aurora: 'Pick it when you need a database like RDS that is faster and keeps extra copies.',
  s3: 'Pick it when you need to keep files like photos, PDFs, and web pages.',
  glacier: 'Pick it when files are old and rarely opened, and you want to save money.',
  lambda: 'Pick it when your code only needs to run when something happens, with no server to look after.',
  ec2: 'Pick it when you need a whole computer that is always on and that you control.',
  ecs: 'Pick it when your app is packed in containers and you want AWS to run them for you.',
  eks: 'Pick it when your team already uses Kubernetes to run containers.',
  sqs: 'Pick it when work should wait in line instead of getting lost in a rush.',
  sns: 'Pick it when one message needs to go to many places or phones at once.',
  eventbridge: 'Pick it when different parts of your app need to react to news, like “an order was placed”.',
  kinesis: 'Pick it when data never stops arriving, like sensor readings every second.',
  bedrock: 'Pick it when you want a ready-made AI model to write or answer questions.',
  sagemaker: 'Pick it when you want to train your own AI model on your own data.',
  lex: 'Pick it when you want a chatbot that understands what people type or say.',
  agentcore: 'Pick it when an AI should take steps for you, using tools to get a job done.',
  athena: 'Pick it when you want to ask questions about files already saved in S3.',
  redshift: 'Pick it when you have huge amounts of data and big questions to ask about it.',
  opensearch: 'Pick it when people need to search for words and find the best matches.',
};

/** Other services that could do the same job as `id`, best-known first. */
export function alternativesOf(id: ServiceId): ServiceId[] {
  return GROUPS.find((g) => g.includes(id))?.filter((s) => s !== id) ?? [];
}
