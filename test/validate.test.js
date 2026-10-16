import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, wordCount } from '../tools/validate.js';
import { makeData, makeUnit } from './helpers/fixture.js';

function errorsAfter(mutate, options) {
  const data = makeData();
  mutate(data);
  return validate(data, options);
}

test('the fixture bank is valid', () => {
  assert.deepEqual(validate(makeData()), []);
});

test('each broken rule is reported', () => {
  const cases = [
    ['duplicate document id', (d) => { d.documents[1].id = 'doc-1'; }, /document doc-1: duplicate id/],
    ['bad id', (d) => { d.documents[0].id = 'Doc One'; }, /id must be lowercase/],
    ['unverified', (d) => { d.documents[0].verified = false; }, /not verified/],
    ['short text', (d) => { d.documents[0].text = 'too short'; }, /text has 2 words; it must have 60–200/],
    ['adapted without original', (d) => { d.documents[0].adapted = true; d.documents[0].sourceLine += ' (adapted)'; }, /verbatim original/],
    ['adapted without label', (d) => { d.documents[0].adapted = true; d.documents[0].original = 'x'; }, /end the sourceLine with "\(adapted\)"/],
    ['bad topic', (d) => { d.documents[0].topics = ['3.1']; }, /unknown topics 3\.1 for unit-4/],
    ['bad url', (d) => { d.documents[0].sourceUrl = 'ftp://x'; }, /http\(s\) link/],
    ['bad year', (d) => { d.documents[0].year = 1900; }, /year must be a whole number from 1400 to 1760/],
    ['ragged table', (d) => { Object.assign(d.documents[0], { kind: 'table', text: undefined, table: { caption: 'c', columns: ['a', 'b'], rows: [['1']] } }); }, /one cell per column/],
    ['pool too small', (d) => { d.dbqs[0].pool = d.dbqs[0].pool.slice(0, 8); }, /pool has 8 documents; it must have 9–12/],
    ['unknown pool doc', (d) => { d.dbqs[0].pool[0].doc = 'nope'; }, /pool refers to unknown document nope/],
    ['unknown group', (d) => { d.dbqs[0].pool[0].group = 'g9'; }, /unknown group g9/],
    ['missing sourcing', (d) => { d.dbqs[0].pool[0].sourcing = ' '; }, /needs a sourcing note/],
    ['one group', (d) => { d.dbqs[0].groups = d.dbqs[0].groups.slice(0, 1); d.dbqs[0].pool.forEach((e) => { e.group = 'g1'; }); }, /needs 2–3 groups/],
    ['group with one author', (d) => { d.documents.slice(5).forEach((doc) => { doc.authorKey = 'same'; }); }, /group g2 needs documents by at least 2 different authors/],
    ['too few authors', (d) => { d.documents.forEach((doc, i) => { doc.authorKey = `a${i % 6}`; }); }, /pool has 6 different authors; it needs at least 7/],
    ['empty notes', (d) => { d.dbqs[0].notes.thesis = []; }, /notes\.thesis needs at least one entry/],
    ['saq parts', (d) => { d.saqs[0].parts.pop(); }, /parts must be a, b and c/],
    ['saq accept', (d) => { d.saqs[0].parts[0].accept = []; }, /part a needs at least one accepted answer/],
    ['saq docs', (d) => { d.saqs[0].docs = ['doc-1', 'doc-2', 'doc-3']; }, /0–2 document ids/],
    ['mcq options', (d) => { d.mcqs[0].questions[0].options.pop(); }, /question 1 needs exactly 4 options/],
    ['mcq answer', (d) => { d.mcqs[0].questions[0].answer = 4; }, /question 1 answer must be 0–3/],
    ['mcq count', (d) => { d.mcqs[0].questions = d.mcqs[0].questions.slice(0, 2); }, /has 2 questions; it must have 3–4/],
    ['mcq unknown doc', (d) => { d.mcqs[0].doc = 'nope'; }, /mcq test-mcq: unknown document nope/],
    ['note without ref', (d) => { d.dbqs[0].notes.outsideEvidence = ['bare string']; }, /notes\.outsideEvidence 1 needs text and a ref/],
    ['context without text', (d) => { d.dbqs[0].notes.contextualization[0].text = ''; }, /notes\.contextualization 1 needs text and a ref/],
    ['ref to another site', (d) => { d.dbqs[0].notes.contextualization[0].ref.url = 'https://example.com/x'; }, /notes\.contextualization 1: ref must link to britannica\.com or en\.wikipedia\.org\/wiki/],
    ['ref without title', (d) => { d.dbqs[0].notes.outsideEvidence[0].ref.title = ' '; }, /notes\.outsideEvidence 1 needs text and a ref/],
    ['saq without refs', (d) => { d.saqs[0].refs = []; }, /saq test-saq: refs needs 1–3 references/],
    ['saq bad ref', (d) => { d.saqs[0].refs = [{ title: 'X', url: 'http://www.britannica.com/x' }]; }, /saq test-saq: ref 1: ref must link to britannica\.com/],
    ['mcq without ref', (d) => { delete d.mcqs[0].questions[1].ref; }, /question 2 needs a ref with a title and url/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const errors = errorsAfter(mutate);
    assert.ok(errors.some((e) => pattern.test(e)), `${name}: got ${JSON.stringify(errors)}`);
  }
});

test('non-array data files are reported, not crashed on', () => {
  assert.deepEqual(validate({ unit: makeUnit(), documents: {}, dbqs: [], saqs: [], mcqs: [] }), ['documents: must be a JSON array']);
});

test('release mode enforces minimum counts and topic coverage', () => {
  const errors = validate(makeData(), { release: true });
  assert.ok(errors.some((e) => /documents has 10; release needs at least 60/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /no drill covers topic 4\.1/.test(e)));
});

test('release mode flags a lopsided answer key', () => {
  const errors = errorsAfter((d) => {
    d.mcqs = Array.from({ length: 7 }, (_, i) => ({
      ...structuredClone(d.mcqs[0]),
      id: `m${i}`,
      questions: d.mcqs[0].questions.map((q) => ({ ...q, answer: 0 })),
    }));
  }, { release: true });
  assert.ok(errors.some((e) => /A is the answer to 100% of multiple-choice questions/.test(e)), JSON.stringify(errors));
});

test('wordCount ignores ellipses', () => {
  assert.equal(wordCount('one … two three'), 3);
});

test('a topic from another unit is rejected and the error names the unit', () => {
  const data = makeData(5);
  data.documents[0].topics = ['4.3'];
  assert.ok(validate(data).some((e) => /document doc-1: unknown topics 4\.3 for unit-5/.test(e)));
  const none = makeData(5);
  none.saqs[0].topics = [];
  assert.ok(validate(none).some((e) => /saq test-saq: topics must list at least one of 5\.1–5\.10/.test(e)));
  assert.deepEqual(validate(makeData(4)), []);
});

test("a document year outside the unit's range is rejected", () => {
  const data = makeData(5);
  data.documents[0].year = 1739;
  data.documents[1].year = 1911;
  data.documents[2].year = 1740;
  data.documents[3].year = 1910;
  const errors = validate(data);
  assert.ok(errors.some((e) => /document doc-1: year must be a whole number from 1740 to 1910/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /document doc-2: year must be a whole number from 1740 to 1910/.test(e)));
  assert.ok(!errors.some((e) => /document doc-3|document doc-4/.test(e)), 'the range is inclusive');
});

test("release mode enforces the unit's own minimums and topic list", () => {
  const data = makeData(5);
  const errors = validate(data, { release: true });
  assert.ok(errors.some((e) => /documents has 10; release needs at least 60/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /dbqs has 1; release needs at least 6/.test(e)));
  assert.ok(errors.some((e) => /saqs has 1; release needs at least 12/.test(e)));
  assert.ok(errors.some((e) => /mcqs has 1; release needs at least 9/.test(e)));
  assert.ok(errors.some((e) => /no drill covers topic 5\.10/.test(e)));
  assert.ok(!errors.some((e) => /\b4\.\d/.test(e)), 'unit 4 topics are never mentioned for unit 5');
  data.unit.minimums = { documents: 10, dbqs: 1, saqs: 1, mcqs: 1 };
  assert.ok(!validate(data, { release: true }).some((e) => /release needs at least/.test(e)));
});

test('a malformed unit.json is reported field by field', () => {
  const data = makeData(5);
  data.unit = {
    id: 'five', number: 5, title: '', period: 'c. 1750–1900', years: [1910, 1740],
    topics: { '4.1': 'Wrong unit', '5.2': ' ' }, minimums: { documents: 60, dbqs: 0 },
    shareBase: 'ftp://x', exampleCode: 'nonsense',
  };
  const errors = validate(data);
  const expected = [
    /unit\.json: id: must look like "unit-5"/,
    /unit\.json: title: is required/,
    /unit\.json: years: must be two whole numbers, earliest first/,
    /unit\.json: topics: "4\.1" must start with "5\."/,
    /unit\.json: topics: "5\.2" needs a label/,
    /unit\.json: minimums\.dbqs: must be a positive whole number/,
    /unit\.json: minimums\.saqs: must be a positive whole number/,
    /unit\.json: minimums\.mcqs: must be a positive whole number/,
    /unit\.json: shareBase: must be null or an https link/,
    /unit\.json: exampleCode: must look like dbq\.some-prompt\.k2x9q1/,
  ];
  for (const pattern of expected) assert.ok(errors.some((e) => pattern.test(e)), `${pattern}: ${JSON.stringify(errors)}`);
  assert.ok(errors.every((e) => e.startsWith('unit.json: ')), 'nothing else is checked until unit.json is sound');
});

test('a missing unit.json is one clear error', () => {
  assert.deepEqual(validate({ documents: [], dbqs: [], saqs: [], mcqs: [] }), ['unit.json: missing or not a JSON object']);
  assert.deepEqual(validate({ unit: [], documents: [], dbqs: [], saqs: [], mcqs: [] }), ['unit.json: missing or not a JSON object']);
});

test('a null shareBase and an https shareBase are both accepted', () => {
  const data = makeData();
  assert.deepEqual(validate(data), []);
  data.unit.shareBase = 'https://claude.ai/artifact/abc';
  assert.deepEqual(validate(data), []);
});
