import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../tools/build.js';
import { makeData, writeDataDir } from './helpers/fixture.js';

const WORKFLOW = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('the build job tests, checks release minimums for every unit, builds, assembles and uploads, in that order', () => {
  const steps = ['run: npm test', 'run: node tools/validate.js --release', 'run: npm run build', 'name: Assemble the site', 'actions/upload-pages-artifact'];
  const at = steps.map((s) => WORKFLOW.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing step: ${JSON.stringify(steps.filter((_, i) => at[i] < 0))}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps are out of order');
  assert.doesNotMatch(WORKFLOW, /--unit/, 'release minimums are checked for every unit');
  assert.doesNotMatch(WORKFLOW, /check-page/, 'the page check needs a local Chrome and does not run in CI');
});

test('the assemble step puts the index at the root and each unit page at unit-N/index.html', async () => {
  const match = /- name: Assemble the site\n\s+run: \|\n((?: {10}.*\n)+)/.exec(WORKFLOW);
  assert.ok(match, 'no "Assemble the site" step with a run block');
  const script = match[1].split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
  const dir = await mkdtemp(path.join(tmpdir(), 'workflow-'));
  for (const number of [4, 5]) await writeDataDir(path.join(dir, 'data', `unit-${number}`), makeData(number));
  await build({ dataRoot: path.join(dir, 'data'), outDir: path.join(dir, 'dist') });
  execFileSync('sh', ['-e', '-c', script], { cwd: dir });
  const same = async (a, b) => assert.equal(await readFile(path.join(dir, a), 'utf8'), await readFile(path.join(dir, b), 'utf8'), `${a} should equal ${b}`);
  await same('_site/index.html', 'dist/index.html');
  await same('_site/unit-4/index.html', 'dist/unit-4/local.html');
  await same('_site/unit-5/index.html', 'dist/unit-5/local.html');
});
