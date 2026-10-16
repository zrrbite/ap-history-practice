#!/usr/bin/env node
// Builds one single-file page per unit, validating that unit's bank first.
// dist/<unit>/index.html is what gets published as the unit's artifact (the host adds the document skeleton);
// dist/<unit>/local.html is the same page in a full HTML document, for opening from disk, printing and GitHub Pages.
// Usage: node tools/build.js [--unit unit-5]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeHtml, fill } from './html.js';
import { loadUnit, selectUnits, takeUnit } from './load-data.js';
import { validate } from './validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Concatenated in this order into one module script; a module may use those before it.
export const MODULES = ['sampler.js', 'code.js', 'timer.js', 'store.js', 'app.js'];

export function stripModuleSyntax(source, name) {
  const out = source
    .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/[\w-]+\.js';[ \t]*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '');
  if (/^\s*(?:import|export)\b/m.test(out)) {
    throw new Error(`${name}: only "import { … } from './x.js';" and "export function/const" are supported`);
  }
  return out;
}

// JSON that is safe inside <script type="application/json">: no "</script>", no raw line separators.
export function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// What the page needs from a unit's bank at run time.
export function runtimeBank(data, shareBase) {
  const documents = data.documents.map(({ original, verified, verifiedBy, verifiedNote, ...shown }) => shown);
  const { id, number, title, period, topics, exampleCode } = data.unit;
  return {
    config: { shareBase: shareBase ?? null },
    unit: { id, number, title, period, topics, exampleCode },
    documents,
    dbqs: data.dbqs,
    saqs: data.saqs,
    mcqs: data.mcqs,
  };
}

// Unit text goes in first, then styles, script and finally the bank, so that markers in later text can never be filled.
export function renderPage(template, { styles, script, bank }) {
  const { unit } = bank;
  let page = fill(template, '__UNIT_NUMBER__', escapeHtml(unit.number));
  page = fill(page, '__UNIT_TITLE__', escapeHtml(unit.title));
  page = fill(page, '__UNIT_PERIOD__', escapeHtml(unit.period));
  page = fill(page, '__EXAMPLE_CODE__', escapeHtml(unit.exampleCode));
  page = fill(page, '/*STYLES*/', styles);
  page = fill(page, '/*SCRIPT*/', script);
  return fill(page, '__BANK__', jsonForHtml(bank));
}

const wrapAsDocument = (page) => [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '</head>',
  '<body>',
  page,
  '</body>',
  '</html>',
  '',
].join('\n');

export async function build({ dataRoot = path.join(ROOT, 'data'), outDir = path.join(ROOT, 'dist'), only = null } = {}) {
  const loaded = [];
  for (const entry of await selectUnits(dataRoot, only)) {
    const data = await loadUnit(entry);
    const errors = validate(data);
    if (errors.length) throw new Error(`${entry.id}: the question bank has ${errors.length} problem(s):\n${errors.join('\n')}`);
    loaded.push({ id: entry.id, data });
  }
  if (loaded.length === 0) throw new Error(`no unit folders found under ${dataRoot}`);
  const src = (name) => readFile(path.join(ROOT, 'src', name), 'utf8');
  const parts = await Promise.all(MODULES.map(async (name) => `// ${name}\n${stripModuleSyntax(await src(name), name)}`));
  const script = parts.join('\n');
  if (/<\/script/i.test(script)) throw new Error('src/*.js must not contain "</script"');
  const template = await src('index.html');
  const styles = await src('styles.css');
  const units = [];
  for (const { id, data } of loaded) {
    const page = renderPage(template, { styles, script, bank: runtimeBank(data, data.unit.shareBase) });
    const folder = path.join(outDir, id);
    await mkdir(folder, { recursive: true });
    const indexPath = path.join(folder, 'index.html');
    const localPath = path.join(folder, 'local.html');
    await writeFile(indexPath, page);
    await writeFile(localPath, wrapAsDocument(page));
    units.push({ id, indexPath, localPath, bytes: Buffer.byteLength(page) });
  }
  return { units };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { unit } = takeUnit(process.argv.slice(2));
    const { units } = await build({ only: unit });
    for (const u of units) {
      console.log(`Wrote ${path.relative(ROOT, u.indexPath)} (${Math.round(u.bytes / 1024)} KB) and ${path.relative(ROOT, u.localPath)}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
