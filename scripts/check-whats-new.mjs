// CI guard for the title screen's "What's new" bell. A pull request that changes what students see (anything under
// src/ except tests, plus index.html and public/) must add an entry to src/data/updates.ts, or tick the PR template's
// "no entry is needed" box. Run by .github/workflows/whats-new.yml.
// Usage: BASE_SHA=<sha> HEAD_SHA=<sha> PR_BODY="..." node scripts/check-whats-new.mjs
import { execFileSync } from 'node:child_process';

const { BASE_SHA, HEAD_SHA = 'HEAD', PR_BODY = '' } = process.env;
if (!BASE_SHA) {
  console.error('BASE_SHA is not set.');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const range = `${BASE_SHA}...${HEAD_SHA}`;

/** True for files whose change a student could see in the app. */
function isStudentFacing(path) {
  if (path === 'src/data/updates.ts') return false;
  if (/\.test\.tsx?$/.test(path)) return false;
  return path.startsWith('src/') || path.startsWith('public/') || path === 'index.html';
}

const changed = git('diff', '--name-only', range).split('\n').filter(Boolean);
const facing = changed.filter(isStudentFacing);
const addsEntry = /^\+\s+id: '/m.test(git('diff', range, '--', 'src/data/updates.ts'));
const optedOut = /^\s*[-*]\s*\[[xX]\][^\n]*no entry is needed/im.test(PR_BODY);

if (facing.length === 0) {
  console.log('No student-facing files changed, so no "What\'s new" entry is needed.');
} else if (addsEntry) {
  console.log('Adds a "What\'s new" entry. Thanks!');
} else if (optedOut) {
  console.log('The PR says no entry is needed, so skipping.');
} else {
  console.log(`::error title=Missing "What's new" entry::This PR changes ${facing.length} student-facing file(s) but adds no entry to src/data/updates.ts.`);
  console.log('Either add an entry (written for students, dated the day it merges), or tick "no entry is needed" in the PR description.');
  console.log('Student-facing files changed:');
  for (const f of facing) console.log(`  ${f}`);
  process.exit(1);
}
