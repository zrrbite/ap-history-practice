import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadData } from '../tools/load-data.js';
import { validate } from '../tools/validate.js';

test('the shipped question bank passes validation', async () => {
  const data = await loadData(fileURLToPath(new URL('../data', import.meta.url)));
  assert.deepEqual(validate(data), []);
});
