import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, stripModuleSyntax, jsonForHtml } from '../tools/build.js';
import { escapeHtml, fill } from '../tools/html.js';
import { makeData, writeDataDir } from './helpers/fixture.js';

const BANK = /<script type="application\/json" id="bank">([\s\S]*?)<\/script>/;
const SCRIPT = /<script type="module">([\s\S]*?)<\/script>/;

// Builds a fixture data root holding the given units; `mutate` edits the first unit's data before it is written.
async function buildFixture(mutate = () => {}, { numbers = [4], only = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'build-'));
  for (const number of numbers) {
    const data = makeData(number);
    if (number === numbers[0]) mutate(data);
    await writeDataDir(path.join(dir, 'data', `unit-${number}`), data);
  }
  const result = await build({ dataRoot: path.join(dir, 'data'), outDir: path.join(dir, 'dist'), only });
  const first = result.units[0];
  return { dir, result, index: await readFile(first.indexPath, 'utf8'), local: await readFile(first.localPath, 'utf8') };
}

function extract(html, pattern) {
  const match = pattern.exec(html);
  assert.ok(match, `missing ${pattern}`);
  return match[1];
}

test("Unit 4's page keeps its title, eyebrow, heading and sample code, and is a body fragment", async () => {
  const { index } = await buildFixture();
  assert.match(index, /^<title>Unit 4 DBQ Practice<\/title>/);
  assert.ok(index.includes('<p class="eyebrow">AP World History: Modern · AMSCO Unit 4 · c. 1450–1750</p>'));
  assert.ok(index.includes('<h1>Transoceanic Interconnections</h1>'));
  assert.ok(index.includes('placeholder="dbq.silver-trade.k2x9q1"'));
  assert.doesNotMatch(index, /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
  for (const marker of ['/*STYLES*/', '/*SCRIPT*/', '__BANK__', '__UNIT_NUMBER__', '__UNIT_TITLE__', '__UNIT_PERIOD__', '__EXAMPLE_CODE__']) {
    assert.ok(!index.includes(marker), marker);
  }
});

test("Unit 5's page takes its title, period, heading and sample code from its unit.json", async () => {
  const { index } = await buildFixture(() => {}, { numbers: [5] });
  assert.match(index, /^<title>Unit 5 DBQ Practice<\/title>/);
  assert.ok(index.includes('<p class="eyebrow">AP World History: Modern · AMSCO Unit 5 · c. 1750–1900</p>'));
  assert.ok(index.includes('<h1>Revolutions</h1>'));
  assert.ok(index.includes('placeholder="dbq.enlightenment-revolutions.k2x9q1"'));
});

test('the build writes one folder per unit, and --only builds just that unit', async () => {
  const { dir, result } = await buildFixture(() => {}, { numbers: [4, 5] });
  assert.deepEqual(result.units.map((u) => u.id), ['unit-4', 'unit-5']);
  for (const id of ['unit-4', 'unit-5']) {
    assert.ok(existsSync(path.join(dir, 'dist', id, 'index.html')), `${id}/index.html`);
    assert.ok(existsSync(path.join(dir, 'dist', id, 'local.html')), `${id}/local.html`);
  }
  const single = await buildFixture(() => {}, { numbers: [4, 5], only: 'unit-5' });
  assert.deepEqual(single.result.units.map((u) => u.id), ['unit-5']);
  assert.ok(!existsSync(path.join(single.dir, 'dist', 'unit-4')));
});

test('a unit title with HTML characters is escaped in the heading', async () => {
  const { index } = await buildFixture((d) => { d.unit.title = 'Wars & <Revolutions> "now"'; });
  assert.ok(index.includes('<h1>Wars &amp; &lt;Revolutions&gt; &quot;now&quot;</h1>'));
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

test("the runtime bank carries the unit, takes the share base from unit.json and drops verification fields", async () => {
  const { index } = await buildFixture((d) => {
    d.unit.shareBase = 'https://claude.ai/artifact/abc';
    Object.assign(d.documents[0], { adapted: true, original: 'orig', sourceLine: `${d.documents[0].sourceLine} (adapted)` });
  });
  const bank = JSON.parse(extract(index, BANK));
  assert.equal(bank.config.shareBase, 'https://claude.ai/artifact/abc');
  assert.deepEqual(bank.unit, {
    id: 'unit-4', number: 4, title: 'Transoceanic Interconnections', period: 'c. 1450–1750',
    topics: makeData().unit.topics, exampleCode: 'dbq.silver-trade.k2x9q1',
  });
  assert.deepEqual(Object.keys(bank.unit.topics), Object.keys(makeData().unit.topics), 'chip order is the key order');
  const doc = bank.documents.find((x) => x.id === 'doc-1');
  for (const key of ['original', 'verified', 'verifiedBy', 'verifiedNote']) assert.ok(!(key in doc), key);
});

test('the build refuses an invalid bank and says which unit and what is wrong', async () => {
  await assert.rejects(buildFixture((d) => { d.documents[0].verified = false; }), /unit-4: the question bank has 1 problem\(s\)[\s\S]*not verified/);
  await assert.rejects(buildFixture((d) => { d.unit.topics = {}; }), /unit-4: the question bank has \d+ problem\(s\)[\s\S]*unit\.json: topics/);
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

test('escapeHtml escapes & < > and quotes; fill replaces every occurrence and keeps $-patterns literal', () => {
  assert.equal(escapeHtml('a & b < c > "d"'), 'a &amp; b &lt; c &gt; &quot;d&quot;');
  assert.equal(fill('x __M__ y __M__', '__M__', "$& $'"), "x $& $' y $& $'");
  assert.throws(() => fill('nothing', '__M__', 'v'), /missing __M__/);
});

test('app.js never writes HTML strings into the page, and has no topic labels of its own', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(app, /Technological innovations|Columbian Exchange|Maritime empires/);
  assert.match(app, /bank\.unit\.topics/);
});
