import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectRefs, pageTitle, titleMatches, checkRef, loadBank, paceWayback } from '../tools/check-refs.js';
import { makeData, writeDataDir } from './helpers/fixture.js';

const WIKI = { title: "Mit'a", url: 'https://en.wikipedia.org/wiki/Mita_(Inca)' };
const BRIT = { title: 'Encomienda', url: 'https://www.britannica.com/topic/encomienda' };
const CDX = /^https:\/\/web\.archive\.org\/cdx\/search\/cdx\?/;
const noWait = async () => {};

// A fake fetcher: routes is [pattern, response] pairs, each response {status, text} or a function of the call count.
function fetcher(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    for (const [pattern, response] of routes) {
      if (pattern.test(url)) return typeof response === 'function' ? response(calls.filter((u) => pattern.test(u)).length) : response;
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetch, calls };
}

test('collectRefs lists every reference in DBQ notes, SAQs and multiple-choice questions', () => {
  const refs = collectRefs(makeData());
  assert.deepEqual(refs.map((r) => r.where), [
    'dbq test-prompt contextualization 1',
    'dbq test-prompt outsideEvidence 1',
    'saq test-saq ref 1',
    'mcq test-mcq question 1',
    'mcq test-mcq question 2',
    'mcq test-mcq question 3',
  ]);
  assert.equal(refs[1].url, WIKI.url);
});

test('pageTitle reads and decodes the HTML title', () => {
  assert.equal(pageTitle('<html><head><title>Mit&#39;a - Wikipedia</title></head></html>'), "Mit'a - Wikipedia");
  assert.equal(pageTitle('<p>no title</p>'), '');
});

test('titleMatches needs the whole reference title, on word boundaries', () => {
  assert.equal(titleMatches("Mit'a", "Mit'a - Wikipedia"), true);
  assert.equal(titleMatches('Encomienda', 'Encomienda | Spanish colonial system | Britannica'), true);
  assert.equal(titleMatches('Treaty of Tordesillas', 'Tordesillas - Wikipedia'), false);
  assert.equal(titleMatches('Mita', 'Mitad - Wikipedia'), false);
});

test('checkRef confirms a Wikipedia link by fetching it directly', async () => {
  const { fetch } = fetcher([[/wikipedia/, { status: 200, text: '<title>Mit&#39;a - Wikipedia</title>' }]]);
  assert.deepEqual(await checkRef(WIKI, fetch, { wait: noWait }), { ok: true, via: 'direct', title: "Mit'a - Wikipedia" });
});

test('checkRef reports a Wikipedia link that does not load', async () => {
  const { fetch } = fetcher([[/wikipedia/, { status: 404, text: '' }]]);
  const result = await checkRef(WIKI, fetch, { wait: noWait });
  assert.equal(result.ok, false);
  assert.match(result.reason, /HTTP 404/);
});

test('checkRef reports a page whose title does not match the reference', async () => {
  const { fetch } = fetcher([[/wikipedia/, { status: 200, text: '<title>Inca Empire - Wikipedia</title>' }]]);
  const result = await checkRef(WIKI, fetch, { wait: noWait });
  assert.equal(result.ok, false);
  assert.match(result.reason, /page title is "Inca Empire - Wikipedia"/);
});

test('checkRef confirms a Britannica link through a Wayback capture, never fetching Britannica itself', async () => {
  const { fetch, calls } = fetcher([
    [CDX, { status: 200, text: '[["timestamp","original"],["20261006053551","https://www.britannica.com/topic/encomienda"]]' }],
    [/web\.archive\.org\/web\/20261006053551id_\//, { status: 200, text: '<title>Encomienda | Spanish colonial system | Britannica</title>' }],
  ]);
  const result = await checkRef(BRIT, fetch, { wait: noWait });
  assert.deepEqual(result, { ok: true, via: 'wayback', title: 'Encomienda | Spanish colonial system | Britannica' });
  assert.ok(calls.every((url) => !url.startsWith('https://www.britannica.com')));
});

test('checkRef rejects a Britannica link with no Wayback capture and says to use Wikipedia', async () => {
  const { fetch } = fetcher([[CDX, { status: 200, text: '[]' }]]);
  const result = await checkRef(BRIT, fetch, { wait: noWait });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no Wayback capture; use a Wikipedia link instead/);
});

