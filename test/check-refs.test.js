import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRefs, pageTitle, titleMatches, checkRef } from '../tools/check-refs.js';
import { makeData } from './helpers/fixture.js';

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
