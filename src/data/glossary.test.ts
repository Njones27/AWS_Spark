import { describe, expect, it } from 'vitest';
import { ADVANCED } from './advanced';
import { findTerms } from './glossary';

const terms = (text: string) => findTerms(text).flatMap((p) => (typeof p === 'string' ? [] : [`${p.text}=${p.term.id}`]));

describe('tap-to-define terms', () => {
  it('marks the words the College tester asked about', () => {
    expect(terms('anyone with the URL can call the API')).toEqual(['URL=url', 'API=api']);
  });

  it('prefers the longest name, so a service name is one term', () => {
    expect(terms('Put API Gateway in front of the API')).toEqual(['API Gateway=apigw', 'API=api']);
    expect(terms('Shield Advanced costs $3,000')).toEqual(['Shield Advanced=shield']);
  });

  it('marks only the first time a term appears in a line', () => {
    expect(terms('The queue grows. Each queue drains.')).toEqual(['queue=queue']);
  });

  it('matches plurals and sentence starts, but not parts of other words', () => {
    expect(terms('Containers and tables')).toEqual(['Containers=container', 'tables=table']);
    expect(terms('rapid comfortable stables')).toEqual([]);
  });

  it('leaves everyday words alone', () => {
    expect(terms('Their summer events are on a paper flyer')).toEqual([]);
  });

  it('defines "key" for both encryption and S3 file names', () => {
    const key = findTerms('Objects are addressed by bucket and key').find((p) => typeof p !== 'string');
    expect(typeof key !== 'string' && key?.term.def).toMatch(/S3/);
  });

  it('keeps the text intact', () => {
    const line = 'IAM → Checkout, KMS → Orders table, API Gateway → Cognito.';
    expect(
      findTerms(line)
        .map((p) => (typeof p === 'string' ? p : p.text))
        .join(''),
    ).toBe(line);
  });

  it('finds terms in the first Advanced ticket', () => {
    const first = ADVANCED.levels[0];
    const intro = first.intro.map((b) => (typeof b.text === 'string' ? b.text : b.text.builder)).join(' ');
    const found = terms(intro).map((t) => t.split('=')[1]);
    expect(found).toEqual(expect.arrayContaining(['url', 'api', 'role', 'function', 'table', 'key']));
  });
});
