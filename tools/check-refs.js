#!/usr/bin/env node
// Confirms that every "Check it" reference loads and is the article it claims to be.
// Usage:
//   node tools/check-refs.js                         check dbqs.json, saqs.json and mcqs.json of every unit
//   node tools/check-refs.js --unit unit-5           check one unit
//   node tools/check-refs.js [--unit id] <file.json> ...  check these arrays of DBQs, SAQs or MCQ sets (inside the unit's folder with --unit)
//   node tools/check-refs.js --title <url>           print the confirmed page title for a reference URL
// Wikipedia pages are fetched directly. Britannica refuses scripted requests, so a Britannica link
// counts as confirmed only when the Wayback Machine holds a 200 capture of it with a matching title.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inUnit, selectUnits, takeUnit } from './load-data.js';
import { htmlToText, normalizeForMatch } from './check-sources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BRITANNICA = /^https:\/\/www\.britannica\.com\//;

export function collectRefs(bank) {
  const refs = [];
  for (const q of bank.dbqs ?? []) {
    for (const kind of ['contextualization', 'outsideEvidence']) {
      (q.notes?.[kind] ?? []).forEach((note, i) => refs.push({ where: `dbq ${q.id} ${kind} ${i + 1}`, ...note.ref }));
    }
  }
  for (const s of bank.saqs ?? []) (s.refs ?? []).forEach((ref, i) => refs.push({ where: `saq ${s.id} ref ${i + 1}`, ...ref }));
  for (const m of bank.mcqs ?? []) (m.questions ?? []).forEach((q, i) => refs.push({ where: `mcq ${m.id} question ${i + 1}`, ...q.ref }));
  return refs;
}

export function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToText(match[1]).replace(/\s+/g, ' ').trim() : '';
}

export function titleMatches(refTitle, title) {
  return ` ${normalizeForMatch(title)} `.includes(` ${normalizeForMatch(refTitle)} `);
}

const cdxUrl = (url) =>
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&filter=statuscode:200&limit=-1&fl=timestamp,original&output=json`;

const isTransient = (page) => page.status === 0 || page.status === 429 || page.status >= 500;

// Calls the fetcher until `again` is false or the attempts run out, waiting between tries.
// A thrown error becomes {status: 0, error}. Returns the last answer.
async function patientFetch(url, fetcher, { retries, wait }, again = isTransient) {
  for (let attempt = 1; ; attempt++) {
    let page;
    try {
      page = await fetcher(url);
    } catch (error) {
      page = { status: 0, text: '', error: error.message };
    }
    if (!again(page) || attempt >= retries) return page;
    await wait(attempt * 2000);
  }
}

// The parsed Wayback index, or null when the answer is not a usable 200 JSON array.
function parseIndex(page) {
  if (page.status !== 200) return null;
  try {
    return JSON.parse(page.text);
  } catch {
    // The index answers with an HTML "Temporarily Offline" page when it is overloaded.
    return null;
  }
}

// Finds the page title behind a reference URL: {title, via} or {reason}.
export async function resolveTitle(url, fetcher, { retries = 3, wait = sleep } = {}) {
  const options = { retries, wait };
  if (!BRITANNICA.test(url)) {
    const page = await patientFetch(url, fetcher, options);
    if (page.error) return { reason: `fetch failed: ${page.error}` };
    return page.status === 200 ? { via: 'direct', title: pageTitle(page.text) } : { reason: `HTTP ${page.status}` };
  }
  const index = await patientFetch(cdxUrl(url), fetcher, options, (page) => parseIndex(page) === null);
  const rows = parseIndex(index);
  if (rows === null) return { reason: 'Wayback index unavailable; try again later' };
  const captures = rows.slice(1);
  if (captures.length === 0) return { reason: 'no Wayback capture; use a Wikipedia link instead' };
  const [timestamp, original] = captures[captures.length - 1];
  const snapshot = await patientFetch(`https://web.archive.org/web/${timestamp}id_/${original}`, fetcher, options);
  if (snapshot.error) return { reason: `fetch failed: ${snapshot.error}` };
  return snapshot.status === 200 ? { via: 'wayback', title: pageTitle(snapshot.text) } : { reason: `Wayback capture HTTP ${snapshot.status}` };
}

export async function checkRef(ref, fetcher, options) {
  const found = await resolveTitle(ref.url, fetcher, options);
  if (found.reason) return { ok: false, reason: found.reason };
  if (!titleMatches(ref.title, found.title)) return { ok: false, reason: `page title is "${found.title}", which does not contain "${ref.title}"` };
  return { ok: true, via: found.via, title: found.title };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; unit4-reference-check)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, text: await response.text() };
}

export async function loadBank(dir, files) {
  if (files.length === 0) {
    const read = async (name) => JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'));
    return { dbqs: await read('dbqs'), saqs: await read('saqs'), mcqs: await read('mcqs') };
  }
  const bank = { dbqs: [], saqs: [], mcqs: [] };
  for (const file of files) {
    for (const item of JSON.parse(await readFile(file, 'utf8'))) {
      if (item.pool) bank.dbqs.push(item);
      else if (item.parts) bank.saqs.push(item);
      else if (item.questions) bank.mcqs.push(item);
      else throw new Error(`${file}: ${item.id ?? 'an item'} is not a DBQ, SAQ or MCQ set`);
    }
  }
  return bank;
}

async function main(argv) {
  const fetcher = fetchPage;
  if (argv[0] === '--title') {
    const found = await resolveTitle(argv[1], fetcher);
    console.log(found.reason ? `not confirmed: ${found.reason}` : `${found.title}  (via ${found.via})`);
    return;
  }
  const { unit, args } = takeUnit(argv);
  const targets = args.length > 0 && unit === null
    ? [{ id: 'files', dir: process.cwd() }]
    : await selectUnits(path.join(ROOT, 'data'), unit);
  const results = new Map();
  let total = 0;
  let failed = 0;
  for (const { id, dir } of targets) {
    const refs = collectRefs(await loadBank(dir, args.map((file) => inUnit(dir, file))));
    let unitFailed = 0;
    for (const ref of refs) {
      const key = `${ref.url}\n${ref.title}`;
      if (!results.has(key)) results.set(key, await checkRef(ref, fetcher));
      const result = results.get(key);
      if (!result.ok) {
        unitFailed++;
        console.log(`FAIL  ${id}  ${ref.where}  ${ref.url}  ${result.reason}`);
      }
    }
    console.log(`${id}: ${refs.length - unitFailed} of ${refs.length} references confirmed.`);
    total += refs.length;
    failed += unitFailed;
  }
  console.log(`${total - failed} of ${total} references confirmed (${results.size} distinct links).`);
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
