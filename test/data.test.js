import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { listUnits, loadUnit, selectUnits } from '../tools/load-data.js';
import { validate } from '../tools/validate.js';

const DATA_ROOT = fileURLToPath(new URL('../data', import.meta.url));

test('every shipped unit passes validation', async () => {
  const ids = await listUnits(DATA_ROOT);
  assert.ok(ids.includes('unit-4'));
  for (const unit of await selectUnits(DATA_ROOT)) {
    assert.deepEqual(validate(await loadUnit(unit)), [], unit.id);
  }
});
