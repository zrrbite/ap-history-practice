import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from '../tools/build.js';
import { FORWARD_SCRIPT, landingPage, unitCard } from '../tools/landing.js';
import { makeData, makeUnit, writeDataDir } from './helpers/fixture.js';

const TEMPLATE = '<!doctype html><style>/*STYLES*/</style><ul>__UNITS__</ul><script>/*FORWARD*/</script>';
const counts = { documents: 168, dbqs: 10, saqs: 20, mcqs: 15 };

// Runs the landing page's script against a fake browser and returns the URLs it navigated to.
function runForward({ protocol = 'https:', hash = '', anchors = [] }) {
  const navigated = [];
  const location = { protocol, hash, replace: (url) => navigated.push(url) };
  vm.runInNewContext(FORWARD_SCRIPT, { location, document: { querySelectorAll: () => anchors } });
  return navigated;
}

function fakeAnchor(unit) {
  const attributes = { 'data-unit': unit };
  return { attributes, getAttribute: (name) => attributes[name], setAttribute: (name, value) => { attributes[name] = value; } };
}

test('the landing page lists each unit with its period, counts and a link to its folder', () => {
  const html = landingPage(TEMPLATE, 'body{}', [
    { unit: makeUnit(4), counts },
    { unit: makeUnit(5), counts: { documents: 1, dbqs: 1, saqs: 1, mcqs: 1 } },
  ]);
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes('href="unit-4/" data-unit="unit-4"'));
  assert.ok(html.includes('href="unit-5/" data-unit="unit-5"'));
  assert.ok(html.includes('Unit 4 · Transoceanic Interconnections'));
  assert.ok(html.includes('c. 1450–1750'));
  assert.ok(html.includes('10 DBQs · 20 short-answer questions · 15 multiple-choice sets · 168 documents'));
  assert.ok(html.includes('1 DBQ · 1 short-answer question · 1 multiple-choice set · 1 document'));
  for (const marker of ['/*STYLES*/', '__UNITS__', '/*FORWARD*/']) assert.ok(!html.includes(marker), marker);
});

test('a unit title with HTML characters is escaped on the landing page', () => {
  const card = unitCard({ unit: makeUnit(5, { title: 'Wars & <Revolutions>' }), counts });
  assert.ok(card.includes('Wars &amp; &lt;Revolutions&gt;'));
  assert.ok(!card.includes('<Revolutions>'));
});

test('a #code on the landing page forwards to Unit 4', () => {
  assert.deepEqual(runForward({ hash: '#dbq.silver-trade.1' }), ['unit-4/#dbq.silver-trade.1']);
  assert.deepEqual(runForward({ hash: '#saq.henry-navigator-motives' }), ['unit-4/#saq.henry-navigator-motives']);
});

test('from disk the forward goes to unit-4/local.html and the links point at local.html', () => {
  const anchors = [fakeAnchor('unit-4'), fakeAnchor('unit-5')];
  assert.deepEqual(runForward({ protocol: 'file:', hash: '#dbq.silver-trade.1', anchors }), ['unit-4/local.html#dbq.silver-trade.1']);
  assert.equal(anchors[0].attributes.href, 'unit-4/local.html');
  assert.equal(anchors[1].attributes.href, 'unit-5/local.html');
  const served = [fakeAnchor('unit-5')];
  runForward({ protocol: 'https:', anchors: served });
  assert.equal(served[0].attributes.href, 'unit-5/');
});

test('an empty or lone # stays on the index, and a hash can never choose the destination', () => {
  assert.deepEqual(runForward({ hash: '' }), []);
  assert.deepEqual(runForward({ hash: '#' }), []);
  assert.deepEqual(runForward({ hash: '#javascript:alert(1)' }), ['unit-4/#javascript:alert(1)']);
  assert.deepEqual(runForward({ hash: '#//evil.example/x' }), ['unit-4/#//evil.example/x']);
});

test('the build writes the landing page next to the unit folders, but only when it builds every unit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'landing-'));
  for (const number of [4, 5]) await writeDataDir(path.join(dir, 'data', `unit-${number}`), makeData(number));
  const all = await build({ dataRoot: path.join(dir, 'data'), outDir: path.join(dir, 'dist') });
  assert.equal(all.landingPath, path.join(dir, 'dist', 'index.html'));
  const html = await readFile(all.landingPath, 'utf8');
  assert.ok(html.includes('data-unit="unit-4"') && html.includes('data-unit="unit-5"'));
  assert.ok(html.includes('Unit 5 · Revolutions'));
  assert.ok(html.includes('10 documents'), 'counts come from the unit bank');
  const out = path.join(dir, 'dist-one');
  const one = await build({ dataRoot: path.join(dir, 'data'), outDir: out, only: 'unit-5' });
  assert.equal(one.landingPath, null);
  assert.ok(!existsSync(path.join(out, 'index.html')));
});
