#!/usr/bin/env node
// Captures or compares the rendered text of a built unit page for a fixed list of share codes.
//   node tools/snapshot-render.js <local.html> --write <snapshot.json>     capture the codes in SNAPSHOT_CODES
//   node tools/snapshot-render.js <local.html> --compare <snapshot.json>   compare with a stored snapshot
//   add --texts <file.json> to also save the full rendered texts, for diffing
// Needs local Chrome (see tools/chrome.js).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareSnapshot, runHarness, snapshotOf } from './chrome.js';

// Three DBQ draws, a DBQ drawn from a short seed, a seed spelled with letters, one SAQ and one MCQ set.
export const SNAPSHOT_CODES = [
  'dbq.silver-trade.1',
  'dbq.exploration-causes.2',
  'dbq.east-asia-responses.zz9',
  'dbq.challenges-to-state-power.k2x9q1',
  'saq.henry-navigator-motives',
  'mcq.acosta-mercury-silver',
];

async function main(argv) {
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : null;
  };
  const [page] = argv;
  const write = flag('--write');
  const compare = flag('--compare');
  if (!page || page.startsWith('--') || (!write && !compare)) {
    throw new Error('usage: node tools/snapshot-render.js <local.html> (--write <file> | --compare <file>) [--texts <file>]');
  }
  const codes = compare ? Object.keys(JSON.parse(await readFile(compare, 'utf8')).codes) : SNAPSHOT_CODES;
  const { texts } = await runHarness(path.resolve(page), { codes, checks: false });
  const missing = codes.filter((code) => typeof texts[code] !== 'string');
  if (missing.length > 0) throw new Error(`nothing rendered for ${missing.join(', ')}${texts.error ? `: ${texts.error}` : ''}`);
  if (flag('--texts')) await writeFile(flag('--texts'), `${JSON.stringify(texts, null, 2)}\n`);
  if (write) {
    await writeFile(write, `${JSON.stringify(snapshotOf(Object.fromEntries(codes.map((code) => [code, texts[code]]))), null, 2)}\n`);
    console.log(`Wrote ${write} for ${codes.length} codes.`);
  }
  if (compare) {
    const problems = compareSnapshot(texts, JSON.parse(await readFile(compare, 'utf8')));
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`The rendered text matches the snapshot for ${codes.length} codes.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
