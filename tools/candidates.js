#!/usr/bin/env node
// Research drafts -> one candidate list -> the verified bank, for one unit.
//   node tools/candidates.js merge   --unit unit-5   research/cluster-*.json -> research/candidates.json
//   node tools/candidates.js promote --unit unit-5   verified candidates -> documents.json (dropped ones are listed)
// Both write into the unit's folder, so --unit is required: there is no "every unit" default for commands that write the bank.
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectUnits, takeUnit } from './load-data.js';

const DATA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function mergeClusters(clusters) {
  const kept = new Map();
  const conflicts = [];
  for (const { cluster, documents } of clusters) {
    for (const doc of documents) {
      const prev = kept.get(doc.id);
      if (!prev) kept.set(doc.id, { cluster, doc: { ...doc, verified: false } });
      else if (prev.doc.text !== doc.text || prev.doc.sourceUrl !== doc.sourceUrl) {
        conflicts.push(`${doc.id}: cluster ${cluster} has a different version; kept the one from cluster ${prev.cluster}`);
      }
    }
  }
  return { documents: [...kept.values()].map((k) => k.doc).sort(byId), conflicts };
}

export function promote(candidates) {
  const undecided = candidates.filter((d) => d.verified !== true && !d.dropped).map((d) => d.id);
  if (undecided.length) throw new Error(`Not yet verified or dropped: ${undecided.join(', ')}`);
  const documents = candidates.filter((d) => d.verified === true && !d.dropped).map(({ dropped, ...doc }) => doc).sort(byId);
  const dropped = candidates.filter((d) => d.dropped).map((d) => `${d.id}: ${d.dropped}`);
  return { documents, dropped };
}

const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

// research/cluster-*.json -> research/candidates.json inside a unit folder.
export async function mergeUnit(dir) {
  const research = path.join(dir, 'research');
  const candidates = path.join(research, 'candidates.json');
  if (await access(candidates).then(() => true, () => false)) {
    throw new Error('research/candidates.json already exists; delete it to merge again (this discards verification marks)');
  }
  const files = (await readdir(research)).filter((f) => /^cluster-[a-z]+\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error('research/ has no cluster-*.json files');
  const clusters = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(research, f), 'utf8'))));
  const { documents, conflicts } = mergeClusters(clusters);
  await writeJson(candidates, documents);
  return { files: files.length, documents: documents.length, conflicts };
}

// Verified candidates -> documents.json inside a unit folder.
export async function promoteUnit(dir) {
  const { documents, dropped } = promote(JSON.parse(await readFile(path.join(dir, 'research', 'candidates.json'), 'utf8')));
  await writeJson(path.join(dir, 'documents.json'), documents);
  return { documents: documents.length, dropped };
}

async function main(argv) {
  const { unit, args } = takeUnit(argv);
  const [command] = args;
  if (!['merge', 'promote'].includes(command) || unit === null) throw new Error('usage: node tools/candidates.js merge|promote --unit <unit id>');
  const [{ dir }] = await selectUnits(DATA_ROOT, unit);
  if (command === 'merge') {
    const { files, documents, conflicts } = await mergeUnit(dir);
    console.log(`Merged ${files} cluster files into ${documents} candidates (research/candidates.json).`);
    for (const c of conflicts) console.log(`  conflict  ${c}`);
  } else {
    const { documents, dropped } = await promoteUnit(dir);
    console.log(`Promoted ${documents} verified documents into documents.json; dropped ${dropped.length}.`);
    for (const d of dropped) console.log(`  dropped  ${d}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
