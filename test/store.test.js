import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeStore, asStringArray } from '../src/store.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('safeStore round-trips JSON values and falls back for missing keys', () => {
  const backing = memoryStorage();
  const s = safeStore(() => backing);
  s.set('topics', ['4.1', '4.3']);
  assert.deepEqual(s.get('topics', []), ['4.1', '4.3']);
  assert.equal(s.get('missing', 'fallback'), 'fallback');
});

test('safeStore falls back when reaching storage throws (private window, blocked site data)', () => {
  const s = safeStore(() => { throw new Error('SecurityError'); });
  assert.deepEqual(s.get('k', ['x']), ['x']);
  assert.doesNotThrow(() => s.set('k', 1));
});

test('safeStore falls back when getItem or setItem throws', () => {
  const s = safeStore(() => ({ getItem() { throw new Error('nope'); }, setItem() { throw new Error('QuotaExceeded'); } }));
  assert.equal(s.get('k', 7), 7);
  assert.doesNotThrow(() => s.set('k', 1));
});

test('safeStore falls back for junk JSON and missing storage', () => {
  const backing = memoryStorage();
  backing.setItem('k', '{nope');
  assert.equal(safeStore(() => backing).get('k', 'fallback'), 'fallback');
  assert.equal(safeStore(() => undefined).get('k', 'fallback'), 'fallback');
});

test('asStringArray keeps only strings and rejects non-arrays', () => {
  assert.deepEqual(asStringArray(['a', 1, null, 'b']), ['a', 'b']);
  assert.deepEqual(asStringArray('a'), []);
  assert.deepEqual(asStringArray({ 0: 'a' }), []);
  assert.deepEqual(asStringArray(null), []);
});
