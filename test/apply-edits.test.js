import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyEdit, applyEdits, parseArgs } from '../tools/apply-edits.js';
import { makeData } from './helpers/fixture.js';

const bank = () => makeData();

test('applyEdit changes one text value, found by item id and a dotted path with array indexes', () => {
  const b = bank();
  applyEdit(b, { file: 'dbqs', id: 'test-prompt', path: 'notes.thesis.0', old: 'T', new: 'A better thesis' });
  applyEdit(b, { file: 'dbqs.json', id: 'test-prompt', path: 'pool.2.sourcing', old: 'Sourcing note 3', new: 'Clearer note' });
  applyEdit(b, { file: 'saqs', id: 'test-saq', path: 'parts.1.accept.0', old: 'Accept b', new: 'Accept b, reworded' });
  applyEdit(b, { file: 'mcqs', id: 'test-mcq', path: 'questions.2.explanation', old: 'Because 3', new: 'Because three' });
  assert.equal(b.dbqs[0].notes.thesis[0], 'A better thesis');
  assert.equal(b.dbqs[0].pool[2].sourcing, 'Clearer note');
  assert.equal(b.saqs[0].parts[1].accept[0], 'Accept b, reworded');
  assert.equal(b.mcqs[0].questions[2].explanation, 'Because three');
});

test('applyEdit refuses stale text, unknown items and paths, non-text values and the documents file', () => {
  const b = bank();
  const base = { file: 'dbqs', id: 'test-prompt', path: 'notes.thesis.0', old: 'T', new: 'U' };
  assert.throws(() => applyEdit(b, { ...base, old: 'something else' }), /no longer reads as the edit expects/);
  assert.throws(() => applyEdit(b, { ...base, id: 'nope' }), /no item with id nope/);
  assert.throws(() => applyEdit(b, { ...base, path: 'notes.nothing.0' }), /nothing at path notes\.nothing\.0/);
  assert.throws(() => applyEdit(b, { ...base, path: 'notes.thesis' }), /not a text value/);
  assert.throws(() => applyEdit(b, { ...base, file: 'documents' }), /file must be dbqs, saqs or mcqs/);
  assert.throws(() => applyEdit(b, { ...base, new: 'T' }), /new text must differ/);
  assert.equal(b.dbqs[0].notes.thesis[0], 'T', 'a refused edit changes nothing');
});

test('applyEdits is all-or-nothing: one bad edit means no file is written', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'apply-edits-'));
  const data = makeData();
  for (const name of ['dbqs', 'saqs', 'mcqs']) await writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(data[name], null, 2)}\n`);
  const good = { file: 'saqs', id: 'test-saq', path: 'parts.0.task', old: 'Task a', new: 'Identify ONE thing.' };
  const bad = { file: 'saqs', id: 'test-saq', path: 'parts.0.task', old: 'not the text', new: 'x' };
  await assert.rejects(applyEdits(dir, [good, bad]), /1 of 2 edits do not apply[\s\S]*test-saq/);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'saqs.json'), 'utf8'))[0].parts[0].task, 'Task a');
  assert.deepEqual(await applyEdits(dir, [good]), { applied: 1, files: ['saqs'] });
  assert.equal(JSON.parse(await readFile(path.join(dir, 'saqs.json'), 'utf8'))[0].parts[0].task, 'Identify ONE thing.');
  assert.deepEqual(await applyEdits(dir, [{ ...good, old: 'Identify ONE thing.', new: 'Describe ONE thing.' }], { dry: true }), { applied: 1, files: ['saqs'] });
  assert.equal(JSON.parse(await readFile(path.join(dir, 'saqs.json'), 'utf8'))[0].parts[0].task, 'Identify ONE thing.', 'dry run writes nothing');
});

test('parseArgs rejects unknown flags such as --dry-run, so a typo cannot cause a write', () => {
  assert.throws(() => parseArgs(['--unit', 'unit-5', 'edits.json', '--dry-run']), /unknown option --dry-run/);
  assert.throws(() => parseArgs(['--unit', 'unit-5', 'edits.json', '--drY']), /unknown option --drY/);
  assert.deepEqual(parseArgs(['--unit', 'unit-5', 'edits.json', '--dry']), { unit: 'unit-5', file: 'edits.json', dry: true });
  assert.deepEqual(parseArgs(['--unit', 'unit-5', 'edits.json']), { unit: 'unit-5', file: 'edits.json', dry: false });
  assert.throws(() => parseArgs(['edits.json']), /usage: node tools\/apply-edits\.js/);
});
