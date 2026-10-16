import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseCode, resolveCode } from '../src/code.js';
import { loadData } from '../tools/load-data.js';

// Task 2 changes this to ../data/unit-4.
const UNIT4_DIR = fileURLToPath(new URL('../data', import.meta.url));

test("every code in Unit 4's render snapshot still resolves in Unit 4's bank", async () => {
  const data = await loadData(UNIT4_DIR);
  const docsById = new Map(data.documents.map((d) => [d.id, d]));
  const snapshot = JSON.parse(await readFile(new URL('./fixtures/unit-4-render.json', import.meta.url), 'utf8'));
  const codes = Object.keys(snapshot.codes);
  assert.equal(codes.length, 6);
  for (const code of codes) assert.equal(resolveCode(parseCode(code), data, docsById).ok, true, code);
});
