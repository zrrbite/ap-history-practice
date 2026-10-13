import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DBQ_SIZE, mulberry32, shuffle, drawDbq, pickRandom, pushRecent, matchesFilter, topicsWithItems,
} from '../src/sampler.js';
import { makeData, makeDoc } from './helpers/fixture.js';

const byId = (docs) => new Map(docs.map((d) => [d.id, d]));

function assertBalanced(prompt, docs, entries) {
  assert.equal(entries.length, DBQ_SIZE);
  assert.equal(new Set(entries.map((e) => e.doc)).size, DBQ_SIZE, 'documents are distinct');
  const authors = entries.map((e) => docs.get(e.doc).authorKey);
  assert.equal(new Set(authors).size, DBQ_SIZE, 'no author appears twice');
  for (const g of prompt.groups) {
    assert.ok(entries.filter((e) => e.group === g.key).length >= 2, `group ${g.key} has at least 2`);
  }
  const ordered = entries.map((e) => docs.get(e.doc));
  for (let i = 1; i < ordered.length; i++) {
    const [a, b] = [ordered[i - 1], ordered[i]];
    assert.ok(a.year < b.year || (a.year === b.year && a.id < b.id), 'sorted by year, then id');
  }
}

test('mulberry32 repeats for the same seed and stays in [0, 1)', () => {
  const xs = Array.from({ length: 100 }, mulberry32(42));
  assert.deepEqual(xs, Array.from({ length: 100 }, mulberry32(42)));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 100 }, mulberry32(43)));
});

test('shuffle returns a permutation and leaves its input alone', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, mulberry32(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(out, shuffle(input, mulberry32(1)));
});

test('drawDbq gives the same set for the same seed', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  assert.deepEqual(drawDbq(dbqs[0], docs, 1234), drawDbq(dbqs[0], docs, 1234));
});

test('drawDbq is balanced for 1,000 seeds', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, seed));
});

test('drawDbq draws the same documents however the pool is ordered', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  const prompt = dbqs[0];
  const reversed = { ...prompt, pool: prompt.pool.slice().reverse() };
  for (const seed of [1, 2, 3, 42, 99999]) {
    assert.deepEqual(drawDbq(reversed, docs, seed), drawDbq(prompt, docs, seed), `seed ${seed}`);
  }
});

test('drawDbq varies between seeds', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  const sets = new Set();
  for (let seed = 0; seed < 50; seed++) sets.add(drawDbq(dbqs[0], docs, seed).map((e) => e.doc).join());
  assert.ok(sets.size > 10, `only ${sets.size} distinct sets in 50 seeds`);
});

test('drawDbq takes 2 from each of three groups', () => {
  const { documents, dbqs } = makeData();
  const prompt = {
    ...dbqs[0],
    groups: [{ key: 'g1', label: '1' }, { key: 'g2', label: '2' }, { key: 'g3', label: '3' }],
    pool: documents.map((d, i) => ({ doc: d.id, group: `g${(i % 3) + 1}`, sourcing: 's' })),
  };
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(prompt, docs, drawDbq(prompt, docs, seed));
});

test('drawDbq never repeats an author whose documents sit in different groups', () => {
  const { documents, dbqs } = makeData();
  documents[5] = makeDoc(6, { authorKey: 'author-1' }); // doc-6 (group g2) shares doc-1's author (group g1)
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, seed));
});

test('drawDbq sorts documents from the same year by id', () => {
  const { dbqs } = makeData();
  const documents = Array.from({ length: 10 }, (_, i) => makeDoc(i + 1, { year: 1600 }));
  const docs = byId(documents);
  assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, 7));
});

test('drawDbq throws, naming the prompt, when a group cannot supply two authors', () => {
  const { documents, dbqs } = makeData();
  for (const d of documents.slice(5)) d.authorKey = 'same-author';
  assert.throws(() => drawDbq(dbqs[0], byId(documents), 1), /test-prompt/);
});

test('pickRandom returns null when there is nothing to pick', () => {
  assert.equal(pickRandom([], ['a'], mulberry32(1)), null);
});

test('pickRandom avoids recent items while others remain', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) assert.ok(!['a', 'b', 'c'].includes(pickRandom(items, ['a', 'b', 'c'], rng).id));
});

test('pickRandom forgets the oldest recent items first', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id }));
  const rng = mulberry32(9);
  // newest first: c is on screen, a is the oldest; skipping all three leaves nothing, so a comes back
  for (let i = 0; i < 50; i++) assert.equal(pickRandom(items, ['c', 'b', 'a'], rng).id, 'a');
});

test('pickRandom offers the item on screen again only when it is the only match', () => {
  const rng = mulberry32(3);
  assert.equal(pickRandom([{ id: 'a' }], ['a'], rng).id, 'a');
  for (let i = 0; i < 50; i++) assert.equal(pickRandom([{ id: 'a' }, { id: 'b' }], ['a'], rng).id, 'b');
});

test('pushRecent puts the newest first, removes duplicates and caps the length', () => {
  assert.deepEqual(pushRecent(['b', 'a'], 'a', 3), ['a', 'b']);
  assert.deepEqual(pushRecent(['c', 'b', 'a'], 'd', 3), ['d', 'c', 'b']);
});

test('matchesFilter and topicsWithItems', () => {
  assert.equal(matchesFilter({ topics: ['4.3', '4.8'] }, ['4.8']), true);
  assert.equal(matchesFilter({ topics: ['4.3'] }, []), false);
  assert.deepEqual(topicsWithItems([{ topics: ['4.6', '4.3'] }, { topics: ['4.3'] }]), ['4.3', '4.6']);
});
