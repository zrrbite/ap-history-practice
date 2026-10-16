import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const unit = JSON.parse(await readFile(new URL('../data/unit-5/unit.json', import.meta.url), 'utf8'));

test("Unit 5's unit.json matches the spec", () => {
  assert.equal(unit.id, 'unit-5');
  assert.equal(unit.number, 5);
  assert.equal(unit.title, 'Revolutions');
  assert.equal(unit.period, 'c. 1750–1900');
  assert.deepEqual(unit.years, [1740, 1910]);
  assert.deepEqual(unit.minimums, { documents: 60, dbqs: 6, saqs: 12, mcqs: 9 });
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
