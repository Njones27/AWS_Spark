import type { ServiceId } from './types';

/**
 * Estimated monthly cost in US dollars of one piece running at this game's traffic levels.
 * These are rough teaching numbers, not a price list: they keep the real ratios (Redshift costs far more than SQS,
 * Shield Advanced is a flat $3,000) so budget levels reward the same choices a real bill would.
 */
export const COST: Record<ServiceId, number> = {
  users: 0,
  phone: 0,
  route53: 5,
  cloudfront: 80,
  apigw: 120,
  elb: 60,
  waf: 40,
  cognito: 30,
  lambda: 40,
  ec2: 70,
  // Auto Scaling itself is free. You pay for the extra instances, so a scaled EC2 piece costs AUTOSCALE_FACTOR times as much.
  autoscaling: 0,
  s3: 25,
  glacier: 5,
  dynamodb: 60,
  rds: 150,
  elasticache: 110,
  sqs: 10,
  sns: 10,
  eventbridge: 10,
  stepfunctions: 25,
  cloudwatch: 30,
  kinesis: 90,
  rekognition: 100,
  polly: 40,
  translate: 60,
  bedrock: 400,
  iam: 0,
  secrets: 5,
  kms: 5,
  shield: 3000,
  cloudtrail: 5,
  agentcore: 150,
  sagemaker: 500,
  lex: 75,
  transcribe: 100,
  comprehend: 80,
  textract: 120,
  ecs: 90,
  eks: 160,
  // Like Auto Scaling, Fargate's price is in the tasks it runs, which the ECS or EKS piece already counts.
  fargate: 0,
  amplify: 30,
  appsync: 80,
  aurora: 350,
  firehose: 60,
  athena: 40,
  glue: 100,
  redshift: 900,
  opensearch: 400,
};

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
