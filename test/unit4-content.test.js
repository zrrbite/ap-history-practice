import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, runtimeBank } from '../tools/build.js';
import { loadData } from '../tools/load-data.js';

const DATA_ROOT = fileURLToPath(new URL('../data', import.meta.url));

// Taken on main (commit e8317ec) before the multi-unit restructure: the SHA-256 of
//   JSON.stringify({ documents, dbqs, saqs, mcqs })
// where the four arrays come from runtimeBank(await loadData(<unit 4 folder>), null).
// 168 documents, 10 DBQs, 20 SAQs, 15 MCQ sets.
export const UNIT4_CONTENT_SHA256 = '6fc66afc9ce95bf6b893afb385adc1f9fef444509221cf72b66e3ec5017545ff';

export function contentHash({ documents, dbqs, saqs, mcqs }) {
  return createHash('sha256').update(JSON.stringify({ documents, dbqs, saqs, mcqs })).digest('hex');
}

test("Unit 4's embedded content is unchanged", async () => {
  assert.equal(contentHash(runtimeBank(await loadData(path.join(DATA_ROOT, 'unit-4')), null)), UNIT4_CONTENT_SHA256);
});

test("Unit 4's built page embeds exactly that content", async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'unit4-built-'));
  const { units } = await build({ dataRoot: DATA_ROOT, outDir: out, only: 'unit-4' });
  const html = await readFile(units[0].indexPath, 'utf8');
  const bank = JSON.parse(/<script type="application\/json" id="bank">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(contentHash(bank), UNIT4_CONTENT_SHA256);
});
