import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshot, decodeResult, sha256, snapshotOf } from '../tools/chrome.js';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64');

test('sha256 hashes text as UTF-8', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('decodeResult reads the base64 JSON the harness leaves in the DOM, accents included', () => {
  const value = { texts: { 'saq.x': 'Bartolomé' }, results: ['PASS  one'] };
  assert.deepEqual(decodeResult(`<html><body><pre id="result">${b64(value)}</pre></body></html>`), value);
});

test('decodeResult says so when the harness never finished', () => {
  assert.throws(() => decodeResult('<pre id="result">running...</pre>'), /did not finish/);
  assert.throws(() => decodeResult('<html></html>'), /did not finish/);
});

test('compareSnapshot passes identical text and names each code that changed or is missing', () => {
  const snapshot = snapshotOf({ 'dbq.a.1': 'one two', 'saq.b': 'three' });
  assert.deepEqual(compareSnapshot({ 'dbq.a.1': 'one two', 'saq.b': 'three' }, snapshot), []);
  const problems = compareSnapshot({ 'dbq.a.1': 'one  twp' }, snapshot);
  assert.equal(problems.length, 2);
  assert.equal(problems[0], 'dbq.a.1: rendered text changed (8 characters now, 7 in the snapshot)');
  assert.equal(problems[1], 'saq.b: nothing was rendered');
});
