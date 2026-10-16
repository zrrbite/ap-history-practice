import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCode, parseCode, resolveCode, shareBaseFor } from '../src/code.js';
import { drawDbq } from '../src/sampler.js';
import { makeData } from './helpers/fixture.js';

const setup = () => {
  const bank = makeData();
  return { bank, docs: new Map(bank.documents.map((d) => [d.id, d])) };
};

test('formatCode and parseCode round-trip every kind, using only link-safe characters', () => {
  for (const item of [
    { kind: 'dbq', id: 'silver-trade', seed: 0 },
    { kind: 'dbq', id: 'silver-trade', seed: 0xffffffff },
    { kind: 'saq', id: 'potosi-1' },
    { kind: 'mcq', id: 'kangxi-edict' },
  ]) {
    const code = formatCode(item);
    assert.match(code, /^[a-z0-9.-]+$/);
    assert.deepEqual(parseCode(code), item);
  }
});

test('parseCode tolerates a leading #, spaces and capitals', () => {
  assert.deepEqual(parseCode('  #DBQ.Silver-Trade.K2X9Q1 '), { kind: 'dbq', id: 'silver-trade', seed: parseInt('k2x9q1', 36) });
});

test('parseCode rejects malformed and old-format codes', () => {
  const bad = ['', '#', 'dbq', 'dbq.silver-trade', 'dbq.silver-trade.', 'dbq.silver-trade.!!',
    'dbq.silver-trade.zzzzzzz', 'dbq.silver-trade.12345678', 'dbq/silver-trade/1', 'saq.', 'saq.a.b',
    'xyz.foo', 'mcq.Bad_Id', 'dbq.-x.1', 'dbq.silver-trade.1 extra', null, undefined, 42];
  for (const text of bad) assert.equal(parseCode(text), null, `accepted ${JSON.stringify(text)}`);
});

test('resolveCode explains an invalid code', () => {
  const { bank, docs } = setup();
  const result = resolveCode(parseCode('nonsense'), bank, docs);
  assert.equal(result.ok, false);
  assert.match(result.message, /isn’t valid/);
});

test('resolveCode explains codes for items that are no longer in the bank', () => {
  const { bank, docs } = setup();
  for (const code of ['dbq.gone.1', 'saq.gone', 'mcq.gone']) {
    const result = resolveCode(parseCode(code), bank, docs);
    assert.equal(result.ok, false, code);
    assert.match(result.message, /no longer in the bank/, code);
  }
});

test('resolveCode reproduces a DBQ draw from its seed', () => {
  const { bank, docs } = setup();
  const result = resolveCode(parseCode('dbq.test-prompt.zz'), bank, docs);
  assert.equal(result.ok, true);
  assert.equal(result.prompt.id, 'test-prompt');
  assert.deepEqual(result.entries, drawDbq(bank.dbqs[0], docs, parseInt('zz', 36)));
});

test('resolveCode finds drills', () => {
  const { bank, docs } = setup();
  assert.equal(resolveCode(parseCode('saq.test-saq'), bank, docs).item.id, 'test-saq');
  assert.equal(resolveCode(parseCode('mcq.test-mcq'), bank, docs).kind, 'mcq');
});

test('resolveCode reports a DBQ that cannot be drawn instead of throwing', () => {
  const { bank, docs } = setup();
  for (const d of bank.documents.slice(5)) d.authorKey = 'same-author';
  const result = resolveCode(parseCode('dbq.test-prompt.1'), bank, docs);
  assert.equal(result.ok, false);
  assert.match(result.message, /can’t be drawn/);
});

test('shareBaseFor uses the page address when served directly, such as on GitHub Pages', () => {
  const pages = { protocol: 'https:', origin: 'https://zrrbite.github.io', pathname: '/ap-history-practice/' };
  assert.equal(shareBaseFor('https://claude.ai/artifact/abc', pages, false), 'https://zrrbite.github.io/ap-history-practice/');
  assert.equal(shareBaseFor(null, pages, false), 'https://zrrbite.github.io/ap-history-practice/');
});

test('shareBaseFor uses the configured artifact link inside the artifact frame', () => {
  const frame = { protocol: 'https:', origin: 'https://sandbox.example', pathname: '/x' };
  assert.equal(shareBaseFor('https://claude.ai/artifact/abc', frame, true), 'https://claude.ai/artifact/abc');
  assert.equal(shareBaseFor(null, frame, true), null);
});

test('shareBaseFor offers no link for a page opened from disk', () => {
  assert.equal(shareBaseFor('https://claude.ai/artifact/abc', { protocol: 'file:', origin: 'null', pathname: '/x/local.html' }, false), null);
});

test("resolveCode's invalid-code message shows the unit's own sample code", () => {
  const { bank, docs } = setup();
  const withUnit = { ...bank, unit: { exampleCode: 'dbq.enlightenment-revolutions.k2x9q1' } };
  assert.match(resolveCode(parseCode('nonsense'), withUnit, docs).message, /Codes look like dbq\.enlightenment-revolutions\.k2x9q1\./);
  assert.match(resolveCode(parseCode('nonsense'), bank, docs).message, /Codes look like dbq\.silver-trade\.k2x9q1\./, "the fixture's unit 4");
  assert.match(resolveCode(parseCode('nonsense'), { ...bank, unit: undefined }, docs).message, /Codes look like dbq\.example-prompt\.k2x9q1\./);
});
