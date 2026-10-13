#!/usr/bin/env node
// Content rules for the question bank. The build refuses to run while any rule fails.
// Usage: node tools/validate.js [--release]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { drawDbq } from '../src/sampler.js';
import { loadData } from './load-data.js';

export const TOPICS = ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8'];
export const RELEASE_MINIMUMS = { documents: 60, dbqs: 10, saqs: 18, mcqs: 13 };
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEEDS_CHECKED = 1000;
const TEXT_NOTES = ['thesis', 'complexity'];
const REFERENCED_NOTES = ['contextualization', 'outsideEvidence'];
const REF_URL = /^https:\/\/(?:www\.britannica\.com\/|en\.wikipedia\.org\/wiki\/)\S+$/;

export function wordCount(text) {
  return text.replace(/…/g, ' ').split(/\s+/).filter(Boolean).length;
}

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

// A reference students can check an answer against: Britannica first, English Wikipedia as fallback.
function refProblem(ref) {
  if (!ref || typeof ref !== 'object' || !nonEmpty(ref.title) || typeof ref.url !== 'string') return 'needs a ref with a title and url';
  if (!REF_URL.test(ref.url)) return 'ref must link to britannica.com or en.wikipedia.org/wiki';
  return null;
}

export function validate(data, { release = false } = {}) {
  const errors = [];
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  for (const name of ['documents', 'dbqs', 'saqs', 'mcqs']) {
    if (!Array.isArray(data[name])) fail(name, 'must be a JSON array');
  }
  if (errors.length) return errors;
  const docsById = checkDocuments(data.documents, fail);
  checkDbqs(data.dbqs, docsById, fail);
  checkSaqs(data.saqs, docsById, fail);
  checkMcqs(data.mcqs, docsById, fail);
  if (release) checkRelease(data, fail);
  return errors;
}

function checkId(id, seen, fail) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    fail('id must be lowercase letters and digits joined by single hyphens');
    return false;
  }
  if (seen.has(id)) {
    fail('duplicate id');
    return false;
  }
  seen.add(id);
  return true;
}

function checkTopics(topics, fail) {
  if (!Array.isArray(topics) || topics.length === 0) return fail('topics must list at least one of 4.1–4.8');
  const unknown = topics.filter((t) => !TOPICS.includes(t));
  if (unknown.length) fail(`unknown topics ${unknown.join(', ')}`);
}

function checkDocuments(documents, fail) {
  const docsById = new Map();
  const seen = new Set();
  for (const d of documents) {
    const local = (message) => fail(`document ${d.id ?? '(no id)'}`, message);
    if (checkId(d.id, seen, local)) docsById.set(d.id, d);
    if (typeof d.authorKey !== 'string' || !ID_PATTERN.test(d.authorKey)) local('authorKey must be lowercase letters and digits joined by hyphens');
    if (!nonEmpty(d.sourceLine)) local('sourceLine is required');
    if (!Number.isInteger(d.year) || d.year < 1400 || d.year > 1760) local('year must be a whole number from 1400 to 1760');
    checkTopics(d.topics, local);
    if (typeof d.sourceUrl !== 'string' || !/^https?:\/\/\S+$/.test(d.sourceUrl)) local('sourceUrl must be an http(s) link');
    if (d.translation !== null && !nonEmpty(d.translation)) local('translation must be null or a credit');
    if (d.verified !== true) local('not verified (run the source check, then promote)');
    if (d.kind === 'text') {
      if (!nonEmpty(d.text)) local('text is required');
      else {
        const n = wordCount(d.text);
        if (n < 60 || n > 200) local(`text has ${n} words; it must have 60–200`);
      }
    } else if (d.kind === 'table') {
      const t = d.table;
      if (!t || !nonEmpty(t.caption) || !Array.isArray(t.columns) || t.columns.length === 0 || !Array.isArray(t.rows) || t.rows.length === 0) {
        local('table needs a caption, columns and rows');
      } else if (t.rows.some((row) => !Array.isArray(row) || row.length !== t.columns.length)) {
        local('every table row must have one cell per column');
      }
    } else {
      local('kind must be "text" or "table"');
    }
    if (d.adapted === true) {
      if (!nonEmpty(d.original)) local('adapted documents need the verbatim original');
      if (!/\(adapted\)$/.test(d.sourceLine ?? '')) local('adapted documents must end the sourceLine with "(adapted)"');
    } else if (d.adapted !== false) {
      local('adapted must be true or false');
    }
  }
  return docsById;
}

