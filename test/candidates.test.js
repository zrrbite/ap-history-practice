import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeClusters, promote } from '../tools/candidates.js';
import { makeDoc } from './helpers/fixture.js';

test('mergeClusters keeps one copy of a shared document, resets verified and reports real conflicts', () => {
  const a = makeDoc(1);
  const b = makeDoc(2);
  const { documents, conflicts } = mergeClusters([
    { cluster: 'a', documents: [b, a] },
    { cluster: 'b', documents: [{ ...a }, { ...b, text: 'a different excerpt' }] },
  ]);
  assert.deepEqual(documents.map((d) => d.id), ['doc-1', 'doc-2']);
  assert.ok(documents.every((d) => d.verified === false));
  assert.deepEqual(conflicts, ['doc-2: cluster b has a different version; kept the one from cluster a']);
});

test('promote refuses while any candidate is neither verified nor dropped', () => {
  assert.throws(() => promote([makeDoc(1), makeDoc(2, { verified: false })]), /doc-2/);
});

test('promote keeps verified candidates and lists dropped ones with their reasons', () => {
  const { documents, dropped } = promote([makeDoc(2), makeDoc(1), makeDoc(3, { verified: false, dropped: 'not in source' })]);
  assert.deepEqual(documents.map((d) => d.id), ['doc-1', 'doc-2']);
  assert.ok(documents.every((d) => !('dropped' in d)));
  assert.deepEqual(dropped, ['doc-3: not in source']);
});