test('checkRef retries while the Wayback index is temporarily offline', async () => {
  const offline = { status: 200, text: '<html><title>Internet Archive: Temporarily Offline</title></html>' };
  const { fetch } = fetcher([
    [CDX, (n) => (n < 3 ? offline : { status: 200, text: '[["timestamp","original"],["20260101000000","https://www.britannica.com/topic/encomienda"]]' })],
    [/id_\//, { status: 200, text: '<title>Encomienda | Britannica</title>' }],
  ]);
  assert.equal((await checkRef(BRIT, fetch, { wait: noWait })).ok, true);
});

test('checkRef gives up when the Wayback index stays offline', async () => {
  const { fetch } = fetcher([[CDX, { status: 503, text: 'offline' }]]);
  const result = await checkRef(BRIT, fetch, { wait: noWait, retries: 2 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Wayback index unavailable/);
});

test('checkRef reports a Wikipedia fetch that keeps timing out instead of throwing', async () => {
  const { fetch } = fetcher([[/wikipedia/, () => { throw new Error('The operation was aborted due to timeout'); }]]);
  const result = await checkRef(WIKI, fetch, { wait: noWait });
  assert.equal(result.ok, false);
  assert.match(result.reason, /fetch failed: The operation was aborted due to timeout/);
});

test('checkRef retries a Wikipedia page that answers 429', async () => {
  const { fetch } = fetcher([[/wikipedia/, (n) => (n < 2 ? { status: 429, text: 'slow down' } : { status: 200, text: '<title>Mit&#39;a - Wikipedia</title>' })]]);
  assert.equal((await checkRef(WIKI, fetch, { wait: noWait })).ok, true);
});

test('checkRef retries the Wayback index when the request times out', async () => {
  const { fetch } = fetcher([
    [CDX, (n) => { if (n < 2) throw new Error('The operation was aborted due to timeout'); return { status: 200, text: '[["timestamp","original"],["20261006053551","https://www.britannica.com/topic/encomienda"]]' }; }],
    [/id_\//, { status: 200, text: '<title>Encomienda | Spanish colonial system | Britannica</title>' }],
  ]);
  assert.equal((await checkRef(BRIT, fetch, { wait: noWait })).ok, true);
});

test('checkRef retries a Wayback snapshot that times out or answers 503', async () => {
  const { fetch } = fetcher([
    [CDX, { status: 200, text: '[["timestamp","original"],["20261006053551","https://www.britannica.com/topic/encomienda"]]' }],
    [/id_\//, (n) => {
      if (n === 1) throw new Error('The operation was aborted due to timeout');
      if (n === 2) return { status: 503, text: 'unavailable' };
      return { status: 200, text: '<title>Encomienda | Spanish colonial system | Britannica</title>' };
    }],
  ]);
  assert.equal((await checkRef(BRIT, fetch, { wait: noWait })).ok, true);
});

test('loadBank reads a unit folder, or sorts the given files into DBQs, SAQs and MCQ sets', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-refs-'));
  const data = makeData();
  await writeDataDir(dir, data);
  const bank = await loadBank(dir, []);
  assert.deepEqual([bank.dbqs.length, bank.saqs.length, bank.mcqs.length], [1, 1, 1]);
  const mixed = path.join(dir, 'mixed.json');
  await writeFile(mixed, JSON.stringify([data.dbqs[0], data.saqs[0], data.mcqs[0]]));
  const fromFile = await loadBank(dir, [mixed]);
  assert.deepEqual([fromFile.dbqs.length, fromFile.saqs.length, fromFile.mcqs.length], [1, 1, 1]);
  const junk = path.join(dir, 'junk.json');
  await writeFile(junk, JSON.stringify([{ id: 'x' }]));
  await assert.rejects(loadBank(dir, [junk]), /x is not a DBQ, SAQ or MCQ set/);
});

// A fake clock: wait() advances it, and the inner fetcher records when each request started.
function clocked() {
  let clock = 0;
  const started = [];
  return {
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    started,
    inner: async (url) => { started.push([url, clock]); return { status: 200, text: '' }; },
  };
}

test('paceWayback starts Wayback requests at least a second apart and does not slow other hosts', async () => {
  const c = clocked();
  const paced = paceWayback(c.inner, { gapMs: 1000, now: c.now, wait: c.wait });
  await paced('https://web.archive.org/cdx/search/cdx?url=a');
  await paced('https://web.archive.org/web/1id_/https://www.britannica.com/topic/a');
  await paced('https://en.wikipedia.org/wiki/Mita_(Inca)');
  await paced('https://web.archive.org/cdx/search/cdx?url=b');
  assert.deepEqual(c.started.map(([, at]) => at), [0, 1000, 1000, 2000]);
});

test('paceWayback also spaces retries: a Britannica check that retries never goes faster than one request a second', async () => {
  const c = clocked();
  const offline = { status: 200, text: '<title>Internet Archive: Temporarily Offline</title>' };
  const real = fetcher([
    [CDX, (n) => (n < 3 ? offline : { status: 200, text: '[["timestamp","original"],["20261006053551","https://www.britannica.com/topic/encomienda"]]' })],
    [/id_\//, { status: 200, text: '<title>Encomienda | Spanish colonial system | Britannica</title>' }],
  ]);
  const paced = paceWayback(async (url) => { c.started.push([url, c.now()]); return real.fetch(url); }, { gapMs: 1000, now: c.now, wait: c.wait });
  const result = await checkRef(BRIT, paced, { wait: noWait });
  assert.equal(result.ok, true);
  const times = c.started.map(([, at]) => at);
  assert.equal(times.length, 4, 'three index requests and one capture');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1000, `gap before request ${i + 1}: ${times.join(', ')}`);
});
