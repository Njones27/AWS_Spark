export type Band = 'explorer' | 'builder' | 'architect';

/** Text that can change with the grade band. `builder` is the fallback. */
export type BandText = string | ({ builder: string } & Partial<Record<Band, string>>);

export type ServiceId =
  | 'users'
  | 'phone'
  | 'route53'
  | 'cloudfront'
  | 'apigw'
  | 'elb'
  | 'waf'
  | 'lambda'
  | 'ec2'
  | 'autoscaling'
  | 's3'
  | 'glacier'
  | 'dynamodb'
  | 'rds'
  | 'elasticache'
  | 'sqs'
  | 'sns'
  | 'eventbridge'
  | 'stepfunctions'
  | 'cognito'
  | 'cloudwatch'
  | 'kinesis'
  | 'rekognition'
  | 'polly'
  | 'translate'
  | 'bedrock'
  | 'iam'
  | 'secrets'
  | 'kms'
  | 'shield'
  | 'cloudtrail'
  | 'agentcore'
  | 'sagemaker'
  | 'lex'
  | 'transcribe'
  | 'comprehend'
  | 'textract'
  | 'ecs'
  | 'eks'
  | 'fargate'
  | 'amplify'
  | 'appsync'
  | 'aurora'
  | 'firehose'
  | 'athena'
  | 'glue'
  | 'redshift'
  | 'opensearch';

export type Category =
  | 'town'
  | 'networking'
  | 'frontend'
  | 'compute'
  | 'containers'
  | 'storage'
  | 'databases'
  | 'integration'
  | 'security'
  | 'management'
  | 'analytics'
  | 'ai';

export interface ServiceDef {
  id: ServiceId;
  /** Real name, e.g. "Amazon S3". */
  name: string;
  category: Category;
  /** Short phrase used in generated sentences: "S3 {job}". */
  job: string;
  blurb: Record<Band, string>;
  /** Requests it can handle per tick before it overloads. */
  capacity: number;
  /** How incoming requests leave: shared between arrows, or copied to every arrow. */
  forward: 'split' | 'broadcast' | 'none';
  /** Can a request finish here? Routers like Route 53 can't answer by themselves. */
  answers: boolean;
  source?: boolean;
  queue?: boolean;
  cdnHitRate?: number;
  filtersBots?: boolean;
  cache?: boolean;
  /** Doesn't carry requests: its control arrows pin its icon as a badge on the pieces they point at. */
  badge?: boolean;
  /** Included in the Explorer (K–5) playground. */
  basic?: boolean;
}

export type EdgeKind = 'data' | 'control' | 'monitor';

export interface Rule {
  from: ServiceId;
  to: ServiceId;
  verb: string;
  kind: EdgeKind;
  simple: string;
  tech: string;
}

export interface XY {
  x: number;
  y: number;
}

export interface SourceSpec {
  demand: number;
  bots?: number;
  /** Service ids or node ids the request must pass through. */
  needs?: string[];
  far?: boolean;
}
