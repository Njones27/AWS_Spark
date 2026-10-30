import type { BandText, SourceSpec } from './types';
import type { Chapter, Level, LevelNode } from './levels';

// Chapter 2: after the bakery, the whole town asks for help. Each level is a kind of community problem that
// K–12 teams pick for the UK-AWS Minds on Innovation challenge, and teaches a pattern they can reuse in the Playground.

const town = (id: string, label: string, y: number, source: SourceSpec): LevelNode => ({
  id,
  service: 'users',
  pos: { x: 30, y },
  label,
  locked: true,
  source,
});

const ENDING: BandText = {
  explorer: 'Maple Hollow is the most helpful town online! You used the cloud to share news, sign people up, send alerts, answer questions, speak every language, and find lost things.',
  builder:
    'You helped the whole town: a fast library site, park sign-ups, late-bus alerts, an AI helper, notes in every language, and a smart lost-and-found. Your own STLP project can use these same patterns!',
  architect:
    'You built six reusable patterns: a CDN-fronted static site, a serverless sign-up API, event-driven notifications, a generative-AI endpoint, translation and speech fan-out, and an S3-triggered image pipeline.',
};

export const CHAPTER_2_LEVELS: Level[] = [
  {
    id: 'm1',
    number: 1,
    title: 'Library Events Online',
    concept: 'Share information',
    teaches: ['cloudfront', 's3'],
    intro: [
      { who: 'rosa', text: 'The library asked me for help. Their summer events are only on a paper flyer taped to the front door!' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'Let’s put the event list in S3, and let CloudFront keep copies close to everyone so it loads fast.',
          builder: 'Keep the event pages in S3, and put CloudFront in front so the whole town gets them fast.',
          architect: 'Host the static event site in S3 behind a CloudFront distribution, so most requests are served from the edge.',
        },
      },
    ],
    goal: {
      explorer: 'Get the event list to all the Library Visitors.',
      builder: 'Serve the event list to 300 Library Visitors through CloudFront and S3.',
      architect: 'Serve 300 req/tick of static content through CloudFront with an S3 origin.',
    },
    nodes: [town('visitors', 'Library Visitors', 220, { demand: 300, needs: ['cloudfront', 's3'] })],
    edges: [],
    palette: [
      { service: 'cloudfront', count: 1 },
      { service: 's3', count: 1 },
    ],
    hints: ['Library Visitors → CloudFront first.', 'Then CloudFront → S3, where the event pages are kept.'],
    lesson: {
      title: 'Share information fast',
      text: {
        explorer: 'S3 keeps the pages, and CloudFront hands out copies so nobody waits.',
        builder: 'Any “share information” project, like club news or a town guide, can use this same pair: S3 for the pages and CloudFront to send them fast.',
        architect: 'CloudFront absorbs most of the read traffic at the edge, so the S3 origin only sees cache misses.',
      },
    },
    solution: {
      add: [
        { id: 'cf', service: 'cloudfront' },
        { id: 's3', service: 's3' },
      ],
      connect: [['visitors', 'cf'], ['cf', 's3']],
    },
  },
  {
    id: 'm2',
    number: 2,
    title: 'Park Cleanup Sign-ups',
    concept: 'Collect sign-ups',
    teaches: ['apigw', 'lambda', 'dynamodb'],
    intro: [
      { who: 'rosa', text: 'The park cleanup needs volunteers, but the sign-up sheet in the front office keeps getting lost.' },
      {
        who: 'sparky',
        mood: 'think',
        text: {
          explorer: 'API Gateway takes each sign-up, Lambda checks it, and DynamoDB writes it down. Can you build it on your own this time?',
          builder: 'This is just like taking bread orders, but for volunteers. Can you build it from memory?',
          architect: 'Same serverless API as the bakery orders, no pieces placed for you this time.',
        },
      },
    ],
    goal: {
      explorer: 'Save every volunteer in DynamoDB.',
      builder: 'Save all 80 Volunteers’ sign-ups in DynamoDB.',
      architect: 'Persist 80 sign-ups/tick through API Gateway and Lambda into DynamoDB.',
    },
    nodes: [town('volunteers', 'Volunteers', 220, { demand: 80, needs: ['apigw', 'lambda', 'dynamodb'] })],
    edges: [],
    palette: [
      { service: 'apigw', count: 1 },
      { service: 'lambda', count: 1 },
      { service: 'dynamodb', count: 1 },
    ],
    hints: ['Volunteers send their sign-ups to API Gateway.', 'Volunteers → API Gateway → Lambda → DynamoDB.'],
    lesson: {
      title: 'Collect sign-ups',
      text: {
        explorer: 'Now the sign-up list can’t get lost. It lives in the cloud!',
        builder: 'Any project that collects things, like sign-ups, reports, or lost-pet posts, can use API Gateway, Lambda, and DynamoDB.',
        architect: 'A reusable serverless write path. Add Cognito later if volunteers need to sign in.',
      },
    },
    solution: {
      add: [
        { id: 'a', service: 'apigw' },
        { id: 'l', service: 'lambda' },
        { id: 'd', service: 'dynamodb' },
      ],
      connect: [['volunteers', 'a'], ['a', 'l'], ['l', 'd']],
    },
  },
  {
    id: 'm3',
    number: 3,
    title: 'The Bus Is Running Late',
    concept: 'Send alerts',
    teaches: ['sns'],
    intro: [
      { who: 'rosa', text: 'When the school bus runs late, families wait outside in the cold and nobody knows why.' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'The school office can press one button, and SNS texts every family at once!',
          builder: 'The office sends one alert through API Gateway and Lambda, and SNS texts every family who signed up.',
          architect: 'Publish one event to an SNS topic and fan it out to every subscribed phone over SMS.',
        },
      },
    ],
    goal: {
      explorer: 'Get the late-bus alert to the Family Phones.',
      builder: 'Send the School Office’s late-bus alert to the Family Phones.',
      architect: 'Deliver the office’s alerts to the Family Phones through an SNS topic.',
    },
    nodes: [
      town('office', 'School Office', 120, { demand: 10, needs: ['family'] }),
      { id: 'family', service: 'phone', pos: { x: 40, y: 380 }, label: 'Family Phones', locked: true },
    ],
    edges: [],
    palette: [
      { service: 'apigw', count: 1 },
      { service: 'lambda', count: 1 },
      { service: 'sns', count: 1 },
    ],
    hints: ['The office starts with API Gateway, then Lambda.', 'School Office → API Gateway → Lambda → SNS → Family Phones.'],
    lesson: {
      title: 'Send alerts',
      text: {
        explorer: 'One button, and every family knows!',
        builder: 'Any “let people know” project, like weather closings or food pickups, can end with SNS sending texts.',
        architect: 'SNS decouples the sender from the subscribers, so families can join or leave without changing the office’s code.',
      },
    },
    solution: {
      add: [
        { id: 'a', service: 'apigw' },
        { id: 'l', service: 'lambda' },
        { id: 's', service: 'sns' },
      ],
      connect: [['office', 'a'], ['a', 'l'], ['l', 's'], ['s', 'family']],
    },
  },
  {
    id: 'm4',
    number: 4,
    title: 'Ask the School Helper',
    concept: 'AI that answers',
    teaches: ['bedrock'],
    intro: [
      { who: 'rosa', text: 'New students keep asking the same questions: Where is the art room? When does chess club meet?' },
      {
        who: 'sparky',
        mood: 'cheer',
        text: {
          explorer: 'Amazon Bedrock has AI models that can answer questions. Let Lambda ask it!',
          builder: 'Amazon Bedrock gives your app a ready-made AI model. Lambda can send it each question and pass back the answer.',
          architect: 'Invoke a foundation model in Amazon Bedrock from Lambda, so the app can answer questions without training its own model.',
        },
      },
    ],
    goal: {
      explorer: 'Get every question answered by the AI in Bedrock.',
      builder: 'Answer all 60 New Students’ questions with an AI model in Bedrock.',
      architect: 'Serve 60 req/tick of questions through Lambda to a Bedrock model.',
    },
    nodes: [
      town('students', 'New Students', 220, { demand: 60, needs: ['bedrock'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 220 }, locked: true },
      { id: 'lambda', service: 'lambda', pos: { x: 640, y: 220 }, locked: true },
    ],
    edges: [
      ['students', 'apigw'],
      ['apigw', 'lambda'],
    ],
    palette: [
      { service: 'bedrock', count: 1 },
      { service: 'dynamodb', count: 1 },
    ],
    hints: ['DynamoDB can save things, but it can’t think up an answer.', 'Lambda → Bedrock.'],
    lesson: {
      title: 'AI that answers questions',
      text: {
        explorer: 'Bedrock’s AI reads the question and writes an answer.',
        builder: 'Bedrock lets you use AI without building it yourself. Remember to check that the answers are right for your school!',
        architect: 'For answers grounded in your own facts, add retrieval (Knowledge Bases for Amazon Bedrock) so the model cites school documents.',
      },
    },
    solution: {
      add: [{ id: 'b', service: 'bedrock' }],
      connect: [['lambda', 'b']],
    },
  },
  {
    id: 'm5',
    number: 5,
    title: 'Notes Home in Every Language',
    concept: 'Reach more families',
    teaches: ['translate', 'polly'],
    intro: [
      { who: 'rosa', text: 'Notes from school only come home in English, but lots of families in Maple Hollow speak other languages.' },
      {
        who: 'sparky',
        mood: 'happy',
        text: {
          explorer: 'Amazon Translate changes the words into other languages, and Amazon Polly reads them out loud!',
          builder: 'Lambda can ask Amazon Translate for each language and ask Amazon Polly to read the note out loud.',
          architect: 'Have Lambda call Amazon Translate for each target language and Amazon Polly for speech synthesis.',
        },
      },
    ],
    goal: {
      explorer: 'Get every note translated AND read out loud.',
      builder: 'For all 60 Families, translate each note with Translate AND turn it into speech with Polly.',
      architect: 'Send every request through both Translate and Polly.',
    },
    nodes: [
      town('families', 'Families', 220, { demand: 60, needs: ['translate', 'polly'] }),
      { id: 'apigw', service: 'apigw', pos: { x: 380, y: 220 }, locked: true },
      { id: 'lambda', service: 'lambda', pos: { x: 640, y: 220 }, locked: true },
    ],
    edges: [
      ['families', 'apigw'],
      ['apigw', 'lambda'],
    ],
    palette: [
      { service: 'translate', count: 1 },
      { service: 'polly', count: 1 },
    ],
    hints: ['Lambda can ask two services at once.', 'Lambda → Translate, and Lambda → Polly.'],
    lesson: {
      title: 'Reach more families',
      text: {
        explorer: 'Now every family can read the note or listen to it.',
        builder: 'Lambda sends the same note to both services. Projects for signs, announcements, or menus can use this too.',
        architect: 'Lambda fans the request out to two AI services. Cache translations of repeated notes to save cost.',
      },
    },
    solution: {
      add: [
        { id: 't', service: 'translate' },
        { id: 'p', service: 'polly' },
      ],
      connect: [['lambda', 't'], ['lambda', 'p']],
    },
  },
  {
    id: 'm6',
    number: 6,
    title: 'The Lost-and-Found Bin',
    concept: 'Understand photos',
    teaches: ['rekognition'],
    intro: [
      { who: 'rosa', text: 'The school lost-and-found bin is full, and nobody has time to sort it.' },
      {
        who: 'sparky',
        mood: 'think',
        text: {
          explorer: 'Students take a photo of each item. Amazon Rekognition can tell what’s in the photo, and DynamoDB keeps the list!',
          builder: 'When a photo lands in S3, it can wake up Lambda. Lambda asks Rekognition what’s in it and saves the answer in DynamoDB.',
          architect: 'Use an S3 event to trigger Lambda, label each image with Rekognition DetectLabels, and index the results in DynamoDB.',
        },
      },
    ],
    goal: {
      explorer: 'Find out what’s in every photo AND save it in DynamoDB.',
      builder: 'For all 40 Students’ photos, ask Rekognition what’s in it AND save the answer in DynamoDB.',
      architect: 'Process every uploaded image with Rekognition and persist the labels to DynamoDB.',
    },
    nodes: [
      town('students', 'Students', 220, { demand: 40, needs: ['rekognition', 'dynamodb'] }),
      { id: 'photos', service: 's3', pos: { x: 380, y: 220 }, label: 'Photos', locked: true },
    ],
    edges: [['students', 'photos']],
    palette: [
      { service: 'lambda', count: 1 },
      { service: 'rekognition', count: 1 },
      { service: 'dynamodb', count: 1 },
    ],
    hints: ['A new photo in S3 can wake up Lambda.', 'Photos → Lambda, then Lambda → Rekognition and Lambda → DynamoDB.'],
    lesson: {
      title: 'Understand photos',
      text: {
        explorer: 'Rekognition looked at every photo, so now everyone can search the list for their lost things.',
        builder: 'Projects that sort pictures, like spotting litter or counting birds, can use S3, Lambda, and Rekognition.',
        architect: 'An event-driven pipeline: uploads trigger processing, with no servers running in between.',
      },
    },
    solution: {
      add: [
        { id: 'l', service: 'lambda' },
        { id: 'r', service: 'rekognition' },
        { id: 'd', service: 'dynamodb' },
      ],
      connect: [['photos', 'l'], ['l', 'r'], ['l', 'd']],
    },
  },
];

export const CHAPTER_2: Chapter = {
  id: 'ch2',
  eyebrow: 'Chapter 2',
  title: 'Maple Hollow Helps',
  blurb: 'Crumb & Co. is online. Now the whole town needs help, with problems like the ones your team might pick.',
  ending: ENDING,
  unit: 'Level',
  cast: { sparky: 'Sparky', rosa: 'Baker Rosa', pager: 'Alert' },
  levels: CHAPTER_2_LEVELS,
};
