#!/usr/bin/env node
// Applies reviewer edits to a unit's DBQs, SAQs and MCQ sets. All-or-nothing: if any edit does not
// apply, nothing is written.
//   node tools/apply-edits.js --unit unit-5 research/review-edits.json [--dry]
// An edit is { file: "dbqs"|"saqs"|"mcqs" (".json" optional), id, path: "notes.thesis.1", old, new }.
// "path" is dotted, numbers index arrays. "old" must equal the current text exactly, so a stale or
// mistyped edit is refused, never guessed at.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inUnit, selectUnits, takeUnit } from './load-data.js';

const DATA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILES = ['dbqs', 'saqs', 'mcqs'];

export function applyEdit(bank, edit) {
  const name = String(edit.file).replace(/\.json$/, '');
  if (!FILES.includes(name)) throw new Error(`edit for ${edit.id}: file must be dbqs, saqs or mcqs, not "${edit.file}"`);
  const item = bank[name].find((x) => x.id === edit.id);
  if (!item) throw new Error(`${name}: no item with id ${edit.id}`);
  const parts = String(edit.path).split('.');
  let node = item;
  for (const part of parts.slice(0, -1)) {
    node = node?.[part];
    if (node === null || typeof node !== 'object') throw new Error(`${name} ${edit.id}: nothing at path ${edit.path}`);
  }
  const last = parts[parts.length - 1];
  if (typeof node[last] !== 'string') throw new Error(`${name} ${edit.id}: ${edit.path} is not a text value`);
  if (node[last] !== edit.old) throw new Error(`${name} ${edit.id}: ${edit.path} no longer reads as the edit expects`);
  if (typeof edit.new !== 'string' || edit.new === edit.old) throw new Error(`${name} ${edit.id}: ${edit.path}: new text must differ from the old text`);
  node[last] = edit.new;
}

// Applies every edit to the unit folder `dir`; returns { applied, files } (the files that changed).
export async function applyEdits(dir, edits, { dry = false } = {}) {
  const bank = {};
  for (const name of FILES) bank[name] = JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'));
  const failures = [];
  for (const edit of edits) {
    try {
      applyEdit(bank, edit);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} of ${edits.length} edits do not apply; nothing was written:\n${failures.join('\n')}`);
  const files = [...new Set(edits.map((e) => String(e.file).replace(/\.json$/, '')))];
  if (!dry) for (const name of files) await writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(bank[name], null, 2)}\n`);
  return { applied: edits.length, files };
}

async function main(argv) {
  const { unit, args } = takeUnit(argv);
  const files = args.filter((a) => !a.startsWith('--'));
  if (unit === null || files.length !== 1) throw new Error('usage: node tools/apply-edits.js --unit <unit id> <edits.json> [--dry]');
  const [{ dir }] = await selectUnits(DATA_ROOT, unit);
  const edits = JSON.parse(await readFile(inUnit(dir, files[0]), 'utf8'));
  const result = await applyEdits(dir, edits, { dry: args.includes('--dry') });
  console.log(`${args.includes('--dry') ? 'Would apply' : 'Applied'} ${result.applied} edits to ${result.files.join(', ') || 'nothing'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
