// The English words for the title screen and the menus every screen shares. Every other language file must give each
// of these keys (TypeScript checks it), and must keep the same {placeholders}.
//
// AWS service names (Amazon S3, AWS Lambda, Route 53…) stay in English in every language: they are what students will
// see in the real AWS console, so never translate them.

export const en = {
  // Language menu
  'lang.label': 'Language',
  'lang.menu': 'Language: {name}',

  // Title screen
  'home.subtitle': 'Cloud Builders',
  'home.tagline': 'Connect real AWS services, watch requests flow, and help a little town go online.',
  'home.modes': 'Choose a mode',
  'home.story': 'Story Mode',
  'home.story.ch1': 'Help Baker Rosa bring the best bakery in Maple Hollow onto the internet.',
  'home.story.ch2': 'Crumb & Co. is online. Now the whole town needs help, with problems like the ones your team might pick.',
  'home.levelsDone': '{done} of {total} levels done',
  'home.advanced': 'Advanced Track',
  'home.collegeTag': 'College & up',
  'home.advanced.blurb': 'On call at Crumb & Co.: real incidents, monthly budgets, and security reviews.',
  'home.ticketsDone': '{done} of {total} tickets done',
  'home.playground': 'Playground',
  'home.playground.blurb': 'Build anything with {count} pieces. Only connections that make sense will snap together!',
  'home.styleGuide': 'Style guide',
  'home.credit': 'AWS service icons © Amazon Web Services, used for teaching. Not affiliated with or endorsed by AWS.',

  // Grade bands
  'band.explorer': 'Explorer',
  'band.builder': 'Builder',
  'band.architect': 'Architect',
  'band.explorer.grades': 'Grades K–5',
  'band.builder.grades': 'Grades 6–8',
  'band.architect.grades': 'Grades 9–12',
  'band.explorer.tagline': 'Simple words, pictures, and lots of hints',
  'band.builder.tagline': 'Everyday words and real numbers',
  'band.architect.tagline': 'Technical details and how it works',
  'band.sample.explorer': 'A giant toy box for files',
  'band.sample.builder': 'Stores files like photos and pages',
  'band.sample.architect': 'Object storage with 11 nines of durability',

  // First-run picker
  'picker.title': 'Who’s building today?',
  'picker.hint': 'You can change this any time from the top corner.',
  'picker.college': 'College',
  'picker.collegeGrades': 'College & up',
  'picker.collegeTagline': 'Opens the Advanced Track: real incidents and budgets',

  // Theme menu
  'theme.label': 'Theme',
  'theme.current': 'Theme: {name}',
  'theme.system': 'Match my device',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // Top bar and phone menus
  'chrome.phoneLayout': 'Phone layout',
  'chrome.laptopLayout': 'Use the laptop layout',
  'chrome.more': 'More',
  'chrome.close': 'Close {name}',
  'chrome.turnTip': 'Turn your phone sideways for a bigger map.',
  'chrome.gotIt': 'Got it',
};

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
