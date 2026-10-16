#!/usr/bin/env node
// Builds every unit (or one) and checks each built page in headless Chrome:
//   - the 34 page checks (load, codes, scoring guides, filters, drills, timer, 400px layout, every code in the bank);
//   - when test/fixtures/<unit>-render.json exists, that the rendered text for its codes is unchanged;
//   - for a full run, that the landing page forwards /#dbq.silver-trade.1 to Unit 4.
// Usage: npm run check-page [-- --unit unit-5] [--no-build]
// Needs local Chrome (see tools/chrome.js). CI does not run it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';
import { compareSnapshot, dumpDom, runHarness } from './chrome.js';
import { UNIT_HOME } from './landing.js';
import { selectUnits, takeUnit } from './load-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXPECTED_CHECKS = 34;
const LANDING_CODE = 'dbq.silver-trade.1';

// Everything wrong in a harness run: failed or crashed checks, and a run that did not reach all 34.
export function problemsIn(results) {
  const problems = results.filter((line) => !line.startsWith('PASS'));
  const ran = results.filter((line) => /^(PASS|FAIL) /.test(line)).length;
  if (ran !== EXPECTED_CHECKS) problems.push(`expected ${EXPECTED_CHECKS} checks, ${ran} ran`);
  return problems;
}

async function readSnapshot(id) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, 'test', 'fixtures', `${id}-render.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkUnitPage(id, dist) {
  const snapshot = await readSnapshot(id);
  const { texts, results } = await runHarness(path.join(dist, id, 'local.html'), { codes: snapshot ? Object.keys(snapshot.codes) : [], checks: true });
  const problems = problemsIn(results);
  if (texts.error) problems.push(`harness: ${texts.error}`);
  console.log(id);
  for (const line of results) console.log(`  ${line}`);
  if (snapshot && !texts.error) {
    const changed = compareSnapshot(texts, snapshot);
    if (changed.length === 0) console.log(`  PASS  rendered text unchanged for ${Object.keys(snapshot.codes).length} codes`);
    else for (const line of changed) console.log(`  FAIL  ${line}`);
    problems.push(...changed);
  }
  return problems.length;
}

async function checkLanding(dist) {
  const url = `${pathToFileURL(path.join(dist, 'index.html')).href}#${LANDING_CODE}`;
  const shown = new RegExp(`<code id="current-code">${LANDING_CODE.replace(/\./g, '\\.')}</code>`).test(await dumpDom(url));
  console.log(`landing\n  ${shown ? 'PASS' : 'FAIL'}  /#${LANDING_CODE} forwards to ${UNIT_HOME} and opens that code`);
  return shown ? 0 : 1;
}

async function main(argv) {
  const { unit, args } = takeUnit(argv);
  const dist = path.join(ROOT, 'dist');
  if (!args.includes('--no-build')) await build({ outDir: dist, only: unit });
  const ids = (await selectUnits(path.join(ROOT, 'data'), unit)).map((u) => u.id);
  let problems = 0;
  for (const id of ids) problems += await checkUnitPage(id, dist);
  if (unit === null && ids.includes(UNIT_HOME)) problems += await checkLanding(dist);
  console.log(problems === 0 ? '\nAll page checks passed.' : `\n${problems} problem(s).`);
  if (problems) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
