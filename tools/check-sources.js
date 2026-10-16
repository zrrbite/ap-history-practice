#!/usr/bin/env node
// Confirms that each document's excerpt really appears in the page its sourceUrl points to.
// Usage:
//   node tools/check-sources.js [--unit id] [file.json] [--mark] [--only id,id]   check unverified documents
//   node tools/check-sources.js --text <url>                                      print a page's text, for copying excerpts
// <file.json> is a document array or a research cluster {cluster, documents, poolHints}; with --unit it is
// resolved inside that unit's folder (e.g. research/cluster-a.json). With no file, each selected unit's
// research/candidates.json is checked (every unit unless --unit is given).
// --mark sets verified: true, verifiedBy: "script" on matches. The report is <file>-report.json.
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inUnit, selectUnits, takeUnit } from './load-data.js';

const DATA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const MIN_SEGMENT_WORDS = 4;
const MIN_COVERAGE = 0.8;
const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|dl|dd|dt|tr|td|th|table|h[1-6]|blockquote|section|article|header|footer|pre|hr)\b[^>]*>/gi;
const ACCENTED_ENTITY = /&([a-zA-Z])(?:acute|grave|circ|tilde|uml|cedil|ring|slash|caron);/g;
const LIGATURE_ENTITIES = { szlig: 'ss', aelig: 'ae', AElig: 'AE', oelig: 'oe', OElig: 'OE' };

const codePoint = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ');

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => codePoint(parseInt(n, 16)))
    .replace(ACCENTED_ENTITY, '$1')
    .replace(/&([a-zA-Z]+);/g, (_, name) => LIGATURE_ENTITIES[name] ?? ' ');
}

// Lowercase letters and digits separated by single spaces: punctuation, quote styles,
// accents and line breaks can't cause a false mismatch.
export function normalizeForMatch(text) {
  return text
    .replace(/\u00ad/g, '')
    .replace(/(\p{L})-[ \t]*\r?\n\s*(\p{L})/gu, '$1$2')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The parts of an excerpt that must appear verbatim: the text between "…" cuts, outside [insertions].
export function segmentsOf(excerpt) {
  return excerpt
    .split(/…|\.\s?\.\s?\.|\[[^\]]*\]/)
    .map(normalizeForMatch)
    .filter((s) => s.split(' ').length >= MIN_SEGMENT_WORDS);
}

const words = (s) => (s ? s.split(' ').length : 0);

export function checkText(excerpt, sourceText) {
  const segments = segmentsOf(excerpt);
  if (segments.length === 0) return { ok: false, missing: [], reason: `no checkable segment (each needs ${MIN_SEGMENT_WORDS}+ words)` };
  const total = words(normalizeForMatch(excerpt.replace(/\[[^\]]*\]/g, ' ')));
  const checked = segments.reduce((sum, s) => sum + words(s), 0);
  if (checked / total < MIN_COVERAGE) return { ok: false, missing: [], reason: 'too little of the excerpt can be checked; join the short fragments' };
  const haystack = ` ${normalizeForMatch(sourceText)} `;
  const missing = segments.filter((s) => !haystack.includes(` ${s} `));
  return { ok: missing.length === 0, missing };
}

export async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; unit4-source-check)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('pdf')) throw new Error('PDF: check by hand');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sniff = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? 'utf-8';
  let body;
  try {
    body = new TextDecoder(charset).decode(bytes);
  } catch {
    body = new TextDecoder('utf-8').decode(bytes);
  }
  return type.includes('text/plain') ? body : htmlToText(body);
}

export async function checkDocument(doc, pages = new Map(), fetchPage = fetchText) {
  if (doc.kind === 'table') return { status: 'manual', reason: 'tables are checked by hand' };
  if (!pages.has(doc.sourceUrl)) {
    pages.set(doc.sourceUrl, fetchPage(doc.sourceUrl).then((text) => ({ text }), (error) => ({ error: error.message })));
  }
  const page = await pages.get(doc.sourceUrl);
  if (page.error) return { status: 'fetch-failed', reason: page.error };
  const result = checkText((doc.adapted ? doc.original : doc.text) ?? '', page.text);
  if (result.ok) return { status: 'match' };
  return { status: 'mismatch', ...(result.reason ? { reason: result.reason } : {}), missing: result.missing };
}

export async function checkFile(file, { mark = false, only = null, fetchPage = fetchText } = {}) {
  const json = JSON.parse(await readFile(file, 'utf8'));
  const documents = Array.isArray(json) ? json : json.documents;
  const pages = new Map();
  const report = [];
  for (const doc of documents) {
    if (only ? !only.has(doc.id) : doc.verified === true || doc.dropped) continue;
    const result = await checkDocument(doc, pages, fetchPage);
    report.push({ id: doc.id, sourceUrl: doc.sourceUrl, ...result });
    if (mark && result.status === 'match') Object.assign(doc, { verified: true, verifiedBy: 'script' });
  }
  const reportFile = file.replace(/\.json$/, '-report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  if (mark) await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  return { reportFile, report };
}

async function main(argv) {
  if (argv[0] === '--text') {
    console.log(await fetchText(argv[1]));
    return;
  }
  const { unit, args } = takeUnit(argv);
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? new Set((args[onlyAt + 1] ?? '').split(',')) : null;
  const mark = args.includes('--mark');
  const files = args.filter((a, i) => !a.startsWith('--') && !(onlyAt >= 0 && i === onlyAt + 1));
  const jobs = [];
  if (files.length > 0) {
    const base = unit ? (await selectUnits(DATA_ROOT, unit))[0].dir : process.cwd();
    for (const file of files) jobs.push({ base, file: inUnit(base, file) });
  } else {
    for (const { dir } of await selectUnits(DATA_ROOT, unit)) {
      const file = path.join(dir, 'research', 'candidates.json');
      if (await access(file).then(() => true, () => false)) jobs.push({ base: dir, file });
    }
  }
  if (jobs.length === 0) throw new Error('usage: node tools/check-sources.js [--unit id] [file.json] [--mark] [--only id,id] | --text <url>');
  for (const { base, file } of jobs) {
    const { reportFile, report } = await checkFile(file, { mark, only });
    const count = (status) => report.filter((r) => r.status === status).length;
    console.log(`match ${count('match')}, mismatch ${count('mismatch')}, fetch-failed ${count('fetch-failed')}, manual ${count('manual')} → ${path.relative(base, reportFile)}`);
    for (const r of report.filter((x) => x.status !== 'match')) {
      console.log(`  ${r.status}  ${r.id}  ${r.reason ?? ''}${r.missing?.length ? ` missing: ${r.missing.map((m) => `“${m}”`).join(' | ')}` : ''}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
