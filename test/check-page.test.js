import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED_CHECKS, problemsIn } from '../tools/check-page.js';

const passes = (n) => Array.from({ length: n }, (_, i) => `PASS  check ${i + 1}`);

test('problemsIn is empty when all 34 checks pass', () => {
  assert.equal(EXPECTED_CHECKS, 34);
  assert.deepEqual(problemsIn(passes(34)), []);
});

test('problemsIn lists failing checks with their detail', () => {
  const results = [...passes(33), 'FAIL  copy link shown  [expected true]'];
  assert.deepEqual(problemsIn(results), ['FAIL  copy link shown  [expected true]']);
});

test('problemsIn notices a harness that stopped early', () => {
  const problems = problemsIn([...passes(10), 'ERROR TypeError: boom']);
  assert.deepEqual(problems, ['ERROR TypeError: boom', 'expected 34 checks, 10 ran']);
  assert.deepEqual(problemsIn([]), ['expected 34 checks, 0 ran']);
});
