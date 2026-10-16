import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadUnit } from '../tools/load-data.js';
import { validate } from '../tools/validate.js';

const unit = JSON.parse(await readFile(new URL('../data/unit-5/unit.json', import.meta.url), 'utf8'));

test("Unit 5's unit.json matches the spec", () => {
  assert.equal(unit.id, 'unit-5');
  assert.equal(unit.number, 5);
  assert.equal(unit.title, 'Revolutions');
  assert.equal(unit.period, 'c. 1750–1900');
  assert.deepEqual(unit.years, [1740, 1910]);
  assert.deepEqual(unit.minimums, { documents: 60, dbqs: 10, saqs: 18, mcqs: 13 });
  assert.equal(unit.exampleCode, 'dbq.enlightenment-revolutions.k2x9q1');
  const expected = [
    ['5.1', 'Enlightenment'],
    ['5.2', 'Nationalism and revolutions'],
    ['5.3', 'Industrial Revolution begins'],
    ['5.4', 'Industrialization spreads'],
    ['5.5', 'Technology'],
    ['5.6', "Government's role"],
    ['5.7', 'Economic developments'],
    ['5.8', 'Reactions to industrialization'],
    ['5.9', 'Society'],
    ['5.10', 'Continuity and change'],
  ];
  assert.deepEqual(Object.entries(unit.topics), expected, 'labels and chip order');
});

const SPEC_DBQS = {
  'enlightenment-revolutions': { topics: ['5.1', '5.2'], groups: ['ideas', 'grievances', 'limits'] },
  'latin-american-independence': { topics: ['5.2'], groups: ['ideas', 'creole-interests', 'fear-from-below'] },
  'industrial-revolution-causes': { topics: ['5.3'], groups: ['resources', 'capital-markets', 'labor-technology'] },
  'state-led-industrialization': { topics: ['5.4', '5.6'], groups: ['defense', 'economic-growth', 'limits'] },
  'reactions-industrial-economy': { topics: ['5.8'], groups: ['labor', 'socialism', 'reform-from-above'] },
  'industrial-society': { topics: ['5.9'], groups: ['class', 'gender-family', 'cities'] },
  'technology-global-economy': { topics: ['5.5'], groups: ['speed-and-scale', 'global-integration', 'unequal-effects'] },
  'economic-ideas-institutions': { topics: ['5.7'], groups: ['free-market-ideas', 'companies-and-banks', 'critics'] },
  'nationalism-identity': { topics: ['5.2'], groups: ['unification', 'independence', 'limits'] },
  'labor-continuity-change': { topics: ['5.10'], groups: ['wage-labor', 'persisting-coercion', 'abolition-and-reform'] },
};
const readJson = async (name) => JSON.parse(await readFile(new URL(`../data/unit-5/${name}`, import.meta.url), 'utf8'));

test('Unit 5 has the ten spec DBQ prompts with the spec topics and groups, unless a ruling says otherwise', async () => {
  const dbqs = await readJson('dbqs.json');
  const rulings = await readJson('research/rulings.json');
  assert.deepEqual(dbqs.map((q) => q.id).sort(), Object.keys(SPEC_DBQS).sort());
  for (const q of dbqs) {
    assert.deepEqual(q.topics, SPEC_DBQS[q.id].topics, `${q.id} topics`);
    if (!rulings.some((r) => r.prompt === q.id)) assert.deepEqual(q.groups.map((g) => g.key), SPEC_DBQS[q.id].groups, `${q.id} groups`);
  }
});

test("Unit 5 meets Unit 4's minimums and covers every topic with at least two drills", async () => {
  const data = await loadUnit({ id: 'unit-5', dir: fileURLToPath(new URL('../data/unit-5', import.meta.url)) });
  assert.deepEqual(validate(data, { release: true }), []);
  for (const topic of Object.keys(unit.topics)) {
    const drills = [...data.saqs, ...data.mcqs].filter((d) => d.topics.includes(topic));
    assert.ok(drills.length >= 2, `${topic} is in ${drills.length} drills`);
  }
  for (const topic of ['5.5', '5.7', '5.10']) {
    assert.ok(data.saqs.some((s) => s.topics.includes(topic)), `an SAQ for ${topic}`);
    assert.ok(data.mcqs.some((m) => m.topics.includes(topic)), `an MCQ set for ${topic}`);
  }
});
