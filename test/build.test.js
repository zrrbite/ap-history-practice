import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, stripModuleSyntax, jsonForHtml } from '../tools/build.js';
import { makeData, writeDataDir } from './helpers/fixture.js';

const BANK = /<script type="application\/json" id="bank">([\s\S]*?)<\/script>/;
const SCRIPT = /<script type="module">([\s\S]*?)<\/script>/;

async function buildFixture(mutate = () => {}, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'unit4-build-'));
  const data = makeData();
  mutate(data);
  await writeDataDir(path.join(dir, 'data'), data);
  const result = await build({ dataDir: path.join(dir, 'data'), outDir: path.join(dir, 'dist'), ...options });
  return { dir, index: await readFile(result.indexPath, 'utf8'), local: await readFile(result.localPath, 'utf8') };
}

function extract(html, pattern) {
  const match = pattern.exec(html);
  assert.ok(match, `missing ${pattern}`);
  return match[1];
}

test('index.html is a page body for publishing: title first, no document skeleton, no markers left', async () => {
  const { index } = await buildFixture();
  assert.match(index, /^<title>Unit 4 DBQ Practice<\/title>/);
  assert.doesNotMatch(index, /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
  for (const marker of ['/*STYLES*/', '/*SCRIPT*/', '__BANK__']) assert.ok(!index.includes(marker), marker);
});

test('local.html wraps the same page in a full document', async () => {
  const { index, local } = await buildFixture();
  assert.match(local, /^<!doctype html>/);
  assert.ok(local.includes(index));
});

test('the bundled script is valid module code with no imports, exports or name clashes', async () => {
  const { dir, index } = await buildFixture();
  const script = extract(index, SCRIPT);
  assert.doesNotMatch(script, /^\s*(?:import|export)\b/m);
  const file = path.join(dir, 'bundle.mjs');
  await writeFile(file, script);
  execFileSync(process.execPath, ['--check', file]);
});

test('source text with HTML, $-patterns and line separators survives the build verbatim', async () => {
  const tricky = `He wrote </script><b>bold</b> & "$&" $' $1 \u2028 Bartolomé ${'word '.repeat(70)}`;
  const { index } = await buildFixture((d) => { d.documents[0].text = tricky; });
  assert.ok(!index.includes('</script><b>'), 'a closing script tag inside data is escaped');
  const bank = JSON.parse(extract(index, BANK));
  assert.equal(bank.documents.find((x) => x.id === 'doc-1').text, tricky);
});

test('the runtime bank drops verification fields and carries the share base', async () => {
  const { index } = await buildFixture((d) => {
    Object.assign(d.documents[0], { adapted: true, original: 'orig', sourceLine: `${d.documents[0].sourceLine} (adapted)` });
  }, { shareBase: 'https://claude.ai/artifact/abc' });
  const bank = JSON.parse(extract(index, BANK));
  assert.equal(bank.config.shareBase, 'https://claude.ai/artifact/abc');
  const doc = bank.documents.find((x) => x.id === 'doc-1');
  for (const key of ['original', 'verified', 'verifiedBy', 'verifiedNote']) assert.ok(!(key in doc), key);
});

test('the build refuses an invalid bank and lists the problems', async () => {
  await assert.rejects(buildFixture((d) => { d.documents[0].verified = false; }), /1 problem\(s\)[\s\S]*not verified/);
});

test('stripModuleSyntax removes local imports and export keywords, and rejects anything else', () => {
  const src = "import { a, b } from './sampler.js';\nexport function f() {}\nexport const X = 1;\nconst y = 2;\n";
  assert.equal(stripModuleSyntax(src, 'x.js'), '\nfunction f() {}\nconst X = 1;\nconst y = 2;\n');
  assert.throws(() => stripModuleSyntax("import x from 'lib';\n", 'x.js'), /x\.js/);
  assert.throws(() => stripModuleSyntax('export default 1;\n', 'x.js'), /x\.js/);
});

test('jsonForHtml escapes < and the JavaScript line separators', () => {
  assert.equal(jsonForHtml({ a: '</script>\u2028\u2029' }), '{"a":"\\u003c/script>\\u2028\\u2029"}');
});

test('app.js never writes HTML strings into the page', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});
