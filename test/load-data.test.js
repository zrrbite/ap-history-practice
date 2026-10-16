import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inUnit, listUnits, loadData, loadUnit, selectUnits, takeUnit } from '../tools/load-data.js';
import { validate } from '../tools/validate.js';
import { makeData, writeDataDir } from './helpers/fixture.js';

const tmp = () => mkdtemp(path.join(tmpdir(), 'load-data-'));

test('loadData reads unit.json together with the four bank files', async () => {
  const root = await tmp();
  const data = makeData(5);
  await writeDataDir(path.join(root, 'unit-5'), data);
  assert.deepEqual(await loadData(path.join(root, 'unit-5')), data);
});

test('a missing unit.json leaves data.unit undefined, and validate reports it', async () => {
  const root = await tmp();
  const data = makeData();
  delete data.unit;
  await writeDataDir(path.join(root, 'unit-4'), data);
  const loaded = await loadData(path.join(root, 'unit-4'));
  assert.equal(loaded.unit, undefined);
  assert.deepEqual(validate(loaded), ['unit.json: missing or not a JSON object']);
});

test('malformed JSON in unit.json is an error that names the file', async () => {
  const root = await tmp();
  await writeDataDir(path.join(root, 'unit-4'), makeData());
  await writeFile(path.join(root, 'unit-4', 'unit.json'), '{ "id": ');
  await assert.rejects(loadData(path.join(root, 'unit-4')), /unit-4[\\/]unit\.json: /);
});

test('listUnits finds unit folders in numeric order and ignores everything else', async () => {
  const root = await tmp();
  for (const name of ['unit-10', 'unit-4', 'unit-5', 'research', 'unit-x']) await mkdir(path.join(root, name));
  await writeFile(path.join(root, 'unit-6'), 'a file, not a folder');
  assert.deepEqual(await listUnits(root), ['unit-4', 'unit-5', 'unit-10']);
});

test('selectUnits returns every unit or one, and names the known units for an unknown one', async () => {
  const root = await tmp();
  for (const name of ['unit-4', 'unit-5']) await mkdir(path.join(root, name));
  assert.deepEqual((await selectUnits(root)).map((u) => u.id), ['unit-4', 'unit-5']);
  assert.deepEqual(await selectUnits(root, 'unit-5'), [{ id: 'unit-5', dir: path.join(root, 'unit-5') }]);
  await assert.rejects(selectUnits(root, 'unit-9'), /no such unit "unit-9" \(known: unit-4, unit-5\)/);
});

test('loadUnit refuses a folder whose unit.json names another unit', async () => {
  const root = await tmp();
  await writeDataDir(path.join(root, 'unit-5'), makeData(4));
  await assert.rejects(loadUnit({ id: 'unit-5', dir: path.join(root, 'unit-5') }), /unit\.json: id is "unit-4" but the folder is unit-5/);
});

test('takeUnit removes --unit and its value, and rejects a missing value', () => {
  assert.deepEqual(takeUnit(['--release', '--unit', 'unit-5']), { unit: 'unit-5', args: ['--release'] });
  assert.deepEqual(takeUnit(['merge']), { unit: null, args: ['merge'] });
  assert.throws(() => takeUnit(['--unit']), /--unit needs a unit id/);
  assert.throws(() => takeUnit(['--unit', '--release']), /--unit needs a unit id/);
});

test('inUnit resolves relative paths inside the unit folder and leaves absolute ones alone', () => {
  assert.equal(inUnit('/d/unit-5', 'research/cluster-a.json'), path.join('/d/unit-5', 'research/cluster-a.json'));
  assert.equal(inUnit('/d/unit-5', '/x/y.json'), '/x/y.json');
});
