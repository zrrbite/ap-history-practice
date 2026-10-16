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

// The SHA-256 of
//   JSON.stringify({ documents, dbqs, saqs, mcqs })
// where the four arrays come from runtimeBank(await loadData(<unit 4 folder>), null).
// 168 documents, 10 DBQs, 20 SAQs, 15 MCQ sets. First taken on main (e8317ec) before the
// multi-unit restructure; re-taken after the 2026-10-16 accuracy review corrected Unit 4's notes.
// Any other change to Unit 4's content should fail here.
export const UNIT4_CONTENT_SHA256 = '91eece7fb2cf6e638bc909f0aea4f57dcfdc89d7bd1745ab398f393e168c77e9';

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
