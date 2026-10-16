#!/usr/bin/env node
// Builds the single-file page: validates the bank, then inlines styles, scripts and data.
// dist/index.html is what gets published (the artifact host adds the document skeleton);
// dist/local.html is the same page in a full HTML document, for opening from disk and printing.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadData } from './load-data.js';
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

export function runtimeBank(data, shareBase) {
  const documents = data.documents.map(({ original, verified, verifiedBy, verifiedNote, ...shown }) => shown);
  return { config: { shareBase: shareBase ?? null }, documents, dbqs: data.dbqs, saqs: data.saqs, mcqs: data.mcqs };
}

function fill(template, marker, value) {
  if (!template.includes(marker)) throw new Error(`src/index.html is missing ${marker}`);
  return template.replace(marker, () => value); // a function, so "$&" in the value stays literal
}

export async function build({ dataDir = path.join(ROOT, 'data', 'unit-4'), outDir = path.join(ROOT, 'dist'), shareBase = null } = {}) {
  const data = await loadData(dataDir);
  const errors = validate(data);
  if (errors.length) throw new Error(`The question bank has ${errors.length} problem(s):\n${errors.join('\n')}`);
  const src = (name) => readFile(path.join(ROOT, 'src', name), 'utf8');
  const parts = await Promise.all(MODULES.map(async (name) => `// ${name}\n${stripModuleSyntax(await src(name), name)}`));
  const script = parts.join('\n');
  if (/<\/script/i.test(script)) throw new Error('src/*.js must not contain "</script"');
  let page = await src('index.html');
  page = fill(page, '/*STYLES*/', await src('styles.css'));
  page = fill(page, '/*SCRIPT*/', script);
  page = fill(page, '__BANK__', jsonForHtml(runtimeBank(data, shareBase ?? data.unit.shareBase)));
  const local = [
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
  await mkdir(outDir, { recursive: true });
  const indexPath = path.join(outDir, 'index.html');
  const localPath = path.join(outDir, 'local.html');
  await writeFile(indexPath, page);
  await writeFile(localPath, local);
  return { indexPath, localPath, bytes: Buffer.byteLength(page) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { indexPath, localPath, bytes } = await build();
    console.log(`Wrote ${path.relative(ROOT, indexPath)} (${Math.round(bytes / 1024)} KB) and ${path.relative(ROOT, localPath)}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
