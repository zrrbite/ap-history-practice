#!/usr/bin/env node
// Research drafts -> one candidate list -> the verified bank.
//   node tools/candidates.js merge     data/research/cluster-*.json -> data/research/candidates.json
//   node tools/candidates.js promote   verified candidates -> data/documents.json (dropped ones are listed)
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.join(ROOT, 'data', 'research');
const CANDIDATES = path.join(RESEARCH, 'candidates.json');
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

async function main(command) {
  if (command === 'merge') {
    if (await access(CANDIDATES).then(() => true, () => false)) {
      throw new Error(`${path.relative(ROOT, CANDIDATES)} already exists; delete it to merge again (this discards verification marks)`);
    }
    const files = (await readdir(RESEARCH)).filter((f) => /^cluster-[a-z]+\.json$/.test(f)).sort();
    const clusters = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(RESEARCH, f), 'utf8'))));
    const { documents, conflicts } = mergeClusters(clusters);
    await writeJson(CANDIDATES, documents);
    console.log(`Merged ${files.length} cluster files into ${documents.length} candidates.`);
    for (const c of conflicts) console.log(`  conflict  ${c}`);
  } else if (command === 'promote') {
    const { documents, dropped } = promote(JSON.parse(await readFile(CANDIDATES, 'utf8')));
    await writeJson(path.join(ROOT, 'data', 'documents.json'), documents);
    console.log(`Promoted ${documents.length} verified documents; dropped ${dropped.length}.`);
    for (const d of dropped) console.log(`  dropped  ${d}`);
  } else {
    throw new Error('usage: node tools/candidates.js merge | promote');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
