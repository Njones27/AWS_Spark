// Copies the curated AWS Architecture Icons used by the app into public/icons.
// Usage: npm run icons -- "/path/to/Icon-package_XXXX"
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = process.argv[2];
if (!pkg || !existsSync(pkg)) {
  console.error('Pass the path to the unzipped AWS icon package, e.g.\n  npm run icons -- "~/Downloads/AWS Icons & Assets/Icon-package_07312026..."');
  process.exit(1);
}

const arch = (category, name) => `Architecture-Service-Icons_07312026/Arch_${category}/64/Arch_${name}_64.svg`;
const res = (name) => `Resource-Icons_07312026/Res_General-Icons/Res_48_Light/Res_${name}_48_Light.svg`;
const cat = (name) => `Category-Icons_07312026/Arch-Category_64/Arch-Category_${name}_64.svg`;

// app id -> path inside the icon package
const ICONS = {
  users: res('Users'),
  phone: res('Mobile-client'),
  route53: arch('Networking-Content-Delivery', 'Amazon-Route-53'),
  cloudfront: arch('Networking-Content-Delivery', 'Amazon-CloudFront'),
  apigw: arch('Networking-Content-Delivery', 'Amazon-API-Gateway'),
  elb: arch('Networking-Content-Delivery', 'Elastic-Load-Balancing'),
  lambda: arch('Compute', 'AWS-Lambda'),
  ec2: arch('Compute', 'Amazon-EC2'),
  autoscaling: arch('Compute', 'Amazon-EC2-Auto-Scaling'),
  s3: arch('Storage', 'Amazon-Simple-Storage-Service'),
  glacier: arch('Storage', 'Amazon-Simple-Storage-Service-Glacier'),
  dynamodb: arch('Databases', 'Amazon-DynamoDB'),
  rds: arch('Databases', 'Amazon-RDS'),
  elasticache: arch('Databases', 'Amazon-ElastiCache'),
  sqs: arch('Application-Integration', 'Amazon-Simple-Queue-Service'),
  sns: arch('Application-Integration', 'Amazon-Simple-Notification-Service'),
  eventbridge: arch('Application-Integration', 'Amazon-EventBridge'),
  stepfunctions: arch('Application-Integration', 'AWS-Step-Functions'),
  cognito: arch('Security-Identity', 'Amazon-Cognito'),
  waf: arch('Security-Identity', 'AWS-WAF'),
  cloudwatch: arch('Management-Tools', 'Amazon-CloudWatch'),
  kinesis: arch('Analytics', 'Amazon-Kinesis-Data-Streams'),
  rekognition: arch('Artificial-Intelligence', 'Amazon-Rekognition'),
  polly: arch('Artificial-Intelligence', 'Amazon-Polly'),
  translate: arch('Artificial-Intelligence', 'Amazon-Translate'),
  bedrock: arch('Artificial-Intelligence', 'Amazon-Bedrock'),
  'aws-cloud': 'Architecture-Group-Icons_07312026/AWS-Cloud-logo_32.svg',
  'cat-networking': cat('Networking-Content-Delivery'),
  'cat-compute': cat('Compute'),
  'cat-storage': cat('Storage'),
  'cat-databases': cat('Databases'),
  'cat-integration': cat('Application-Integration'),
  'cat-security': cat('Security-Identity'),
  'cat-management': cat('Management-Tools'),
  'cat-analytics': cat('Analytics'),
  'cat-ai': cat('Artificial-Intelligence'),
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

let missing = 0;
for (const [id, rel] of Object.entries(ICONS)) {
  const src = join(pkg, rel);
  if (!existsSync(src)) {
    console.error(`missing: ${id} -> ${rel}`);
    missing++;
    continue;
  }
  copyFileSync(src, join(out, `${id}.svg`));
}
console.log(`copied ${Object.keys(ICONS).length - missing} icons to public/icons`);
process.exit(missing ? 1 : 0);
