import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadData } from '../tools/load-data.js';
import { runtimeBank } from '../tools/build.js';

// Where Unit 4's bank lives. Task 2 moves it to data/unit-4 and changes this line.
const UNIT4_DIR = fileURLToPath(new URL('../data', import.meta.url));

// Taken on main (commit e8317ec) before the multi-unit restructure: the SHA-256 of
//   JSON.stringify({ documents, dbqs, saqs, mcqs })
// where the four arrays come from runtimeBank(await loadData(<unit 4 folder>), null).
// 168 documents, 10 DBQs, 20 SAQs, 15 MCQ sets.
export const UNIT4_CONTENT_SHA256 = '6fc66afc9ce95bf6b893afb385adc1f9fef444509221cf72b66e3ec5017545ff';

export function contentHash({ documents, dbqs, saqs, mcqs }) {
  return createHash('sha256').update(JSON.stringify({ documents, dbqs, saqs, mcqs })).digest('hex');
}

test("Unit 4's embedded content is unchanged", async () => {
  assert.equal(contentHash(runtimeBank(await loadData(UNIT4_DIR), null)), UNIT4_CONTENT_SHA256);
});
