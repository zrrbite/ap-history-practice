import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mergeClusters, mergeUnit, promote, promoteUnit } from '../tools/candidates.js';
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

async function unitWithClusters() {
  const dir = await mkdtemp(path.join(tmpdir(), 'candidates-'));
  await mkdir(path.join(dir, 'research'));
  await writeFile(path.join(dir, 'research', 'cluster-a.json'), JSON.stringify({ cluster: 'a', documents: [makeDoc(2), makeDoc(1)] }));
  await writeFile(path.join(dir, 'research', 'cluster-b.json'), JSON.stringify({ cluster: 'b', documents: [makeDoc(1)] }));
  return dir;
}

test('mergeUnit and promoteUnit work inside a unit folder', async () => {
  const dir = await unitWithClusters();
  const merged = await mergeUnit(dir);
  assert.deepEqual({ files: merged.files, documents: merged.documents, conflicts: merged.conflicts }, { files: 2, documents: 2, conflicts: [] });
  await assert.rejects(mergeUnit(dir), /research\/candidates\.json already exists/);
  const file = path.join(dir, 'research', 'candidates.json');
  const candidates = JSON.parse(await readFile(file, 'utf8')).map((d) => ({ ...d, verified: true }));
  await writeFile(file, JSON.stringify(candidates));
  assert.deepEqual(await promoteUnit(dir), { documents: 2, dropped: [] });
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'documents.json'), 'utf8')).map((d) => d.id), ['doc-1', 'doc-2']);
});

test('mergeUnit refuses a unit that has no cluster files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'candidates-'));
  await mkdir(path.join(dir, 'research'));
  await assert.rejects(mergeUnit(dir), /no cluster-\*\.json files/);
});