function checkDbqs(dbqs, docsById, fail) {
  const seen = new Set();
  for (const q of dbqs) {
    let problems = 0;
    const local = (message) => {
      problems++;
      fail(`dbq ${q.id ?? '(no id)'}`, message);
    };
    checkId(q.id, seen, local);
    checkTopics(q.topics, local);
    if (!nonEmpty(q.prompt)) local('prompt is required');
    const groups = Array.isArray(q.groups) ? q.groups : [];
    if (groups.length < 2 || groups.length > 3) local('needs 2–3 groups');
    for (const g of groups) if (!nonEmpty(g.key) || !nonEmpty(g.label)) local('every group needs a key and a label');
    const groupKeys = new Set(groups.map((g) => g.key));
    const pool = Array.isArray(q.pool) ? q.pool : [];
    if (pool.length < 9 || pool.length > 12) local(`pool has ${pool.length} documents; it must have 9–12`);
    const inPool = new Set();
    for (const e of pool) {
      if (!docsById.has(e.doc)) {
        local(`pool refers to unknown document ${e.doc}`);
        continue;
      }
      if (inPool.has(e.doc)) local(`document ${e.doc} is in the pool twice`);
      inPool.add(e.doc);
      if (!groupKeys.has(e.group)) local(`document ${e.doc} has unknown group ${e.group}`);
      if (!nonEmpty(e.sourcing)) local(`document ${e.doc} needs a sourcing note`);
    }
    const authorOf = (e) => docsById.get(e.doc)?.authorKey;
    for (const g of groups) {
      const authors = new Set(pool.filter((e) => e.group === g.key && docsById.has(e.doc)).map(authorOf));
      if (authors.size < 2) local(`group ${g.key} needs documents by at least 2 different authors`);
    }
    const allAuthors = new Set(pool.filter((e) => docsById.has(e.doc)).map(authorOf));
    if (allAuthors.size < 7) local(`pool has ${allAuthors.size} different authors; it needs at least 7`);
    for (const kind of [...TEXT_NOTES, ...REFERENCED_NOTES]) {
      const notes = q.notes?.[kind];
      if (!Array.isArray(notes) || notes.length === 0) {
        local(`notes.${kind} needs at least one entry`);
        continue;
      }
      notes.forEach((note, i) => {
        if (TEXT_NOTES.includes(kind)) {
          if (!nonEmpty(note)) local(`notes.${kind} ${i + 1} must be non-empty text`);
          return;
        }
        if (!note || !nonEmpty(note.text) || !note.ref || !nonEmpty(note.ref.title)) return local(`notes.${kind} ${i + 1} needs text and a ref`);
        const problem = refProblem(note.ref);
        if (problem) local(`notes.${kind} ${i + 1}: ${problem}`);
      });
    }
    if (problems > 0) continue;
    for (let seed = 0; seed < SEEDS_CHECKED; seed++) {
      try {
        drawDbq(q, docsById, seed);
      } catch {
        local(`no balanced set of 7 for seed ${seed}; add documents or reduce author clashes`);
        break;
      }
    }
  }
}

function checkSaqs(saqs, docsById, fail) {
  const seen = new Set();
  for (const s of saqs) {
    const local = (message) => fail(`saq ${s.id ?? '(no id)'}`, message);
    checkId(s.id, seen, local);
    checkTopics(s.topics, local);
    if (!Array.isArray(s.docs) || s.docs.length > 2) local('docs must be a list of 0–2 document ids');
    else for (const id of s.docs) if (!docsById.has(id)) local(`unknown document ${id}`);
    const parts = Array.isArray(s.parts) ? s.parts : [];
    if (parts.map((p) => p.label).join() !== 'a,b,c') local('parts must be a, b and c, in that order');
    for (const p of parts) {
      if (!nonEmpty(p.task)) local(`part ${p.label} needs a task`);
      if (!Array.isArray(p.accept) || p.accept.length === 0 || !p.accept.every(nonEmpty)) local(`part ${p.label} needs at least one accepted answer`);
    }
    if (!Array.isArray(s.refs) || s.refs.length < 1 || s.refs.length > 3) local('refs needs 1–3 references');
    else s.refs.forEach((ref, i) => {
      const problem = refProblem(ref);
      if (problem) local(`ref ${i + 1}: ${problem}`);
    });
  }
}

function checkMcqs(mcqs, docsById, fail) {
  const seen = new Set();
  for (const m of mcqs) {
    const local = (message) => fail(`mcq ${m.id ?? '(no id)'}`, message);
    checkId(m.id, seen, local);
    checkTopics(m.topics, local);
    if (!docsById.has(m.doc)) local(`unknown document ${m.doc}`);
    const questions = Array.isArray(m.questions) ? m.questions : [];
    if (questions.length < 3 || questions.length > 4) local(`has ${questions.length} questions; it must have 3–4`);
    questions.forEach((q, i) => {
      const n = i + 1;
      if (!nonEmpty(q.stem)) local(`question ${n} needs a stem`);
      if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(nonEmpty)) local(`question ${n} needs exactly 4 options`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) local(`question ${n} answer must be 0–3 (A–D)`);
      if (!nonEmpty(q.explanation)) local(`question ${n} needs an explanation`);
      const problem = refProblem(q.ref);
      if (problem) local(`question ${n} ${problem}`);
    });
  }
}

function checkRelease(data, fail) {
  for (const [name, min] of Object.entries(RELEASE_MINIMUMS)) {
    if (data[name].length < min) fail('release', `${name} has ${data[name].length}; release needs at least ${min}`);
  }
  const drillTopics = new Set([...data.saqs, ...data.mcqs].flatMap((x) => x.topics ?? []));
  for (const t of TOPICS) if (!drillTopics.has(t)) fail('release', `no drill covers topic ${t}`);
  const answers = data.mcqs.flatMap((m) => (m.questions ?? []).map((q) => q.answer));
  if (answers.length >= 20) {
    for (let letter = 0; letter < 4; letter++) {
      const share = answers.filter((a) => a === letter).length / answers.length;
      if (share > 0.4) fail('release', `${'ABCD'[letter]} is the answer to ${Math.round(share * 100)}% of multiple-choice questions; keep each letter at 40% or less`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const release = process.argv.includes('--release');
  const errors = validate(await loadData(path.join(root, 'data')), { release });
  if (errors.length) {
    console.error(`${errors.join('\n')}\n\n${errors.length} problem(s).`);
    process.exit(1);
  }
  console.log(release ? 'The bank is valid and meets the release minimums.' : 'The bank is valid.');
}
