# AMSCO Unit 4 Practice Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page study tool that serves random, exam-style AP World History DBQs and SAQ/MCQ drills for AMSCO Unit 4 (c. 1450–1750), built from a bank of real, source-checked primary documents, with self-check rubrics.

**Architecture:** The content lives in four JSON files under `data/`. Pure ES modules under `src/` do the work: seeded random draws, share codes, the timer and safe storage. A DOM module (`src/app.js`) renders the page. `tools/build.js` validates the bank and inlines everything into one HTML file, which is published as a claude.ai artifact. Separate tools check every excerpt against its online source text before it can enter the bank.

**Tech Stack:** Node 22+ (running 26), built-ins only: `node:test`, `fetch`, `TextDecoder`. No npm dependencies. Plain HTML/CSS/JS. Google Fonts.

**Spec:** `docs/superpowers/specs/2026-10-13-amsco-unit4-dbq-design.md`

## Global Constraints

- Scope: AMSCO Unit 4 only; topic tags exactly `4.1`–`4.8`.
- No AI at runtime and no network calls from the page except Google Fonts.
- Documents: primary sources only; every document has `verified: true` and an http(s) `sourceUrl`; text 60–200 words (aim for 80–180).
- Adapted documents: `adapted: true`, `original` holds the verbatim text, and `sourceLine` ends with `(adapted)`.
- DBQ draw: 7 documents, at least 2 from every group, no `authorKey` twice, numbered by `year` and then `id`.
- DBQ pool: 9–12 documents, 2–3 groups, every group with documents by at least 2 different authors, at least 7 different authors in the pool.
- SAQ: parts a, b, c; 0–2 documents. MCQ set: one document, 3–4 questions, 4 options (A–D).
- Share codes use only `[a-z0-9.-]`: `dbq.<id>.<seed base36>`, `saq.<id>`, `mcq.<id>`. Ids match `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Seeds are uint32.
- Recency: skip the last 3 DBQ prompts and the last 10 drills, falling back as described in the spec.
- Timer: 15-minute reading period plus 45 minutes of writing, computed from the wall clock.
- Artifact page: `dist/index.html` has no doctype/html/head/body. Its first line is `<title>Unit 4 DBQ Practice</title>`. Colour tokens on `:root` with the two dark-mode blocks. `body` has a token background. At least a 16px side gutter. No print button, no `alert`/`confirm`/`prompt`.
- The page never puts content into `innerHTML` (or `outerHTML`, `insertAdjacentHTML`, `document.write`).
- `dist/` is not committed.
- Git: work on branch `v1`. Linear history, no merge commits. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stale or malformed share codes** (`dbq.removed-id.k2`, the old `dbq/x/1` form, a seed above 2³²−1, trailing junk). The page shows a plain message, keeps the current item and never throws. Pinned in Task 2 (`test/code.test.js`).
2. **Browser storage unavailable or holding junk** (private window, storage access that throws, a stored value that isn't an array). The page works with all topics on and no recency. Pinned in Task 2 (`test/store.test.js`).
3. **A topic filter that matches nothing, or exactly one item.** Nothing: a message naming the topics that do have items. One: "New" offers that item again rather than nothing. Pinned in Task 1 (`pickRandom` and `topicsWithItems` tests), with a manual check in Task 5.
4. **Timer while the phone sleeps or the tab is in the background**, or the clock moves backwards. The time shown on return is correct, and never more than 15:00. Pinned in Task 2 (`test/timer.test.js`).
5. **Source text with characters that are special to HTML, JSON-in-HTML or `String.replace`** (`</script>`, `<`, `&`, `$&`, U+2028, accented names). It shows verbatim and doesn't break the build. Pinned in Task 5 (`test/build.test.js`).

---

## File structure

```
package.json                 scripts: test, build, validate
.gitignore                   (exists) dist/, node_modules/, .DS_Store
site.json                    Task 11: {"shareBase": "<artifact url>"}
data/
  documents.json             verified primary-source excerpts
  dbqs.json                  DBQ prompts with pools, groups and notes
  saqs.json                  short-answer questions
  mcqs.json                  multiple-choice sets
  research/                  research drafts, candidates and check reports (kept for traceability)
src/
  sampler.js                 seeded PRNG, shuffle, balanced DBQ draw, recency, topic filters (pure)
  code.js                    share codes: format, parse, resolve (pure)
  timer.js                   reading/writing timer state (pure)
  store.js                   best-effort localStorage wrapper (pure, storage injected)
  app.js                     DOM rendering and event wiring
  index.html                 page template with /*STYLES*/, /*SCRIPT*/, __BANK__ markers
  styles.css                 tokens and styles
tools/
  load-data.js               reads the four data files
  validate.js                content rules; CLI with --release
  build.js                   validate + inline -> dist/index.html and dist/local.html
  check-sources.js           confirms excerpts appear in their source pages; --text prints a page's text
  candidates.js              merge research drafts; promote verified candidates into the bank
test/
  helpers/fixture.js         a small valid bank built in code
  sampler.test.js  code.test.js  timer.test.js  store.test.js
  validate.test.js  data.test.js  build.test.js  check-sources.test.js  candidates.test.js
```

Tasks 1–5 build and test the code with fixture data. Tasks 6–10 produce the content. Task 11 releases it.

---

### Task 1: Scaffold and the sampler

**Files:**
- Create: `package.json`, `data/documents.json`, `data/dbqs.json`, `data/saqs.json`, `data/mcqs.json`
- Create: `src/sampler.js`
- Create: `test/helpers/fixture.js`, `test/sampler.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`src/sampler.js`):
  - `DBQ_SIZE = 7`
  - `mulberry32(seed: number) => () => number` (floats in [0, 1))
  - `shuffle<T>(items: T[], rng) => T[]` (new array)
  - `drawDbq(prompt, docsById: Map<string, Document>, seed: number) => PoolEntry[]`. It returns 7 pool entries (`{doc, group, sourcing}`) sorted by document year, then id. It throws `Error` naming the prompt id when no balanced set exists.
  - `pickRandom(items: {id}[], recent: string[], rng) => item | null`
  - `pushRecent(recent: string[], id: string, max: number) => string[]`
  - `matchesFilter(item: {topics}, topics: string[]) => boolean`
  - `topicsWithItems(items: {topics}[]) => string[]`
- Produces (`test/helpers/fixture.js`): `WORDS_80`, `makeDoc(n, overrides?)`, `makeData()` (returns `{documents, dbqs, saqs, mcqs}`), `writeDataDir(dir, data)`.

- [ ] **Step 1: Create the branch, package.json and empty data files**

```bash
cd ~/Development/nat && git switch -c v1
mkdir -p data src test/helpers tools
for f in documents dbqs saqs mcqs; do printf '[]\n' > data/$f.json; done
```

`package.json`:

```json
{
  "name": "amsco-unit4-practice",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test test/*.test.js",
    "build": "node tools/build.js",
    "validate": "node tools/validate.js"
  }
}
```

- [ ] **Step 2: Write the fixture helper**

`test/helpers/fixture.js`:

```js
// A small bank that passes every validation rule, built in code so each test can break one rule.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WORDS_80 = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');

export function makeDoc(n, overrides = {}) {
  return {
    id: `doc-${n}`,
    authorKey: `author-${n}`,
    sourceLine: `Author ${n}, test writer, Test Source, ${1500 + n}`,
    year: 1500 + n,
    kind: 'text',
    text: WORDS_80,
    adapted: false,
    original: null,
    translation: null,
    topics: ['4.3'],
    sourceUrl: `https://example.org/source/${n}`,
    verified: true,
    verifiedBy: 'script',
    ...overrides,
  };
}

export function makeData() {
  const documents = Array.from({ length: 10 }, (_, i) => makeDoc(i + 1));
  const dbq = {
    id: 'test-prompt',
    topics: ['4.3'],
    prompt: 'Evaluate the extent to which tests changed, 1450–1750.',
    groups: [
      { key: 'g1', label: 'Group one' },
      { key: 'g2', label: 'Group two' },
    ],
    pool: documents.map((d, i) => ({ doc: d.id, group: i < 5 ? 'g1' : 'g2', sourcing: `Sourcing note ${i + 1}` })),
    notes: { thesis: ['T'], contextualization: ['C'], outsideEvidence: ['O'], complexity: ['X'] },
  };
  const saq = {
    id: 'test-saq',
    topics: ['4.3'],
    docs: ['doc-1'],
    parts: ['a', 'b', 'c'].map((label) => ({ label, task: `Task ${label}`, accept: [`Accept ${label}`] })),
  };
  const mcq = {
    id: 'test-mcq',
    topics: ['4.5'],
    doc: 'doc-2',
    questions: [1, 2, 3].map((n) => ({
      stem: `Stem ${n}`,
      options: ['One', 'Two', 'Three', 'Four'],
      answer: n % 4,
      explanation: `Because ${n}`,
    })),
  };
  return { documents, dbqs: [dbq], saqs: [saq], mcqs: [mcq] };
}

export async function writeDataDir(dir, data) {
  await mkdir(dir, { recursive: true });
  for (const name of ['documents', 'dbqs', 'saqs', 'mcqs']) {
    await writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(data[name], null, 2)}\n`);
  }
}
```

- [ ] **Step 3: Write the failing sampler tests**

`test/sampler.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DBQ_SIZE, mulberry32, shuffle, drawDbq, pickRandom, pushRecent, matchesFilter, topicsWithItems,
} from '../src/sampler.js';
import { makeData, makeDoc } from './helpers/fixture.js';

const byId = (docs) => new Map(docs.map((d) => [d.id, d]));

function assertBalanced(prompt, docs, entries) {
  assert.equal(entries.length, DBQ_SIZE);
  assert.equal(new Set(entries.map((e) => e.doc)).size, DBQ_SIZE, 'documents are distinct');
  const authors = entries.map((e) => docs.get(e.doc).authorKey);
  assert.equal(new Set(authors).size, DBQ_SIZE, 'no author appears twice');
  for (const g of prompt.groups) {
    assert.ok(entries.filter((e) => e.group === g.key).length >= 2, `group ${g.key} has at least 2`);
  }
  const ordered = entries.map((e) => docs.get(e.doc));
  for (let i = 1; i < ordered.length; i++) {
    const [a, b] = [ordered[i - 1], ordered[i]];
    assert.ok(a.year < b.year || (a.year === b.year && a.id < b.id), 'sorted by year, then id');
  }
}

test('mulberry32 repeats for the same seed and stays in [0, 1)', () => {
  const xs = Array.from({ length: 100 }, mulberry32(42));
  assert.deepEqual(xs, Array.from({ length: 100 }, mulberry32(42)));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 100 }, mulberry32(43)));
});

test('shuffle returns a permutation and leaves its input alone', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, mulberry32(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(out, shuffle(input, mulberry32(1)));
});

test('drawDbq gives the same set for the same seed', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  assert.deepEqual(drawDbq(dbqs[0], docs, 1234), drawDbq(dbqs[0], docs, 1234));
});

test('drawDbq is balanced for 1,000 seeds', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, seed));
});

test('drawDbq varies between seeds', () => {
  const { documents, dbqs } = makeData();
  const docs = byId(documents);
  const sets = new Set();
  for (let seed = 0; seed < 50; seed++) sets.add(drawDbq(dbqs[0], docs, seed).map((e) => e.doc).join());
  assert.ok(sets.size > 10, `only ${sets.size} distinct sets in 50 seeds`);
});

test('drawDbq takes 2 from each of three groups', () => {
  const { documents, dbqs } = makeData();
  const prompt = {
    ...dbqs[0],
    groups: [{ key: 'g1', label: '1' }, { key: 'g2', label: '2' }, { key: 'g3', label: '3' }],
    pool: documents.map((d, i) => ({ doc: d.id, group: `g${(i % 3) + 1}`, sourcing: 's' })),
  };
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(prompt, docs, drawDbq(prompt, docs, seed));
});

test('drawDbq never repeats an author whose documents sit in different groups', () => {
  const { documents, dbqs } = makeData();
  documents[5] = makeDoc(6, { authorKey: 'author-1' }); // doc-6 (group g2) shares doc-1's author (group g1)
  const docs = byId(documents);
  for (let seed = 0; seed < 1000; seed++) assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, seed));
});

test('drawDbq sorts documents from the same year by id', () => {
  const { dbqs } = makeData();
  const documents = Array.from({ length: 10 }, (_, i) => makeDoc(i + 1, { year: 1600 }));
  const docs = byId(documents);
  assertBalanced(dbqs[0], docs, drawDbq(dbqs[0], docs, 7));
});

test('drawDbq throws, naming the prompt, when a group cannot supply two authors', () => {
  const { documents, dbqs } = makeData();
  for (const d of documents.slice(5)) d.authorKey = 'same-author';
  assert.throws(() => drawDbq(dbqs[0], byId(documents), 1), /test-prompt/);
});

test('pickRandom returns null when there is nothing to pick', () => {
  assert.equal(pickRandom([], ['a'], mulberry32(1)), null);
});

test('pickRandom avoids recent items while others remain', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) assert.ok(!['a', 'b', 'c'].includes(pickRandom(items, ['a', 'b', 'c'], rng).id));
});

test('pickRandom forgets the oldest recent items first', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id }));
  const rng = mulberry32(9);
  // newest first: c is on screen, a is the oldest; skipping all three leaves nothing, so a comes back
  for (let i = 0; i < 50; i++) assert.equal(pickRandom(items, ['c', 'b', 'a'], rng).id, 'a');
});

test('pickRandom offers the item on screen again only when it is the only match', () => {
  const rng = mulberry32(3);
  assert.equal(pickRandom([{ id: 'a' }], ['a'], rng).id, 'a');
  for (let i = 0; i < 50; i++) assert.equal(pickRandom([{ id: 'a' }, { id: 'b' }], ['a'], rng).id, 'b');
});

test('pushRecent puts the newest first, removes duplicates and caps the length', () => {
  assert.deepEqual(pushRecent(['b', 'a'], 'a', 3), ['a', 'b']);
  assert.deepEqual(pushRecent(['c', 'b', 'a'], 'd', 3), ['d', 'c', 'b']);
});

test('matchesFilter and topicsWithItems', () => {
  assert.equal(matchesFilter({ topics: ['4.3', '4.8'] }, ['4.8']), true);
  assert.equal(matchesFilter({ topics: ['4.3'] }, []), false);
  assert.deepEqual(topicsWithItems([{ topics: ['4.6', '4.3'] }, { topics: ['4.3'] }]), ['4.3', '4.6']);
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/src/sampler.js'`.

- [ ] **Step 5: Implement the sampler**

`src/sampler.js`:

```js
// Choosing what to show: seeded randomness, the balanced DBQ draw, recency and topic filters.
// Pure functions with no DOM access, so the tests and the build's validation use them too.

export const DBQ_SIZE = 7;
const PER_GROUP = 2;
const MAX_ATTEMPTS = 50;

// mulberry32: a small seeded PRNG. Returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Draws DBQ_SIZE pool entries: PER_GROUP from every group first, then any others, never the
// same author twice. A failed attempt (author clashes) retries with the next shuffle.
export function drawDbq(prompt, docsById, seed) {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chosen = tryDraw(prompt, docsById, shuffle(prompt.pool, rng));
    if (chosen) return chosen.sort((x, y) => byYearThenId(docsById.get(x.doc), docsById.get(y.doc)));
  }
  throw new Error(`Cannot draw a balanced set of ${DBQ_SIZE} documents for "${prompt.id}"`);
}

function tryDraw(prompt, docsById, order) {
  const chosen = [];
  const authors = new Set();
  const take = (entry) => {
    const author = docsById.get(entry.doc).authorKey;
    if (chosen.includes(entry) || authors.has(author)) return false;
    chosen.push(entry);
    authors.add(author);
    return true;
  };
  for (const group of prompt.groups) {
    let taken = 0;
    for (const entry of order) {
      if (taken === PER_GROUP) break;
      if (entry.group === group.key && take(entry)) taken++;
    }
    if (taken < PER_GROUP) return null;
  }
  for (const entry of order) {
    if (chosen.length === DBQ_SIZE) break;
    take(entry);
  }
  return chosen.length === DBQ_SIZE ? chosen : null;
}

function byYearThenId(a, b) {
  return a.year - b.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Picks a random item, skipping ids in `recent` (newest first; recent[0] is the item on screen).
// When that leaves nothing, it forgets the oldest recent ids first, so the item on screen comes
// back only when it is the only match. Returns null when there are no items.
export function pickRandom(items, recent, rng) {
  if (items.length === 0) return null;
  for (let keep = recent.length; keep >= 1; keep--) {
    const skip = new Set(recent.slice(0, keep));
    const left = items.filter((item) => !skip.has(item.id));
    if (left.length > 0) return left[Math.floor(rng() * left.length)];
  }
  return items[Math.floor(rng() * items.length)];
}

export function pushRecent(recent, id, max) {
  return [id, ...recent.filter((x) => x !== id)].slice(0, max);
}

export function matchesFilter(item, topics) {
  return item.topics.some((t) => topics.includes(t));
}

export function topicsWithItems(items) {
  return [...new Set(items.flatMap((item) => item.topics))].sort();
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, 15 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json data src/sampler.js test
git commit -F - <<'EOF'
Add seeded sampler with balanced DBQ draw

drawDbq picks 7 documents with at least 2 per argument group and no
author twice, deterministically from a seed so share codes can
reproduce a set. pickRandom skips recently seen items but falls back
rather than returning nothing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Share codes, timer and safe storage

**Files:**
- Create: `src/code.js`, `src/timer.js`, `src/store.js`
- Create: `test/code.test.js`, `test/timer.test.js`, `test/store.test.js`

**Interfaces:**
- Consumes: `drawDbq` from `src/sampler.js`; `makeData`, `makeDoc` from the fixture.
- Produces:
  - `src/code.js`:
    - `formatCode({kind: 'dbq', id, seed} | {kind: 'saq'|'mcq', id}) => string`
    - `parseCode(text: unknown) => {kind, id, seed?} | null`
    - `resolveCode(parsed, bank, docsById) => {ok: true, kind: 'dbq', prompt, seed, entries} | {ok: true, kind: 'saq'|'mcq', item} | {ok: false, message}`. Never throws.
  - `src/timer.js`: `READING_MS`, `WRITING_MS`, `timerState(startMs, nowMs) => {phase: 'reading'|'writing'|'done', remainingMs}`, `formatClock(ms) => 'mm:ss'`
  - `src/store.js`: `safeStore(getStorage: () => Storage) => {get(key, fallback), set(key, value)}`, `asStringArray(value) => string[]`

- [ ] **Step 1: Write the failing tests**

`test/code.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCode, parseCode, resolveCode } from '../src/code.js';
import { drawDbq } from '../src/sampler.js';
import { makeData } from './helpers/fixture.js';

const setup = () => {
  const bank = makeData();
  return { bank, docs: new Map(bank.documents.map((d) => [d.id, d])) };
};

test('formatCode and parseCode round-trip every kind, using only link-safe characters', () => {
  for (const item of [
    { kind: 'dbq', id: 'silver-trade', seed: 0 },
    { kind: 'dbq', id: 'silver-trade', seed: 0xffffffff },
    { kind: 'saq', id: 'potosi-1' },
    { kind: 'mcq', id: 'kangxi-edict' },
  ]) {
    const code = formatCode(item);
    assert.match(code, /^[a-z0-9.-]+$/);
    assert.deepEqual(parseCode(code), item);
  }
});

test('parseCode tolerates a leading #, spaces and capitals', () => {
  assert.deepEqual(parseCode('  #DBQ.Silver-Trade.K2X9Q1 '), { kind: 'dbq', id: 'silver-trade', seed: parseInt('k2x9q1', 36) });
});

test('parseCode rejects malformed and old-format codes', () => {
  const bad = ['', '#', 'dbq', 'dbq.silver-trade', 'dbq.silver-trade.', 'dbq.silver-trade.!!',
    'dbq.silver-trade.zzzzzzz', 'dbq.silver-trade.12345678', 'dbq/silver-trade/1', 'saq.', 'saq.a.b',
    'xyz.foo', 'mcq.Bad_Id', 'dbq.-x.1', 'dbq.silver-trade.1 extra', null, undefined, 42];
  for (const text of bad) assert.equal(parseCode(text), null, `accepted ${JSON.stringify(text)}`);
});

test('resolveCode explains an invalid code', () => {
  const { bank, docs } = setup();
  const result = resolveCode(parseCode('nonsense'), bank, docs);
  assert.equal(result.ok, false);
  assert.match(result.message, /isn’t valid/);
});

test('resolveCode explains codes for items that are no longer in the bank', () => {
  const { bank, docs } = setup();
  for (const code of ['dbq.gone.1', 'saq.gone', 'mcq.gone']) {
    const result = resolveCode(parseCode(code), bank, docs);
    assert.equal(result.ok, false, code);
    assert.match(result.message, /no longer in the bank/, code);
  }
});

test('resolveCode reproduces a DBQ draw from its seed', () => {
  const { bank, docs } = setup();
  const result = resolveCode(parseCode('dbq.test-prompt.zz'), bank, docs);
  assert.equal(result.ok, true);
  assert.equal(result.prompt.id, 'test-prompt');
  assert.deepEqual(result.entries, drawDbq(bank.dbqs[0], docs, parseInt('zz', 36)));
});

test('resolveCode finds drills', () => {
  const { bank, docs } = setup();
  assert.equal(resolveCode(parseCode('saq.test-saq'), bank, docs).item.id, 'test-saq');
  assert.equal(resolveCode(parseCode('mcq.test-mcq'), bank, docs).kind, 'mcq');
});

test('resolveCode reports a DBQ that cannot be drawn instead of throwing', () => {
  const { bank, docs } = setup();
  for (const d of bank.documents.slice(5)) d.authorKey = 'same-author';
  const result = resolveCode(parseCode('dbq.test-prompt.1'), bank, docs);
  assert.equal(result.ok, false);
  assert.match(result.message, /can’t be drawn/);
});
```

`test/timer.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READING_MS, WRITING_MS, timerState, formatClock } from '../src/timer.js';

const START = 1_700_000_000_000;

test('timer starts in the reading period with 15:00 left', () => {
  const s = timerState(START, START);
  assert.equal(s.phase, 'reading');
  assert.equal(formatClock(s.remainingMs), '15:00');
});

test('timer moves from reading to writing at 15 minutes', () => {
  assert.equal(timerState(START, START + READING_MS - 1).phase, 'reading');
  const s = timerState(START, START + READING_MS);
  assert.equal(s.phase, 'writing');
  assert.equal(formatClock(s.remainingMs), '45:00');
});

test('timer is done at 60 minutes', () => {
  assert.deepEqual(timerState(START, START + READING_MS + WRITING_MS), { phase: 'done', remainingMs: 0 });
});

test('timer is right after the phone sleeps for 20 minutes or 3 hours', () => {
  const s = timerState(START, START + 20 * 60_000);
  assert.equal(s.phase, 'writing');
  assert.equal(formatClock(s.remainingMs), '40:00');
  assert.equal(timerState(START, START + 3 * 3_600_000).phase, 'done');
});

test('timer never shows more than 15:00 when the clock moves backwards', () => {
  const s = timerState(START, START - 60_000);
  assert.equal(s.phase, 'reading');
  assert.equal(formatClock(s.remainingMs), '15:00');
});

test('formatClock rounds up to whole seconds', () => {
  assert.equal(formatClock(61_000), '01:01');
  assert.equal(formatClock(59_001), '01:00');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-5), '00:00');
});
```

`test/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeStore, asStringArray } from '../src/store.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('safeStore round-trips JSON values and falls back for missing keys', () => {
  const backing = memoryStorage();
  const s = safeStore(() => backing);
  s.set('topics', ['4.1', '4.3']);
  assert.deepEqual(s.get('topics', []), ['4.1', '4.3']);
  assert.equal(s.get('missing', 'fallback'), 'fallback');
});

test('safeStore falls back when reaching storage throws (private window, blocked site data)', () => {
  const s = safeStore(() => { throw new Error('SecurityError'); });
  assert.deepEqual(s.get('k', ['x']), ['x']);
  assert.doesNotThrow(() => s.set('k', 1));
});

test('safeStore falls back when getItem or setItem throws', () => {
  const s = safeStore(() => ({ getItem() { throw new Error('nope'); }, setItem() { throw new Error('QuotaExceeded'); } }));
  assert.equal(s.get('k', 7), 7);
  assert.doesNotThrow(() => s.set('k', 1));
});

test('safeStore falls back for junk JSON and missing storage', () => {
  const backing = memoryStorage();
  backing.setItem('k', '{nope');
  assert.equal(safeStore(() => backing).get('k', 'fallback'), 'fallback');
  assert.equal(safeStore(() => undefined).get('k', 'fallback'), 'fallback');
});

test('asStringArray keeps only strings and rejects non-arrays', () => {
  assert.deepEqual(asStringArray(['a', 1, null, 'b']), ['a', 'b']);
  assert.deepEqual(asStringArray('a'), []);
  assert.deepEqual(asStringArray({ 0: 'a' }), []);
  assert.deepEqual(asStringArray(null), []);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/src/code.js'` (likewise `timer.js` and `store.js`).

- [ ] **Step 3: Implement the three modules**

`src/code.js`:

```js
// Share codes: short strings that identify one question set, e.g. "dbq.silver-trade.k2x9q1".
// Only letters, digits, "." and "-" survive in a claude.ai artifact link's #fragment.
import { drawDbq } from './sampler.js';

const CODE_ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const DBQ_CODE = new RegExp(`^dbq\\.(${CODE_ID})\\.([0-9a-z]{1,7})$`);
const DRILL_CODE = new RegExp(`^(saq|mcq)\\.(${CODE_ID})$`);
const MAX_SEED = 0xffffffff;

export function formatCode(item) {
  if (item.kind === 'dbq') return `dbq.${item.id}.${item.seed.toString(36)}`;
  return `${item.kind}.${item.id}`;
}

// Returns {kind, id, seed?}, or null when the text is not a well-formed code.
export function parseCode(text) {
  const code = String(text ?? '').trim().replace(/^#/, '').toLowerCase();
  const dbq = DBQ_CODE.exec(code);
  if (dbq) {
    const seed = parseInt(dbq[2], 36);
    return seed <= MAX_SEED ? { kind: 'dbq', id: dbq[1], seed } : null;
  }
  const drill = DRILL_CODE.exec(code);
  return drill ? { kind: drill[1], id: drill[2] } : null;
}

// Turns a parsed code into what the page shows. Never throws.
export function resolveCode(parsed, bank, docsById) {
  if (!parsed) {
    return { ok: false, message: 'That code isn’t valid. Codes look like dbq.silver-trade.k2x9q1.' };
  }
  if (parsed.kind === 'dbq') {
    const prompt = bank.dbqs.find((q) => q.id === parsed.id);
    if (!prompt) return { ok: false, message: 'That code is for a DBQ that is no longer in the bank.' };
    try {
      return { ok: true, kind: 'dbq', prompt, seed: parsed.seed, entries: drawDbq(prompt, docsById, parsed.seed) };
    } catch {
      return { ok: false, message: 'That DBQ can’t be drawn right now. Choose New DBQ to get another.' };
    }
  }
  const list = parsed.kind === 'saq' ? bank.saqs : bank.mcqs;
  const item = list.find((x) => x.id === parsed.id);
  if (!item) {
    const name = parsed.kind === 'saq' ? 'short-answer question' : 'multiple-choice set';
    return { ok: false, message: `That code is for a ${name} that is no longer in the bank.` };
  }
  return { ok: true, kind: parsed.kind, item };
}
```

`src/timer.js`:

```js
// The DBQ timer: a 15-minute reading period, then 45 minutes of writing. It works from
// wall-clock times, so it stays right when a phone sleeps or a tab sits in the background.
export const READING_MS = 15 * 60 * 1000;
export const WRITING_MS = 45 * 60 * 1000;

export function timerState(startMs, nowMs) {
  const elapsed = Math.max(0, nowMs - startMs);
  if (elapsed < READING_MS) return { phase: 'reading', remainingMs: READING_MS - elapsed };
  if (elapsed < READING_MS + WRITING_MS) return { phase: 'writing', remainingMs: READING_MS + WRITING_MS - elapsed };
  return { phase: 'done', remainingMs: 0 };
}

// "mm:ss", rounded up so the clock reads 00:00 only when time is really up.
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
```

`src/store.js`:

```js
// Best-effort browser storage. Storage can be missing, throw on access (private windows,
// blocked site data) or hold junk; the page must work the same without it.
export function safeStore(getStorage) {
  const storage = () => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };
  return {
    get(key, fallback) {
      try {
        const raw = storage()?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage()?.setItem(key, JSON.stringify(value));
      } catch {
        // Unavailable or full: the remembered filter and recency are conveniences only.
      }
    },
  };
}

export function asStringArray(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS (15 sampler + 8 code + 6 timer + 5 store).

- [ ] **Step 5: Commit**

```bash
git add src/code.js src/timer.js src/store.js test/code.test.js test/timer.test.js test/store.test.js
git commit -F - <<'EOF'
Add share codes, DBQ timer and safe storage

Codes use only characters an artifact link passes through
(dbq.<id>.<seed>, saq.<id>, mcq.<id>) and resolve without throwing,
so a stale or mangled link gets a message instead of a broken page.
The timer works from the wall clock so phone sleep cannot skew it.
Storage access is wrapped because private windows can throw on it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Bank validation

**Files:**
- Create: `tools/load-data.js`, `tools/validate.js`
- Create: `test/validate.test.js`, `test/data.test.js`

**Interfaces:**
- Consumes: `drawDbq` from `src/sampler.js`; fixture helpers.
- Produces:
  - `tools/load-data.js`: `DATA_FILES`, `loadData(dir) => Promise<{documents, dbqs, saqs, mcqs}>`. Throws with the file name on bad JSON.
  - `tools/validate.js`: `TOPICS`, `RELEASE_MINIMUMS = {documents: 60, dbqs: 10, saqs: 18, mcqs: 13}`, `wordCount(text)`, `validate(data, {release?}) => string[]` (each entry is `"<where>: <problem>"`). The CLI is `node tools/validate.js [--release]`.

- [ ] **Step 1: Write the failing tests**

`test/validate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, wordCount } from '../tools/validate.js';
import { makeData } from './helpers/fixture.js';

function errorsAfter(mutate, options) {
  const data = makeData();
  mutate(data);
  return validate(data, options);
}

test('the fixture bank is valid', () => {
  assert.deepEqual(validate(makeData()), []);
});

test('each broken rule is reported', () => {
  const cases = [
    ['duplicate document id', (d) => { d.documents[1].id = 'doc-1'; }, /document doc-1: duplicate id/],
    ['bad id', (d) => { d.documents[0].id = 'Doc One'; }, /id must be lowercase/],
    ['unverified', (d) => { d.documents[0].verified = false; }, /not verified/],
    ['short text', (d) => { d.documents[0].text = 'too short'; }, /text has 2 words; it must have 60–200/],
    ['adapted without original', (d) => { d.documents[0].adapted = true; d.documents[0].sourceLine += ' (adapted)'; }, /verbatim original/],
    ['adapted without label', (d) => { d.documents[0].adapted = true; d.documents[0].original = 'x'; }, /end the sourceLine with "\(adapted\)"/],
    ['bad topic', (d) => { d.documents[0].topics = ['3.1']; }, /unknown topics 3\.1/],
    ['bad url', (d) => { d.documents[0].sourceUrl = 'ftp://x'; }, /http\(s\) link/],
    ['bad year', (d) => { d.documents[0].year = 1900; }, /year must be/],
    ['ragged table', (d) => { Object.assign(d.documents[0], { kind: 'table', text: undefined, table: { caption: 'c', columns: ['a', 'b'], rows: [['1']] } }); }, /one cell per column/],
    ['pool too small', (d) => { d.dbqs[0].pool = d.dbqs[0].pool.slice(0, 8); }, /pool has 8 documents; it must have 9–12/],
    ['unknown pool doc', (d) => { d.dbqs[0].pool[0].doc = 'nope'; }, /pool refers to unknown document nope/],
    ['unknown group', (d) => { d.dbqs[0].pool[0].group = 'g9'; }, /unknown group g9/],
    ['missing sourcing', (d) => { d.dbqs[0].pool[0].sourcing = ' '; }, /needs a sourcing note/],
    ['one group', (d) => { d.dbqs[0].groups = d.dbqs[0].groups.slice(0, 1); d.dbqs[0].pool.forEach((e) => { e.group = 'g1'; }); }, /needs 2–3 groups/],
    ['group with one author', (d) => { d.documents.slice(5).forEach((doc) => { doc.authorKey = 'same'; }); }, /group g2 needs documents by at least 2 different authors/],
    ['too few authors', (d) => { d.documents.forEach((doc, i) => { doc.authorKey = `a${i % 6}`; }); }, /pool has 6 different authors; it needs at least 7/],
    ['empty notes', (d) => { d.dbqs[0].notes.thesis = []; }, /notes\.thesis needs at least one entry/],
    ['saq parts', (d) => { d.saqs[0].parts.pop(); }, /parts must be a, b and c/],
    ['saq accept', (d) => { d.saqs[0].parts[0].accept = []; }, /part a needs at least one accepted answer/],
    ['saq docs', (d) => { d.saqs[0].docs = ['doc-1', 'doc-2', 'doc-3']; }, /0–2 document ids/],
    ['mcq options', (d) => { d.mcqs[0].questions[0].options.pop(); }, /question 1 needs exactly 4 options/],
    ['mcq answer', (d) => { d.mcqs[0].questions[0].answer = 4; }, /question 1 answer must be 0–3/],
    ['mcq count', (d) => { d.mcqs[0].questions = d.mcqs[0].questions.slice(0, 2); }, /has 2 questions; it must have 3–4/],
    ['mcq unknown doc', (d) => { d.mcqs[0].doc = 'nope'; }, /mcq test-mcq: unknown document nope/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const errors = errorsAfter(mutate);
    assert.ok(errors.some((e) => pattern.test(e)), `${name}: got ${JSON.stringify(errors)}`);
  }
});

test('non-array data files are reported, not crashed on', () => {
  assert.deepEqual(validate({ documents: {}, dbqs: [], saqs: [], mcqs: [] }), ['documents: must be a JSON array']);
});

test('release mode enforces minimum counts and topic coverage', () => {
  const errors = validate(makeData(), { release: true });
  assert.ok(errors.some((e) => /documents has 10; release needs at least 60/.test(e)), JSON.stringify(errors));
  assert.ok(errors.some((e) => /no drill covers topic 4\.1/.test(e)));
});

test('release mode flags a lopsided answer key', () => {
  const errors = errorsAfter((d) => {
    d.mcqs = Array.from({ length: 7 }, (_, i) => ({
      ...structuredClone(d.mcqs[0]),
      id: `m${i}`,
      questions: d.mcqs[0].questions.map((q) => ({ ...q, answer: 0 })),
    }));
  }, { release: true });
  assert.ok(errors.some((e) => /A is the answer to 100% of multiple-choice questions/.test(e)), JSON.stringify(errors));
});

test('wordCount ignores ellipses', () => {
  assert.equal(wordCount('one … two three'), 3);
});
```

`test/data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadData } from '../tools/load-data.js';
import { validate } from '../tools/validate.js';

test('the shipped question bank passes validation', async () => {
  const data = await loadData(fileURLToPath(new URL('../data', import.meta.url)));
  assert.deepEqual(validate(data), []);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/tools/validate.js'`.

- [ ] **Step 3: Implement loading and validation**

`tools/load-data.js`:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DATA_FILES = ['documents', 'dbqs', 'saqs', 'mcqs'];

export async function loadData(dir) {
  const data = {};
  for (const name of DATA_FILES) {
    const file = path.join(dir, `${name}.json`);
    try {
      data[name] = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }
  return data;
}
```

`tools/validate.js`:

```js
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
const NOTE_KINDS = ['thesis', 'contextualization', 'outsideEvidence', 'complexity'];

export function wordCount(text) {
  return text.replace(/…/g, ' ').split(/\s+/).filter(Boolean).length;
}

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

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
    for (const kind of NOTE_KINDS) {
      const notes = q.notes?.[kind];
      if (!Array.isArray(notes) || notes.length === 0 || !notes.every(nonEmpty)) local(`notes.${kind} needs at least one entry`);
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test && node tools/validate.js`
Expected: all tests PASS; `The bank is valid.` (the shipped bank is empty so far).

- [ ] **Step 5: Commit**

```bash
git add tools/load-data.js tools/validate.js test/validate.test.js test/data.test.js
git commit -F - <<'EOF'
Add question-bank validation

Encodes the spec's content rules: verified sources, excerpt length,
adapted-text provenance, pool balance, SAQ/MCQ shape, and a 1,000-seed
draw check per DBQ so no prompt can fail to produce a set. --release
adds minimum counts, topic coverage and answer-key balance.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Source checking and candidate tools

**Files:**
- Create: `tools/check-sources.js`, `tools/candidates.js`
- Create: `test/check-sources.test.js`, `test/candidates.test.js`

**Interfaces:**
- Consumes: `makeDoc` from the fixture.
- Produces:
  - `tools/check-sources.js`:
    - `htmlToText(html) => string`
    - `normalizeForMatch(text) => string`
    - `segmentsOf(excerpt) => string[]`
    - `checkText(excerpt, sourceText) => {ok, missing: string[], reason?}`
    - `fetchText(url) => Promise<string>`
    - `checkDocument(doc, pages?: Map, fetchPage?) => Promise<{status: 'match'|'mismatch'|'fetch-failed'|'manual', reason?, missing?}>`
    - CLI: `node tools/check-sources.js <file.json> [--mark] [--only id,id]` and `node tools/check-sources.js --text <url>`. The file may be a document array or a research cluster object `{cluster, documents, poolHints}`. The report goes to `<file-without-.json>-report.json`.
  - `tools/candidates.js`:
    - `mergeClusters(clusters) => {documents, conflicts}`
    - `promote(candidates) => {documents, dropped}`
    - CLI: `node tools/candidates.js merge` (all `data/research/cluster-*.json` → `data/research/candidates.json`; refuses to overwrite) and `node tools/candidates.js promote` (→ `data/documents.json`).

- [ ] **Step 1: Write the failing tests**

`test/check-sources.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, normalizeForMatch, segmentsOf, checkText, checkDocument } from '../tools/check-sources.js';

test('normalizeForMatch folds case, accents, punctuation and curly quotes', () => {
  assert.equal(normalizeForMatch('“Bartolomé,” he said — QUITE so…'), 'bartolome he said quite so');
});

test('normalizeForMatch rejoins words hyphenated across a line break', () => {
  assert.equal(normalizeForMatch('the trans-\n  port of'), 'the transport of');
});

test('htmlToText drops scripts and styles, joins inline tags and decodes entities', () => {
  const html = '<style>p{}</style><script>var x="<p>hidden</p>"</script><p>Mo<i>ctezuma</i> &amp; Cort&eacute;s &#8220;met&#8221;</p><br>Next';
  const text = htmlToText(html);
  assert.ok(!text.includes('hidden'));
  assert.equal(normalizeForMatch(text), 'moctezuma cortes met next');
});

test('segmentsOf splits on cuts and editorial brackets and skips short fragments', () => {
  assert.deepEqual(
    segmentsOf('The king sent many ships … to the coast of Guinea [Africa] in search of gold and slaves … and so'),
    ['the king sent many ships', 'to the coast of guinea', 'in search of gold and slaves'],
  );
});

test('checkText passes a faithful excerpt and lists the segments that are missing', () => {
  const source = 'In the year 1492 the admiral sailed west across the Ocean Sea, hoping to reach the lands of the Great Khan and their riches.';
  assert.deepEqual(checkText('the admiral sailed west across the Ocean Sea … to reach the lands of the Great Khan', source), { ok: true, missing: [] });
  const bad = checkText('the admiral sailed east across the Ocean Sea … to reach the lands of the Great Khan', source);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.missing, ['the admiral sailed east across the ocean sea']);
});

test('checkText matches whole words only', () => {
  assert.equal(checkText('he sailed to the west', 'she sailed to the western sea').ok, false);
});

test('checkText refuses an excerpt that is mostly unchecked fragments', () => {
  const result = checkText('one two … three four … five six seven eight', 'five six seven eight');
  assert.equal(result.ok, false);
  assert.match(result.reason, /too little/);
});

test('checkDocument checks an adapted document against its original, and reports fetch failures and tables', async () => {
  const page = 'Thei shewed vs greate kindnesse and gaue vs victuals for many daies after';
  const doc = {
    id: 'x', kind: 'text', adapted: true, sourceUrl: 'https://example.org/1',
    original: 'Thei shewed vs greate kindnesse and gaue vs victuals',
    text: 'They showed us great kindness and gave us food',
  };
  assert.deepEqual(await checkDocument(doc, new Map(), async () => page), { status: 'match' });
  assert.deepEqual(
    await checkDocument({ ...doc, sourceUrl: 'https://example.org/2' }, new Map(), async () => { throw new Error('HTTP 404'); }),
    { status: 'fetch-failed', reason: 'HTTP 404' },
  );
  assert.deepEqual(await checkDocument({ ...doc, kind: 'table' }, new Map(), async () => page), { status: 'manual', reason: 'tables are checked by hand' });
});
```

`test/candidates.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeClusters, promote } from '../tools/candidates.js';
import { makeDoc } from './helpers/fixture.js';

test('mergeClusters keeps one copy of a shared document, resets verified and reports real conflicts', () => {
  const a = makeDoc(1);
  const b = makeDoc(2);
  const { documents, conflicts } = mergeClusters([
    { cluster: 'a', documents: [b, a] },
    { cluster: 'b', documents: [{ ...a }, { ...b, text: 'a different excerpt' }] },
  ]);
  assert.deepEqual(documents.map((d) => d.id), ['doc-1', 'doc-2']);
  assert.ok(documents.every((d) => d.verified === false));
  assert.deepEqual(conflicts, ['doc-2: cluster b has a different version; kept the one from cluster a']);
});

test('promote refuses while any candidate is neither verified nor dropped', () => {
  assert.throws(() => promote([makeDoc(1), makeDoc(2, { verified: false })]), /doc-2/);
});

test('promote keeps verified candidates and lists dropped ones with their reasons', () => {
  const { documents, dropped } = promote([makeDoc(2), makeDoc(1), makeDoc(3, { verified: false, dropped: 'not in source' })]);
  assert.deepEqual(documents.map((d) => d.id), ['doc-1', 'doc-2']);
  assert.ok(documents.every((d) => !('dropped' in d)));
  assert.deepEqual(dropped, ['doc-3: not in source']);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/tools/check-sources.js'` and `…/tools/candidates.js`.

- [ ] **Step 3: Implement the source checker**

`tools/check-sources.js`:

```js
#!/usr/bin/env node
// Confirms that each document's excerpt really appears in the page its sourceUrl points to.
// Usage:
//   node tools/check-sources.js <file.json> [--mark] [--only id,id]   check unverified documents
//   node tools/check-sources.js --text <url>                           print a page's text, for copying excerpts
// <file.json> is a document array or a research cluster {cluster, documents, poolHints}.
// --mark sets verified: true, verifiedBy: "script" on matches. The report is <file>-report.json.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

async function main(argv) {
  if (argv[0] === '--text') {
    console.log(await fetchText(argv[1]));
    return;
  }
  const onlyAt = argv.indexOf('--only');
  const file = argv.find((a, i) => !a.startsWith('--') && !(onlyAt >= 0 && i === onlyAt + 1));
  if (!file) throw new Error('usage: node tools/check-sources.js <file.json> [--mark] [--only id,id] | --text <url>');
  const only = onlyAt >= 0 ? new Set((argv[onlyAt + 1] ?? '').split(',')) : null;
  const json = JSON.parse(await readFile(file, 'utf8'));
  const documents = Array.isArray(json) ? json : json.documents;
  const pages = new Map();
  const report = [];
  for (const doc of documents) {
    if (only ? !only.has(doc.id) : doc.verified === true || doc.dropped) continue;
    const result = await checkDocument(doc, pages);
    report.push({ id: doc.id, sourceUrl: doc.sourceUrl, ...result });
    if (argv.includes('--mark') && result.status === 'match') Object.assign(doc, { verified: true, verifiedBy: 'script' });
  }
  const reportFile = file.replace(/\.json$/, '-report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  if (argv.includes('--mark')) await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  const count = (status) => report.filter((r) => r.status === status).length;
  console.log(`match ${count('match')}, mismatch ${count('mismatch')}, fetch-failed ${count('fetch-failed')}, manual ${count('manual')} → ${reportFile}`);
  for (const r of report.filter((x) => x.status !== 'match')) {
    console.log(`  ${r.status}  ${r.id}  ${r.reason ?? ''}${r.missing?.length ? ` missing: ${r.missing.map((m) => `“${m}”`).join(' | ')}` : ''}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Implement the candidate tools**

`tools/candidates.js`:

```js
#!/usr/bin/env node
// Research drafts -> one candidate list -> the verified bank.
//   node tools/candidates.js merge     data/research/cluster-*.json -> data/research/candidates.json
//   node tools/candidates.js promote   verified candidates -> data/documents.json (dropped ones are listed)
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.join(ROOT, 'data', 'research');
const CANDIDATES = path.join(RESEARCH, 'candidates.json');
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function mergeClusters(clusters) {
  const kept = new Map();
  const conflicts = [];
  for (const { cluster, documents } of clusters) {
    for (const doc of documents) {
      const prev = kept.get(doc.id);
      if (!prev) kept.set(doc.id, { cluster, doc: { ...doc, verified: false } });
      else if (prev.doc.text !== doc.text || prev.doc.sourceUrl !== doc.sourceUrl) {
        conflicts.push(`${doc.id}: cluster ${cluster} has a different version; kept the one from cluster ${prev.cluster}`);
      }
    }
  }
  return { documents: [...kept.values()].map((k) => k.doc).sort(byId), conflicts };
}

export function promote(candidates) {
  const undecided = candidates.filter((d) => d.verified !== true && !d.dropped).map((d) => d.id);
  if (undecided.length) throw new Error(`Not yet verified or dropped: ${undecided.join(', ')}`);
  const documents = candidates.filter((d) => d.verified === true && !d.dropped).map(({ dropped, ...doc }) => doc).sort(byId);
  const dropped = candidates.filter((d) => d.dropped).map((d) => `${d.id}: ${d.dropped}`);
  return { documents, dropped };
}

const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

async function main(command) {
  if (command === 'merge') {
    if (await access(CANDIDATES).then(() => true, () => false)) {
      throw new Error(`${path.relative(ROOT, CANDIDATES)} already exists; delete it to merge again (this discards verification marks)`);
    }
    const files = (await readdir(RESEARCH)).filter((f) => /^cluster-[a-z]+\.json$/.test(f)).sort();
    const clusters = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(RESEARCH, f), 'utf8'))));
    const { documents, conflicts } = mergeClusters(clusters);
    await writeJson(CANDIDATES, documents);
    console.log(`Merged ${files.length} cluster files into ${documents.length} candidates.`);
    for (const c of conflicts) console.log(`  conflict  ${c}`);
  } else if (command === 'promote') {
    const { documents, dropped } = promote(JSON.parse(await readFile(CANDIDATES, 'utf8')));
    await writeJson(path.join(ROOT, 'data', 'documents.json'), documents);
    console.log(`Promoted ${documents.length} verified documents; dropped ${dropped.length}.`);
    for (const d of dropped) console.log(`  dropped  ${d}`);
  } else {
    throw new Error('usage: node tools/candidates.js merge | promote');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Try the checker against one real page**

Run: `node tools/check-sources.js --text https://sourcebooks.fordham.edu/mod/modsbook03.asp | head -40`
Expected: readable plain text from the Fordham Modern History Sourcebook index. If the request fails with a sandbox or network error, ask for network access for this command. Don't work around a failed fetch.

- [ ] **Step 7: Commit**

```bash
git add tools/check-sources.js tools/candidates.js test/check-sources.test.js test/candidates.test.js
git commit -F - <<'EOF'
Add source checker and research-candidate tools

check-sources fetches each document's sourceUrl and confirms every
quoted segment appears there, after normalising case, accents,
punctuation and line-break hyphenation, so a misremembered or
paraphrased "quote" cannot enter the bank. candidates merges the
research drafts and promotes only verified documents.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The page and the build

**Files:**
- Create: `src/index.html`, `src/styles.css`, `src/app.js`, `tools/build.js`
- Create: `test/build.test.js`

**Interfaces:**
- Consumes: everything from `src/sampler.js`, `src/code.js`, `src/timer.js`, `src/store.js`; `loadData`; `validate`; the fixture helpers.
- Produces (`tools/build.js`):
  - `MODULES`
  - `stripModuleSyntax(source, name) => string`
  - `jsonForHtml(value) => string`
  - `runtimeBank(data, shareBase) => {config: {shareBase}, documents, dbqs, saqs, mcqs}`
  - `build({dataDir?, outDir?, shareBase?}) => Promise<{indexPath, localPath, bytes}>`
  - CLI: `npm run build` (reads `shareBase` from `site.json` when present).
- The bundle concatenates all five modules into one module scope, so **top-level names must be unique across `src/*.js`**. The build test's `node --check` catches a clash.

Before writing `src/styles.css` and `src/index.html`, load the `artifact-design` skill. The design below follows it. If the skill's current rules differ from what's here, follow the skill.

- [ ] **Step 1: Write the failing build tests**

`test/build.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/tools/build.js'`.

- [ ] **Step 3: Write the build script**

`tools/build.js`:

```js
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

export async function build({ dataDir = path.join(ROOT, 'data'), outDir = path.join(ROOT, 'dist'), shareBase = null } = {}) {
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
  page = fill(page, '__BANK__', jsonForHtml(runtimeBank(data, shareBase)));
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

async function readShareBase() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, 'site.json'), 'utf8')).shareBase ?? null;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { indexPath, localPath, bytes } = await build({ shareBase: await readShareBase() });
    console.log(`Wrote ${path.relative(ROOT, indexPath)} (${Math.round(bytes / 1024)} KB) and ${path.relative(ROOT, localPath)}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Write the page template**

`src/index.html`:

```html
<title>Unit 4 DBQ Practice</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:wght@400;500;600&family=IM+Fell+English&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>/*STYLES*/</style>

<div class="page">
  <header class="masthead">
    <p class="eyebrow">AP World History: Modern · AMSCO Unit 4 · c. 1450–1750</p>
    <h1>Transoceanic Interconnections</h1>
    <p class="lede">Practice questions built from real primary sources. Every new DBQ draws a different set of seven documents.</p>
  </header>

  <nav class="tabs" role="tablist" aria-label="Question type">
    <button type="button" id="tab-dbq" role="tab" aria-controls="panel-dbq" aria-selected="true">DBQ</button>
    <button type="button" id="tab-drill" role="tab" aria-controls="panel-drill" aria-selected="false">Short drills</button>
  </nav>

  <section class="settings" aria-label="Settings">
    <fieldset class="topics">
      <legend>Topics</legend>
      <div id="topic-list" class="topic-list"></div>
      <p id="topic-count" class="hint"></p>
    </fieldset>
    <div class="code-box">
      <div class="code-row">
        <span class="label">Code</span>
        <code id="current-code">–</code>
        <button type="button" id="copy-code">Copy code</button>
        <button type="button" id="copy-link" hidden>Copy link</button>
      </div>
      <form id="open-code-form" class="code-row">
        <label for="open-code" class="label">Open a code</label>
        <input id="open-code" name="code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="dbq.silver-trade.k2x9q1">
        <button type="submit">Open</button>
      </form>
    </div>
  </section>

  <p id="notice" class="notice" role="status" hidden></p>

  <main>
    <section id="panel-dbq" role="tabpanel" aria-labelledby="tab-dbq">
      <div class="toolbar">
        <button type="button" id="new-dbq" class="primary">New DBQ</button>
        <button type="button" id="timer-toggle">Start 60-minute timer</button>
        <span id="timer" class="timer" role="timer" hidden></span>
      </div>
      <article id="dbq"></article>
    </section>
    <section id="panel-drill" role="tabpanel" aria-labelledby="tab-drill" hidden>
      <div class="toolbar">
        <fieldset class="drill-kind">
          <legend class="visually-hidden">Drill type</legend>
          <label><input type="radio" name="drill-kind" id="kind-any" value="any" checked> Either</label>
          <label><input type="radio" name="drill-kind" id="kind-saq" value="saq"> Short answer</label>
          <label><input type="radio" name="drill-kind" id="kind-mcq" value="mcq"> Multiple choice</label>
        </fieldset>
        <button type="button" id="new-drill" class="primary">New drill</button>
      </div>
      <article id="drill"></article>
    </section>
  </main>

  <footer class="colophon">Every document is an excerpt from a real primary source. The “Source text” link under each one opens the text it was checked against.</footer>
</div>

<script type="application/json" id="bank">__BANK__</script>
<script type="module">/*SCRIPT*/</script>
```

- [ ] **Step 5: Write the styles**

`src/styles.css`:

```css
/* Layout: one reading column of exam "leaves" under a sea-chart neatline; the settings sit two-up and stack on phones. */
:root {
  --paper: #f2f5f4;
  --surface: #fbfcfc;
  --ink: #1b2a36;
  --muted: #566672;
  --rule: #c7d1d4;
  --accent: #1f6a66;
  --accent-ink: #ffffff;
  --good: #2c7a4b;
  --bad: #a8402c;
  --font-display: "IM Fell English", "Iowan Old Style", Georgia, serif;
  --font-text: "Source Serif 4", "Iowan Old Style", Georgia, serif;
  --font-ui: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
  --measure: 42rem;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0f1a21; --surface: #15232c; --ink: #e2e9ec; --muted: #9aabb5; --rule: #2b3c47;
    --accent: #62b3ab; --accent-ink: #0f1a21; --good: #6cc08b; --bad: #e58a74;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper: #0f1a21; --surface: #15232c; --ink: #e2e9ec; --muted: #9aabb5; --rule: #2b3c47;
  --accent: #62b3ab; --accent-ink: #0f1a21; --good: #6cc08b; --bad: #e58a74;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--font-ui); }
.page { max-width: 52rem; margin: 0 auto; padding-inline: clamp(16px, 4vw, 2rem); padding-block: 1.5rem 3rem; display: grid; gap: 1.25rem; }

.masthead { position: relative; display: grid; gap: 0.35rem; padding-bottom: 1.4rem; }
.masthead::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px;
  border-block: 1px solid var(--ink);
  background: repeating-linear-gradient(90deg, var(--ink) 0 1.5rem, transparent 1.5rem 3rem);
}
h1 { margin: 0; font: 400 clamp(1.9rem, 5vw, 2.6rem)/1.1 var(--font-display); letter-spacing: 0.01em; text-wrap: balance; }
.eyebrow, legend, .label { margin: 0; font: 600 0.72rem/1.4 var(--font-ui); text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.lede { margin: 0; max-width: var(--measure); font: 1.02rem/1.55 var(--font-text); color: var(--muted); }

.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--rule); }
.tabs [role="tab"] {
  appearance: none; border: 0; border-radius: 0; background: none; margin-bottom: -1px;
  padding: 0.6rem 0.9rem; border-bottom: 3px solid transparent;
  font: 500 0.95rem var(--font-ui); color: var(--muted); cursor: pointer;
}
.tabs [role="tab"][aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }

.settings { display: grid; gap: 1rem; grid-template-columns: 1fr; }
@media (min-width: 44rem) { .settings { grid-template-columns: 1.4fr 1fr; align-items: start; } }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.topic-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem; }
.topic {
  display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem;
  border: 1px solid var(--rule); border-radius: 999px; background: var(--surface); font-size: 0.85rem; cursor: pointer;
}
.topic input { margin: 0; accent-color: var(--accent); }
.topic .tag { font: 0.78rem var(--font-mono); }
.hint { margin: 0.4rem 0 0; font-size: 0.8rem; color: var(--muted); }
.code-box { display: grid; gap: 0.5rem; min-width: 0; }
.code-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
#current-code {
  font: 0.9rem var(--font-mono); padding: 0.2rem 0.45rem; background: var(--surface);
  border: 1px solid var(--rule); border-radius: 4px; overflow-wrap: anywhere; user-select: all;
}
input[type="text"] {
  flex: 1 1 12rem; min-width: 0; padding: 0.4rem 0.55rem; font: 0.9rem var(--font-mono);
  color: var(--ink); background: var(--surface); border: 1px solid var(--rule); border-radius: 4px;
}
button {
  padding: 0.45rem 0.8rem; font: 500 0.9rem var(--font-ui); color: var(--ink);
  background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; cursor: pointer;
}
button:hover { border-color: var(--ink); }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.notice { margin: 0; padding: 0.6rem 0.8rem; border-left: 3px solid var(--accent); background: var(--surface); overflow-wrap: anywhere; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; }
.timer { font: 500 0.95rem var(--font-mono); font-variant-numeric: tabular-nums; }
.timer[data-phase="done"] { color: var(--bad); }
.drill-kind { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.drill-kind label { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.question { display: grid; gap: 1.25rem; max-width: var(--measure); }
.question-head { display: grid; gap: 0.5rem; }
.prompt { margin: 0; font: 600 1.3rem/1.35 var(--font-text); text-wrap: balance; }
.directions { margin: 0; font: 0.95rem/1.55 var(--font-text); color: var(--muted); }
.directions ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip { padding: 0.1rem 0.45rem; font: 0.75rem var(--font-mono); color: var(--muted); border: 1px solid var(--rule); border-radius: 3px; }

.document { display: grid; gap: 0.55rem; min-width: 0; padding: 1rem 1.15rem; background: var(--surface); border: 1px solid var(--rule); border-radius: 2px; }
.document h3 { margin: 0; font: 400 1.15rem var(--font-display); letter-spacing: 0.02em; }
.source { margin: 0; font: 0.85rem/1.45 var(--font-ui); color: var(--muted); }
.source b { font-weight: 600; color: var(--ink); }
.excerpt { display: grid; gap: 0.6rem; margin: 0; font: 1.02rem/1.65 var(--font-text); }
.excerpt p { margin: 0; }
.table-wrap { overflow-x: auto; }
.document table { border-collapse: collapse; font: 0.9rem var(--font-ui); font-variant-numeric: tabular-nums; }
.document caption { text-align: left; font-weight: 600; padding-bottom: 0.3rem; }
.document th, .document td { padding: 0.3rem 0.6rem; text-align: left; border-bottom: 1px solid var(--rule); }
.credit { margin: 0; font-size: 0.8rem; color: var(--muted); }
.credit a { color: var(--accent); }

.guide { display: grid; gap: 0.9rem; padding-top: 1rem; border-top: 2px solid var(--ink); }
.guide h3 { margin: 0; font: 600 0.8rem var(--font-ui); text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.rubric { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.rubric td { padding: 0.45rem 0.3rem; vertical-align: top; border-bottom: 1px solid var(--rule); }
.rubric td.pts { text-align: right; white-space: nowrap; font: 600 0.9rem var(--font-mono); }
.notes { display: grid; gap: 0.35rem; margin: 0; padding-left: 1.2rem; font: 0.95rem/1.55 var(--font-text); }

.part { display: grid; gap: 0.45rem; }
.part-task { margin: 0; font: 1rem/1.55 var(--font-text); }
.part-task b { font-family: var(--font-ui); }
textarea {
  width: 100%; min-height: 6rem; padding: 0.5rem 0.6rem; resize: vertical;
  font: 0.95rem/1.5 var(--font-text); color: var(--ink); background: var(--surface);
  border: 1px solid var(--rule); border-radius: 4px;
}
.accept { display: grid; gap: 0.3rem; padding: 0.6rem 0.8rem; background: var(--surface); border-left: 3px solid var(--accent); }
.accept ul { margin: 0; padding-left: 1.1rem; font: 0.92rem/1.5 var(--font-text); }

.mcq { display: grid; gap: 0.5rem; }
.mcq legend { margin-bottom: 0.35rem; font: 400 1rem/1.5 var(--font-text); text-transform: none; letter-spacing: 0; color: var(--ink); }
.option {
  display: flex; align-items: baseline; gap: 0.55rem; padding: 0.4rem 0.55rem;
  background: var(--surface); border: 1px solid var(--rule); border-radius: 4px; cursor: pointer;
}
.option input { accent-color: var(--accent); }
.option .letter { font: 600 0.85rem var(--font-mono); }
.option[data-mark="correct"] { border-color: var(--good); box-shadow: inset 3px 0 0 var(--good); }
.option[data-mark="wrong"] { border-color: var(--bad); box-shadow: inset 3px 0 0 var(--bad); }
.feedback { display: grid; gap: 0.25rem; }
.verdict { margin: 0; font: 600 0.85rem var(--font-ui); }
.verdict.good { color: var(--good); }
.verdict.bad { color: var(--bad); }
.explanation { margin: 0; font: 0.92rem/1.5 var(--font-text); }
.score { margin: 0; font: 600 1rem var(--font-ui); }

.colophon { padding-top: 1rem; border-top: 1px solid var(--rule); font-size: 0.8rem; color: var(--muted); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
@media print {
  :root, :root:not([data-theme="light"]), :root[data-theme="dark"] {
    --paper: #ffffff; --surface: #ffffff; --ink: #000000; --muted: #333333; --rule: #999999; color-scheme: light;
  }
  .tabs, .settings, .toolbar, .notice, .credit, .colophon, .lede, button, textarea { display: none !important; }
  .document { break-inside: avoid; }
  body { font-size: 11pt; }
}
```

- [ ] **Step 6: Write the page script**

`src/app.js`:

```js
// The page: renders DBQs and drills from the inlined bank and wires up the controls.
// Every node is built from text nodes, never from HTML strings, so source text shows exactly as written.
import { drawDbq, pickRandom, pushRecent, matchesFilter, topicsWithItems } from './sampler.js';
import { formatCode, parseCode, resolveCode } from './code.js';
import { timerState, formatClock } from './timer.js';
import { safeStore, asStringArray } from './store.js';

const TOPIC_LABELS = {
  '4.1': 'Technological innovations',
  '4.2': 'Exploration: causes and events',
  '4.3': 'Columbian Exchange',
  '4.4': 'Maritime empires established',
  '4.5': 'Maritime empires maintained',
  '4.6': 'Challenges to state power',
  '4.7': 'Changing social hierarchies',
  '4.8': 'Continuity and change',
};
const ALL_TOPICS = Object.keys(TOPIC_LABELS);
const RECENT_DBQS = 3;
const RECENT_DRILLS = 10;
const LETTERS = 'ABCD';
const DRILL_KINDS = ['any', 'saq', 'mcq'];
const DBQ_TASKS = [
  'Make a historically defensible claim that establishes a line of reasoning.',
  'Describe a broader historical context relevant to the prompt.',
  'Support an argument using at least four documents.',
  'Use at least one piece of specific historical evidence not found in the documents.',
  'For at least two documents, explain how or why the point of view, purpose, historical situation or audience is relevant to your argument.',
  'Show a complex understanding of the prompt, using evidence to corroborate, qualify or modify your argument.',
];
const RUBRIC = [
  ['Thesis/claim', 'A historically defensible claim that establishes a line of reasoning.', 1],
  ['Contextualization', 'A broader historical context relevant to the prompt.', 1],
  ['Evidence from the documents', 'One point for describing the content of at least three documents; two for using at least four to support the argument.', 2],
  ['Evidence beyond the documents', 'At least one more piece of specific evidence relevant to the argument.', 1],
  ['Sourcing', 'For at least two documents, how or why the point of view, purpose, historical situation or audience is relevant to the argument.', 1],
  ['Complexity', 'A complex understanding of the historical development in the prompt.', 1],
];

const bank = JSON.parse(document.getElementById('bank').textContent);
const docsById = new Map(bank.documents.map((d) => [d.id, d]));
const store = safeStore(() => window.localStorage);
const $ = (id) => document.getElementById(id);

const state = {
  tab: 'dbq',
  topics: restoreTopics(),
  drillKind: restoreDrillKind(),
  recentDbqs: asStringArray(store.get('recentDbqs', [])),
  recentDrills: asStringArray(store.get('recentDrills', [])),
  dbqCode: null,
  drillCode: null,
  timerStart: null,
  timerId: null,
};

function restoreTopics() {
  const saved = asStringArray(store.get('topics', null)).filter((t) => ALL_TOPICS.includes(t));
  return saved.length > 0 ? saved : [...ALL_TOPICS];
}

function restoreDrillKind() {
  const saved = store.get('drillKind', 'any');
  return DRILL_KINDS.includes(saved) ? saved : 'any';
}

// el('p', {class: 'source'}, 'text', node, [more]): attributes, then text or nodes (arrays are flattened).
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'for') node.htmlFor = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

function notify(message) {
  $('notice').textContent = message ?? '';
  $('notice').hidden = !message;
}

// ---- Topics -------------------------------------------------------------

const topicInputId = (tag) => `topic-${tag.replace('.', '-')}`;

function renderTopics() {
  $('topic-list').replaceChildren(...ALL_TOPICS.map((tag) => el('label', { class: 'topic', for: topicInputId(tag) },
    el('input', { type: 'checkbox', id: topicInputId(tag), value: tag, checked: state.topics.includes(tag), onchange: onTopicChange }),
    el('span', { class: 'tag' }, tag),
    el('span', {}, TOPIC_LABELS[tag]),
  )));
  renderTopicCount();
}

function onTopicChange() {
  state.topics = ALL_TOPICS.filter((tag) => $(topicInputId(tag)).checked);
  store.set('topics', state.topics);
  renderTopicCount();
}

function renderTopicCount() {
  const dbqs = bank.dbqs.filter((q) => matchesFilter(q, state.topics)).length;
  const drills = [...bank.saqs, ...bank.mcqs].filter((x) => matchesFilter(x, state.topics)).length;
  $('topic-count').textContent = `${dbqs} ${dbqs === 1 ? 'DBQ' : 'DBQs'} and ${drills} ${drills === 1 ? 'drill' : 'drills'} match.`;
}

function noMatchMessage(label, items) {
  const topics = topicsWithItems(items);
  return topics.length > 0
    ? `No ${label} match the topics you picked. Topics with ${label}: ${topics.join(', ')}.`
    : `There are no ${label} in the bank yet.`;
}

// ---- Codes --------------------------------------------------------------

const currentCode = () => (state.tab === 'dbq' ? state.dbqCode : state.drillCode);

function showCode(code) {
  $('current-code').textContent = code ?? '–';
  try {
    history.replaceState(null, '', code ? `#${code}` : location.pathname + location.search);
  } catch {
    // Some frames refuse history changes; the code box still shows the code.
  }
}

function selectCode() {
  const range = document.createRange();
  range.selectNodeContents($('current-code'));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function copyText(text, button, fallback) {
  button.dataset.label ??= button.textContent;
  const flash = (message) => {
    button.textContent = message;
    setTimeout(() => { button.textContent = button.dataset.label; }, 2000);
  };
  const failed = () => {
    fallback();
    flash('Press Ctrl+C or ⌘C');
  };
  try {
    navigator.clipboard.writeText(text).then(() => flash('Copied'), failed);
  } catch {
    failed();
  }
}

function openCode(text) {
  const result = resolveCode(parseCode(text), bank, docsById);
  if (!result.ok) {
    notify(result.message);
    return false;
  }
  notify(null);
  if (result.kind === 'dbq') {
    selectTab('dbq', false);
    showDbq(result.prompt, result.seed, result.entries);
  } else {
    selectTab('drill', false);
    showDrill(result.kind, result.item);
  }
  return true;
}

// ---- Tabs ---------------------------------------------------------------

function selectTab(tab, fillEmpty = true) {
  state.tab = tab;
  for (const name of ['dbq', 'drill']) {
    $(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
    $(`panel-${name}`).hidden = name !== tab;
  }
  if (fillEmpty && tab === 'drill' && !state.drillCode) newDrill();
  showCode(currentCode());
}

// ---- Documents ----------------------------------------------------------

function chips(topics) {
  return el('div', { class: 'chips' }, topics.map((t) => el('span', { class: 'chip', title: TOPIC_LABELS[t] }, t)));
}

function renderTable(table) {
  return el('div', { class: 'table-wrap' }, el('table', {},
    el('caption', {}, table.caption),
    el('thead', {}, el('tr', {}, table.columns.map((c) => el('th', { scope: 'col' }, c)))),
    el('tbody', {}, table.rows.map((row) => el('tr', {}, row.map((cell) => el('td', {}, String(cell)))))),
  ));
}

function renderDocument(doc, title) {
  return el('section', { class: 'document' },
    el('h3', {}, title),
    el('p', { class: 'source' }, el('b', {}, 'Source: '), doc.sourceLine),
    doc.kind === 'table'
      ? renderTable(doc.table)
      : el('div', { class: 'excerpt' }, doc.text.split(/\n\s*\n/).map((para) => el('p', {}, para))),
    el('p', { class: 'credit' },
      doc.translation ? `${doc.translation}. ` : '',
      el('a', { href: doc.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Source text ↗'),
    ),
  );
}

function revealButton(targets, showLabel, hideLabel) {
  const button = el('button', { type: 'button', 'aria-expanded': 'false' }, showLabel);
  button.addEventListener('click', () => {
    const show = targets[0].hidden;
    for (const t of targets) t.hidden = !show;
    button.setAttribute('aria-expanded', String(show));
    button.textContent = show ? hideLabel : showLabel;
  });
  return button;
}

// ---- DBQ ----------------------------------------------------------------

function randomSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 0x100000000);
  }
}

function newDbq() {
  const prompt = pickRandom(bank.dbqs.filter((q) => matchesFilter(q, state.topics)), state.recentDbqs, Math.random);
  if (!prompt) {
    notify(noMatchMessage('DBQs', bank.dbqs));
    return;
  }
  for (let tries = 0; tries < 5; tries++) {
    const seed = randomSeed();
    try {
      showDbq(prompt, seed, drawDbq(prompt, docsById, seed));
      return;
    } catch {
      // Validation proves 1,000 seeds per prompt; on the rare miss, try another seed.
    }
  }
  notify('This DBQ could not be drawn. Choose New DBQ to try again.');
}

function showDbq(prompt, seed, entries) {
  state.recentDbqs = pushRecent(state.recentDbqs, prompt.id, RECENT_DBQS);
  store.set('recentDbqs', state.recentDbqs);
  state.dbqCode = formatCode({ kind: 'dbq', id: prompt.id, seed });
  $('dbq').replaceChildren(renderDbq(prompt, entries));
  if (state.tab === 'dbq') showCode(state.dbqCode);
}

function renderDbq(prompt, entries) {
  const guide = renderDbqGuide(prompt, entries);
  guide.hidden = true;
  return el('div', { class: 'question' },
    el('div', { class: 'question-head' },
      el('p', { class: 'eyebrow' }, 'Question 1 · Document-based question'),
      el('p', { class: 'directions' }, 'Suggested reading period: 15 minutes. Suggested writing time: 45 minutes.'),
      el('h2', { class: 'prompt' }, prompt.prompt),
      chips(prompt.topics),
      el('div', { class: 'directions' }, 'In your response you should:', el('ul', {}, DBQ_TASKS.map((t) => el('li', {}, t)))),
    ),
    entries.map((entry, i) => renderDocument(docsById.get(entry.doc), `Document ${i + 1}`)),
    el('div', { class: 'toolbar' }, revealButton([guide], 'Show scoring guide', 'Hide scoring guide')),
    guide,
  );
}

function noteList(title, items) {
  return [el('h3', {}, title), el('ul', { class: 'notes' }, items.map((t) => el('li', {}, t)))];
}

function renderDbqGuide(prompt, entries) {
  const numberOf = new Map(entries.map((e, i) => [e.doc, i + 1]));
  return el('section', { class: 'guide', 'aria-label': 'Scoring guide' },
    el('h3', {}, 'Scoring guide · 7 points'),
    el('table', { class: 'rubric' }, el('tbody', {}, RUBRIC.map(([name, what, points]) => el('tr', {},
      el('td', {}, el('b', {}, name), el('br'), what),
      el('td', { class: 'pts' }, `${points} ${points === 1 ? 'pt' : 'pts'}`),
    )))),
    el('h3', {}, 'Ways to group these documents'),
    el('ul', { class: 'notes' }, prompt.groups.map((g) => {
      const numbers = entries.filter((e) => e.group === g.key).map((e) => numberOf.get(e.doc));
      return el('li', {}, `${g.label}: Documents ${numbers.join(', ')}`);
    })),
    noteList('Example theses', prompt.notes.thesis),
    noteList('Contextualization', prompt.notes.contextualization),
    noteList('Evidence beyond the documents', prompt.notes.outsideEvidence),
    el('h3', {}, 'Sourcing ideas for these documents'),
    el('ul', { class: 'notes' }, entries.map((e) => el('li', {}, el('b', {}, `Document ${numberOf.get(e.doc)}. `), e.sourcing))),
    noteList('Complexity', prompt.notes.complexity),
  );
}

// ---- Drills -------------------------------------------------------------

function drillPool() {
  const wrap = (kind) => (item) => ({ id: formatCode({ kind, id: item.id }), kind, item });
  const saqs = bank.saqs.map(wrap('saq'));
  const mcqs = bank.mcqs.map(wrap('mcq'));
  return state.drillKind === 'saq' ? saqs : state.drillKind === 'mcq' ? mcqs : [...saqs, ...mcqs];
}

function newDrill() {
  const pool = drillPool();
  const pick = pickRandom(pool.filter((c) => matchesFilter(c.item, state.topics)), state.recentDrills, Math.random);
  if (!pick) {
    const label = { any: 'drills', saq: 'short-answer questions', mcq: 'multiple-choice sets' }[state.drillKind];
    notify(noMatchMessage(label, pool.map((c) => c.item)));
    return;
  }
  showDrill(pick.kind, pick.item);
}

function showDrill(kind, item) {
  state.drillCode = formatCode({ kind, id: item.id });
  state.recentDrills = pushRecent(state.recentDrills, state.drillCode, RECENT_DRILLS);
  store.set('recentDrills', state.recentDrills);
  $('drill').replaceChildren(kind === 'saq' ? renderSaq(item) : renderMcq(item));
  if (state.tab === 'drill') showCode(state.drillCode);
}

function renderSaq(saq) {
  const docs = saq.docs.map((id) => docsById.get(id));
  const guides = [];
  const parts = saq.parts.map((part) => {
    const guide = el('div', { class: 'accept', hidden: true },
      el('p', { class: 'label' }, 'Earns the point'),
      el('ul', {}, part.accept.map((a) => el('li', {}, a))),
    );
    guides.push(guide);
    return el('div', { class: 'part' },
      el('label', { class: 'part-task', for: `answer-${part.label}` }, el('b', {}, `(${part.label}) `), part.task),
      el('textarea', { id: `answer-${part.label}`, rows: 4 }),
      guide,
    );
  });
  const directions = docs.length === 0
    ? 'Answer all parts of the question that follows.'
    : `Use the ${docs.length === 1 ? 'source' : 'sources'} below to answer all parts of the question that follows.`;
  return el('div', { class: 'question' },
    el('div', { class: 'question-head' },
      el('p', { class: 'eyebrow' }, 'Short-answer question'),
      chips(saq.topics),
      el('p', { class: 'directions' }, directions),
    ),
    docs.map((doc, i) => renderDocument(doc, docs.length === 1 ? 'Source' : `Source ${i + 1}`)),
    parts,
    el('div', { class: 'toolbar' }, revealButton(guides, 'Show scoring guide', 'Hide scoring guide')),
  );
}

function renderMcq(set) {
  const score = el('p', { class: 'score', hidden: true });
  const questions = set.questions.map((q, qi) => {
    const name = `q${qi + 1}`;
    const options = q.options.map((text, oi) => {
      const id = `${name}-${LETTERS[oi].toLowerCase()}`;
      return el('label', { class: 'option', for: id },
        el('input', { type: 'radio', name, id, value: oi }),
        el('span', { class: 'letter' }, `(${LETTERS[oi]})`),
        el('span', {}, text),
      );
    });
    const feedback = el('div', { class: 'feedback', hidden: true });
    const node = el('fieldset', { class: 'mcq' }, el('legend', {}, `${qi + 1}. ${q.stem}`), options, feedback);
    return { q, name, options, feedback, node };
  });
  const check = el('button', { type: 'button', class: 'primary' }, 'Check answers');
  check.addEventListener('click', () => {
    let right = 0;
    for (const { q, name, options, feedback } of questions) {
      const picked = document.querySelector(`input[name="${name}"]:checked`);
      const choice = picked ? Number(picked.value) : null;
      if (choice === q.answer) right++;
      options.forEach((option, oi) => {
        option.dataset.mark = oi === q.answer ? 'correct' : oi === choice ? 'wrong' : '';
      });
      const verdict = choice === null
        ? `Not answered. The answer is (${LETTERS[q.answer]}).`
        : choice === q.answer ? 'Correct.' : `Incorrect. The answer is (${LETTERS[q.answer]}).`;
      feedback.replaceChildren(
        el('p', { class: `verdict ${choice === q.answer ? 'good' : 'bad'}` }, verdict),
        el('p', { class: 'explanation' }, q.explanation),
      );
      feedback.hidden = false;
    }
    score.textContent = `${right} of ${questions.length} correct`;
    score.hidden = false;
  });
  return el('div', { class: 'question' },
    el('div', { class: 'question-head' },
      el('p', { class: 'eyebrow' }, 'Multiple choice'),
      chips(set.topics),
      el('p', { class: 'directions' }, `Questions 1–${questions.length} refer to the source below.`),
    ),
    renderDocument(docsById.get(set.doc), 'Source'),
    questions.map((x) => x.node),
    el('div', { class: 'toolbar' }, check, score),
  );
}

// ---- Timer --------------------------------------------------------------

function toggleTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
    state.timerStart = null;
  } else {
    state.timerStart = Date.now();
    state.timerId = setInterval(renderTimer, 1000);
  }
  renderTimer();
}

function renderTimer() {
  const out = $('timer');
  const button = $('timer-toggle');
  if (state.timerStart == null) {
    out.hidden = true;
    button.textContent = 'Start 60-minute timer';
    return;
  }
  const { phase, remainingMs } = timerState(state.timerStart, Date.now());
  out.hidden = false;
  out.dataset.phase = phase;
  out.textContent = phase === 'reading'
    ? `Reading period · ${formatClock(remainingMs)} left`
    : phase === 'writing' ? `Writing · ${formatClock(remainingMs)} left` : 'Time is up';
  if (phase === 'done') {
    clearInterval(state.timerId);
    state.timerId = null;
    button.textContent = 'Start 60-minute timer';
  } else {
    button.textContent = 'Stop timer';
  }
}

// ---- Start --------------------------------------------------------------

function init() {
  renderTopics();
  for (const input of document.querySelectorAll('input[name="drill-kind"]')) {
    input.checked = input.value === state.drillKind;
    input.addEventListener('change', () => {
      state.drillKind = input.value;
      store.set('drillKind', state.drillKind);
    });
  }
  $('tab-dbq').addEventListener('click', () => { notify(null); selectTab('dbq'); });
  $('tab-drill').addEventListener('click', () => { notify(null); selectTab('drill'); });
  $('new-dbq').addEventListener('click', () => { notify(null); newDbq(); });
  $('new-drill').addEventListener('click', () => { notify(null); newDrill(); });
  $('timer-toggle').addEventListener('click', toggleTimer);
  $('copy-code').addEventListener('click', (event) => {
    const code = currentCode();
    if (code) copyText(code, event.currentTarget, selectCode);
  });
  if (bank.config.shareBase) {
    $('copy-link').hidden = false;
    $('copy-link').addEventListener('click', (event) => {
      const code = currentCode();
      if (!code) return;
      const link = `${bank.config.shareBase}#${code}`;
      copyText(link, event.currentTarget, () => notify(`Copy this link: ${link}`));
    });
  }
  $('open-code-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (openCode($('open-code').value)) $('open-code').value = '';
  });
  window.addEventListener('hashchange', () => openCode(location.hash));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTimer(); });
  if (!(location.hash.length > 1 && openCode(location.hash))) newDbq();
}

init();
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, including all 9 build tests. If `node --check` reports a duplicate declaration, rename the clashing top-level name in the later module.

- [ ] **Step 8: Look at the page with fixture data**

Build a throwaway page from the fixture bank in the scratchpad, then serve it:

```bash
SCRATCH=/private/tmp/claude-501/-Users-martinkjeldsen-Development-nat/8a90184d-ee6b-42fe-b510-a177c43ba0e8/scratchpad/fixture-page
node --input-type=module -e "
import { makeData, writeDataDir } from './test/helpers/fixture.js';
import { build } from './tools/build.js';
const d = makeData();
d.documents.forEach((doc, i) => { doc.topics = [['4.1','4.3','4.5','4.6'][i % 4]]; });
await writeDataDir('$SCRATCH/data', d);
await build({ dataDir: '$SCRATCH/data', outDir: '$SCRATCH/dist' });
"
python3 -m http.server 8765 --directory "$SCRATCH/dist"   # run in background
```

Load the `claude-in-chrome` skill. Open `http://localhost:8765/local.html` in a new tab and check:
- A DBQ is showing on load (fixture prompt), with 7 documents numbered 1–7.
- "Show scoring guide" reveals the rubric, groups, notes and sourcing for exactly the 7 drawn documents.
- The code updates. Typing `nonsense` into "Open a code" shows the invalid-code message and keeps the DBQ. `dbq.gone.1` says the DBQ is no longer in the bank.
- Untick every topic and choose New DBQ: the message names `4.3`. Tick only 4.3: New DBQ works, and offers the only prompt again.
- Short drills tab: SAQ and multiple choice both render. "Check answers" marks the answers and shows "n of 3 correct".
- The timer starts at "Reading period · 15:00 left", and Stop hides it.
- At 400px width there's no horizontal scroll.

Stop the server afterwards. Fix anything broken, rerun `npm test`, then continue.

- [ ] **Step 9: Commit**

```bash
git add src/index.html src/styles.css src/app.js tools/build.js test/build.test.js
git commit -F - <<'EOF'
Add the practice page and single-file build

DBQ tab draws a fresh balanced set with exam directions, an optional
wall-clock timer and a reveal-on-demand scoring guide; the drill tab
serves SAQs with scoring guides and MCQ sets with an answer key. The
build validates the bank, then inlines styles, scripts and data
(escaped so source text can never break out of its script tag) into
dist/index.html for publishing and dist/local.html for printing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Research the document bank

**Files:**
- Create: `data/research/cluster-a.json`, `cluster-b.json`, `cluster-c.json`, `cluster-d.json`
- Created by the agents' self-checks: `data/research/cluster-?-report.json`

**Interfaces:**
- Consumes: `node tools/check-sources.js --text <url>` (copying text) and `node tools/check-sources.js data/research/cluster-<x>.json` (self-check, without `--mark`).
- Produces: one cluster file per agent in this shape (Task 7 merges them):

```json
{
  "cluster": "a",
  "documents": [ { "...": "document objects, schema below, verified: false" } ],
  "poolHints": [ { "dbq": "exploration-causes", "doc": "zurara-1453-chronicle-guinea", "group": "religious", "why": "Lists converting Africans and fighting Muslim power among Henry's reasons" } ],
  "gaps": [ "Sources searched for but not usable, and why" ]
}
```

The ten prompt ids, fixed now because the pool hints use them:

| id | topics | prompt |
|---|---|---|
| `exploration-causes` | 4.1, 4.2 | Evaluate the relative importance of the causes of European maritime exploration in the period c. 1450–1750. |
| `empire-building` | 4.4 | Evaluate the extent to which European states relied on violence rather than negotiation and alliance to build maritime empires in the period c. 1450–1750. |
| `columbian-exchange` | 4.3, 4.8 | Evaluate the extent to which the Columbian Exchange changed societies in the Americas, Africa and Europe in the period 1492–1750. |
| `americas-social-hierarchy` | 4.7, 4.8 | Evaluate the extent to which social hierarchies in the Spanish and Portuguese Americas changed in the period 1500–1750. |
| `slave-trade-africa` | 4.4, 4.5 | Evaluate the effects of the Atlantic slave trade on African states and societies in the period c. 1450–1750. |
| `silver-trade` | 4.3, 4.5 | Evaluate the extent to which the global silver trade transformed economies in the period 1550–1750. |
| `mercantilism` | 4.5 | Evaluate the extent to which mercantilism shaped how European states and joint-stock companies ran their empires in the period 1600–1750. |
| `east-asia-responses` | 4.4, 4.5, 4.6 | Evaluate how East Asian states responded to European traders and missionaries in the period 1550–1750. |
| `indigenous-resistance` | 4.6 | Evaluate the extent to which Indigenous peoples resisted European colonization in the Americas in the period 1492–1750. |
| `challenges-to-state-power` | 4.6 | Evaluate the causes of rebellions and other challenges to state power in the period c. 1450–1750. |

- [ ] **Step 1: Dispatch four research agents in parallel**

Send all four in one message (`general-purpose`). Each prompt is the shared brief below followed by that agent's cluster section. They write to different files, so they can't collide.

````text
You are researching primary-source documents for an AP World History practice tool covering AMSCO Unit 4 (c. 1450–1750). Students will read these excerpts as DBQ documents, so every word must be genuine. A wrong or invented quotation is the worst possible failure. Work in ~/Development/nat.

RULES
1. Primary sources only, created between 1450 and 1750. An account written later about events in the period is acceptable when its author lived through them (e.g. Bernal Díaz, written c. 1568, about 1519–21). Secondary sources and modern historians are never acceptable.
2. Copy excerpts only from the text of a page you fetched. Never type a quotation from memory, never paraphrase, and never "tidy" wording. To see a page's exact text, run:
     node tools/check-sources.js --text '<url>' > /private/tmp/claude-501/-Users-martinkjeldsen-Development-nat/8a90184d-ee6b-42fe-b510-a177c43ba0e8/scratchpad/<name>.txt
   then read or grep that file and copy from it. Do not take quotations from WebFetch summaries: that tool rewrites text.
3. Usable texts and translations: anything published before 1930; openly licensed text (public domain, CC BY, CC BY-SA); and the Fordham Internet History Sourcebooks. Good places to look: sourcebooks.fordham.edu, en.wikisource.org, gutenberg.org, archive.org full text (the "FULL TEXT" / _djvu.txt view), Hakluyt Society volumes on archive.org, Avalon Project (avalon.law.yale.edu), and US government publications (public domain). Record the translator and year in "translation" (null for texts written in English).
4. Excerpt length is 80–180 words (hard limits 60–200). Mark cuts with the single character "…" and keep each piece between cuts at least 6 words long. Use [square brackets] only for a short clarifying insertion, e.g. "[the king of Portugal]".
5. Prefer the text exactly as printed. If old spelling would stop a 10th-grader (e.g. "vs" for "us", long s), you may modernise spelling and punctuation only. Then set "adapted": true, put the exact page text in "original", and end "sourceLine" with " (adapted)". Never change words, order or meaning.
6. "sourceUrl" must be the page that contains the excerpt (a deep link to a chapter or letter, not a search page or table of contents). One page per document.
7. Aim for perspectives beyond European elites wherever sources exist: African, Asian and Indigenous American authors or rulers, enslaved or colonised people, women, merchants. Say in "gaps" when a perspective could not be found in a usable text.

DOCUMENT SCHEMA (each entry of "documents")
{
  "id": "<authorkey>-<year>-<short-slug>",      // lowercase letters, digits and hyphens, e.g. "afonso-kongo-1526-letter-joao"
  "authorKey": "<author>",                         // same value for every document by the same person or body, e.g. "afonso-kongo"
  "sourceLine": "<Author>, <who they were, as relevant to point of view>, <title or kind of document>, <date>",
                                                   // e.g. "Afonso I (Nzinga Mbemba), king of Kongo, letter to King João III of Portugal, 1526"
  "year": 1526,                                    // integer for sorting; best estimate if the date is "c."
  "kind": "text",
  "text": "<the excerpt>",
  "adapted": false,
  "original": null,
  "translation": "Translated by <name>, <title of edition>, <year>" or null,
  "topics": ["4.5", "4.4"],                        // AMSCO Unit 4 topics: 4.1 technology, 4.2 exploration, 4.3 Columbian Exchange, 4.4 maritime empires established, 4.5 maritime empires maintained, 4.6 challenges to state power, 4.7 social hierarchies, 4.8 continuity and change
  "sourceUrl": "https://…",
  "verified": false
}

POOL HINTS: for every document, add one poolHints entry per prompt it could serve: {dbq, doc, group, why}. "group" must be one of the group keys listed for that prompt below. "why" says in one sentence what the document shows for that line of argument.

TARGET: at least 13 candidate documents per assigned prompt, counting documents shared between prompts. That way some can fail verification and each pool still reaches 9–12. For each group, find documents by at least 3 different authors.

BEFORE YOU FINISH: write data/research/cluster-<x>.json, then run
  node tools/check-sources.js data/research/cluster-<x>.json
(without --mark). For every document reported as mismatch, fix the excerpt so it matches the page exactly, or replace the document. Re-run until every document is a match or is a fetch failure you explain in "gaps". If fetching fails with a sandbox or network error, stop and report it; do not work around it.

REPORT BACK: counts per prompt and per group, the share of non-European voices, the contents of "gaps", and any document you are unsure about and why.
````

**Cluster A** (`data/research/cluster-a.json`): `exploration-causes`, `empire-building`

````text
YOUR CLUSTER: "a". Prompts:
- exploration-causes. Groups: "economic" (gold, spices, new trade routes, profit); "religious" (spreading Christianity, fighting Muslim powers); "state" (royal sponsorship, rivalry between states, and the navigational technology that made the voyages possible, topic 4.1).
- empire-building. Groups: "force" (conquest, coercion, forts, bombardment, massacre); "negotiation" (alliances, treaties, trade agreements, local partners and rulers who set terms).
Starting points (find a usable text for each before relying on it; add others): Gomes Eanes de Zurara, Chronicle of the Discovery and Conquest of Guinea (1453), the chapter on Prince Henry's reasons; papal bulls Romanus Pontifex (1455) and Inter Caetera (1493); Treaty of Tordesillas (1494); Capitulations of Santa Fe (1492); Columbus, letter on the first voyage (1493) and the letter from Jamaica (1503); Henry VII's letters patent to John Cabot (1496); journal of Vasco da Gama's first voyage (attributed to Álvaro Velho, 1497–99); Manuel I's letter announcing da Gama's return (1499); Afonso de Albuquerque's speech before Malacca (1511) in his Commentaries; Duarte Barbosa (c. 1518); Martín Cortés / Pedro de Medina navigation manuals (English translations 1561/1581); Antonio Pigafetta on Magellan (c. 1525); Hernán Cortés, second letter (1520); Bernal Díaz del Castillo (c. 1568), including the alliance with Tlaxcala; the Requerimiento (1513); Bartolomé de las Casas (1542); Jan Pieterszoon Coen to the VOC directors (1614); Powhatan's speech as recorded by John Smith (1624); Thomas Roe's embassy journal and Jahangir's letter to James I (1615–17); Richard Hakluyt, Discourse of Western Planting (1584); William Penn's letter to the Lenape (1681).
````

**Cluster B** (`data/research/cluster-b.json`): `columbian-exchange`, `americas-social-hierarchy`

````text
YOUR CLUSTER: "b". Prompts:
- columbian-exchange. Groups: "disease" (epidemics and population collapse); "food-animals" (crops and livestock moving in both directions, and what they did to diets, land and populations); "labor-economy" (cash crops, plantations and the forced labour the exchange fed).
- americas-social-hierarchy. Groups: "race-caste" (hierarchies built on birth and ancestry: peninsulares, creoles, mestizos, castas, enslaved Africans); "mobility" (people who moved within or around the hierarchy, e.g. mestizos, creoles, free people of colour, women in convents); "coerced-labor" (labour systems that kept Indigenous and African people at the bottom: encomienda, mita, slavery).
Starting points (find a usable text for each before relying on it; add others): Motolinía, History of the Indians of New Spain (1541); Bernardino de Sahagún, Florentine Codex book 12 on smallpox (check the translation's licence); Bernal Díaz on smallpox; Gonzalo Fernández de Oviedo, Natural History of the West Indies (1526); Thomas Hariot, A Briefe and True Report of Virginia (1588); John Winthrop's letter on smallpox (1634); William Bradford, Of Plymouth Plantation; Garcilaso de la Vega, Royal Commentaries of the Incas (1609; Markham translation 1869–71), both on new crops and animals in Peru and on the names mestizo, criollo and mulato; John Gerard, Herball (1597); Richard Ligon, True and Exact History of Barbados (1657); José de Acosta (1590; Grimston translation 1604); Pedro Cieza de León (1553; Markham translation); Antonio Vázquez de Espinosa (c. 1620; Smithsonian translation 1942, a US government publication); Thomas Gage, The English-American (1648); Jorge Juan and Antonio de Ulloa, A Voyage to South America (1748; English 1758); the New Laws of 1542; Virginia's laws of 1662 and 1705 (Hening's Statutes); the Code Noir (1685); Sor Juana Inés de la Cruz's Reply to Sor Filotea (1691), if a usable translation exists.
````

**Cluster C** (`data/research/cluster-c.json`): `slave-trade-africa`, `silver-trade`, `mercantilism`

````text
YOUR CLUSTER: "c". Prompts:
- slave-trade-africa. Groups: "harm" (violence, depopulation, damage to African states and communities); "power" (African states and elites that controlled the trade and grew stronger or richer from it); "change" (new goods and firearms, and changes in labour, gender balance and social structure).
- silver-trade. Groups: "production" (mining and forced labour in the Americas, including mercury amalgamation, topic 4.1); "asia" (silver flowing to China and through Manila, and what it did there); "europe" (prices, state finance and debate about bullion in Europe).
- mercantilism. Groups: "state-policy" (governments regulating trade to build national wealth); "companies" (joint-stock companies acting with state powers); "colonies" (colonies made to serve the mother country, and the friction this caused).
Starting points (find a usable text for each before relying on it; add others): Afonso I of Kongo's letters to João III (1526); Willem Bosman, Description of the Coast of Guinea (1704; English 1705); John Barbot (1732); William Snelgrave, New Account of Some Parts of Guinea (1734), on Dahomey under Agaja; Thomas Phillips, journal of the Hannibal (1693–94); Francis Moore, Travels into the Inland Parts of Africa (1738); Thomas Bluett, Some Memoirs of the Life of Job (Ayuba Suleiman Diallo, 1734); the Royal African Company charter (1672); José de Acosta on Potosí and amalgamation (1590); Pedro Cieza de León on Potosí; Antonio Vázquez de Espinosa on the Potosí mita (Smithsonian 1942); Antonio de Morga, Sucesos de las Islas Filipinas (1609; Stanley translation 1868); Blair and Robertson, The Philippine Islands 1493–1898 (public domain, on Gutenberg), with letters on silver, the Manila galleon and Chinese merchants; Juan González de Mendoza on China (1585; translation 1588/1853); Gemelli Careri on the Manila galleon (English 1704); Thomas Mun, England's Treasure by Forraign Trade (1664); Edward Misselden, Free Trade (1622); Josiah Child, New Discourse of Trade (1668/1693); Jean-Baptiste Colbert's memoranda on trade; the Navigation Acts (1651, 1660); the English East India Company charter (1600); the VOC charter (1602), if an old translation exists; the Hudson's Bay Company charter (1670); the Molasses Act (1733); Hugo Grotius, Mare Liberum (1609; Magoffin translation 1916).
````

**Cluster D** (`data/research/cluster-d.json`): `east-asia-responses`, `indigenous-resistance`, `challenges-to-state-power`

````text
YOUR CLUSTER: "d". Prompts:
- east-asia-responses. Groups: "restriction" (expulsions, bans and closed ports); "controlled-contact" (trade and missions allowed only on the state's terms, e.g. Dejima, licensed ports, Jesuits at court); "interest" (rulers and scholars who valued European knowledge or goods).
- indigenous-resistance. Groups: "armed" (wars and revolts); "negotiated" (diplomacy, legal appeals and accommodation that bought autonomy); "cultural" (keeping beliefs, language and identity alive, including blending them with Christianity).
- challenges-to-state-power. Groups: "religion" (religious conflict and dissent); "taxes-economy" (taxes, debt and economic hardship); "local-power" (nobles, regional elites, ethnic groups or rival states resisting central rule).
Starting points (find a usable text for each before relying on it; add others): Toyotomi Hideyoshi's edict expelling missionaries (1587); the Tokugawa edicts of 1614, 1635 and 1639; Francis Xavier's letters from Japan (1549–52; Coleridge translation 1872); Engelbert Kaempfer, History of Japan (English 1727), on Dejima; Matteo Ricci's account via Trigault, as excerpted in Purchas his Pilgrimes (1625); the Kangxi Emperor's comments on Christianity (1692 toleration, 1721 response to the papal legate); Hendrick Hamel's journal of Korea (1668); Peter Mundy at Canton (1637); Pueblo Revolt testimony (Pedro Naranjo, Josephe, 1681; check the translation's status); John Easton, A Relacion of the Indyan Warre (1675), giving Metacom's grievances; Powhatan as recorded by John Smith (1624); Las Casas on Hatuey (1542); the Jesuit Relations (Thwaites edition, 1896–1901); Canassatego at the Treaty of Lancaster (1744); the treaty with Cudjoe's Maroons in Jamaica (1739); Cristóbal de Molina on the Incas (Markham translation 1873); Shivaji's letter to Aurangzeb on the jizya (1679, as translated by Jadunath Sarkar; note the attribution question); the English Petition of Right (1628), Grand Remonstrance (1641) and Charles I's speech on the scaffold (1649); Cardinal de Retz's memoirs of the Fronde (English 1723); Ogier Ghiselin de Busbecq's Turkish letters (1555–62; Forster translation 1881); the Twelve Articles of the German peasants (1525); Stenka Razin's proclamation (1670), if a usable translation exists; Nicolaes Couckebacker or other Dutch accounts of the Shimabara rebellion (1637–38).
````

- [ ] **Step 2: Check what came back**

When all four agents have reported:

```bash
node -e "
const fs=require('fs');const hints={};const groups={};
for (const c of ['a','b','c','d']) {
  const f=JSON.parse(fs.readFileSync('data/research/cluster-'+c+'.json','utf8'));
  console.log(c, f.documents.length, 'documents,', (f.gaps||[]).length, 'gaps');
  for (const h of f.poolHints) { hints[h.dbq]=(hints[h.dbq]||new Set()).add(h.doc); const k=h.dbq+'/'+h.group; groups[k]=(groups[k]||0)+1; }
}
for (const [d,s] of Object.entries(hints)) console.log(d.padEnd(28), s.size);
console.log(groups);
"
```

Expected: every one of the 10 prompt ids has at least 13 candidate documents, and every group has at least 3. Wherever a prompt or group falls short, send that cluster's agent a follow-up via SendMessage, naming the shortfall, before moving on.

- [ ] **Step 3: Commit the research drafts**

```bash
git add data/research/cluster-*.json data/research/cluster-*-report.json
git commit -F - <<'EOF'
Add research drafts for the Unit 4 document bank

Four topic clusters of candidate primary-source excerpts with source
links, translation credits and suggested DBQ pool placements. These
are drafts: nothing enters the bank until the verification pass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Verify the documents and promote them into the bank

**Files:**
- Create: `data/research/candidates.json`, `data/research/candidates-report.json`
- Modify: `data/documents.json`

**Interfaces:**
- Consumes: the cluster files from Task 6; `tools/candidates.js`; `tools/check-sources.js`.
- Produces: `data/documents.json`, holding only documents with `verified: true` and `verifiedBy: "script"` or `"manual"` (plus a `verifiedNote` for manual checks).

- [ ] **Step 1: Merge and run the mechanical check**

```bash
node tools/candidates.js merge
node tools/check-sources.js data/research/candidates.json --mark
```

Expected: a merge summary and conflict list, then counts of `match` / `mismatch` / `fetch-failed` / `manual`. Resolve each merge conflict by hand in `candidates.json`: keep the version whose text matches its source.

- [ ] **Step 2: Dispatch the independent verifier**

Send one fresh `general-purpose` agent, which must not be one of the research agents:

````text
You are the independent verifier for a primary-source document bank used by AP World History students (AMSCO Unit 4, c. 1450–1750). You did not do the research, and you should not trust it. Work in ~/Development/nat on data/research/candidates.json. data/research/candidates-report.json lists the documents a script could not confirm.

For EVERY document whose report status is not "match":
1. Get the page's exact text: node tools/check-sources.js --text '<sourceUrl>' > <scratch file>. For a PDF or scanned book, download it into its own new folder in /private/tmp/claude-501/-Users-martinkjeldsen-Development-nat/8a90184d-ee6b-42fe-b510-a177c43ba0e8/scratchpad and extract the text (pdftotext if available), or use archive.org's full-text view.
2. Find the excerpt in that text. If the only differences are transcription slips (a dropped word, a changed spelling, punctuation), correct the document's "text" (or "original", if adapted) to match the source exactly. Never change the source to fit the excerpt. Then re-run: node tools/check-sources.js data/research/candidates.json --mark --only <id>
3. If the script still can't confirm it but you have confirmed it by eye (for example a scan with OCR noise), set "verified": true, "verifiedBy": "manual" and "verifiedNote": "<what you compared, with page or section>".
4. If the excerpt isn't in the source, or the page is the wrong work, set "dropped": "<reason>". Do not hunt for a replacement; that is not your job.

For EVERY document, including the script matches, also check:
- The sourceLine names the right author, role, work and date, as stated by the source page or edition. Fix errors and note them.
- "year" matches the date in sourceLine.
- The translation credit names the translation actually on the page.
- For adapted documents, "text" differs from "original" only in spelling and punctuation. If words were changed, set "dropped".
- The text is primary, written 1450–1750 (or a later account by someone who lived through the events). If not, set "dropped".

Finish when every candidate is either verified or dropped. Report: how many were verified by script, how many by hand, how many dropped and why, and every correction you made to a sourceLine.
````

- [ ] **Step 3: Promote and validate**

```bash
node tools/candidates.js promote
node tools/validate.js
npm test
```

Expected: `Promoted N verified documents; dropped M.` with N ≥ 60, then `The bank is valid.` and all tests PASS. If N < 60, list which prompts lost the most documents and send the matching research agent a targeted follow-up. Its new documents go through Steps 1–2 again: append them to `candidates.json` and run the check with `--only`.

- [ ] **Step 4: Commit**

```bash
git add data/documents.json data/research/candidates.json data/research/candidates-report.json
git commit -F - <<'EOF'
Add verified Unit 4 document bank

Every document was confirmed against its source page, by the
mechanical check or by an independent manual comparison recorded in
verifiedNote. Candidates that could not be confirmed were dropped,
with reasons kept in data/research/candidates.json.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Write the DBQ prompts

**Files:**
- Modify: `data/dbqs.json`

**Interfaces:**
- Consumes: `data/documents.json`; the `poolHints` in `data/research/cluster-*.json`; the prompt table in Task 6.
- Produces: 10 prompts in the spec's DBQ shape, with the ids, topics and prompt wording from Task 6.

For each prompt, in this order: `exploration-causes`, `empire-building`, `columbian-exchange`, `americas-social-hierarchy`, `slave-trade-africa`, `silver-trade`, `mercantilism`, `east-asia-responses`, `indigenous-resistance`, `challenges-to-state-power`.

- [ ] **Step 1: Choose the pool and groups**

- Use the group keys listed in Task 6. Labels are short phrases a student would use, e.g. `"Disease and population collapse"`.
- Choose 9–12 verified documents from the hints. Each group needs documents by at least 3 different authors where the bank allows, and at least 2 in every case. The pool needs at least 7 different authors.
- Prefer a mix: at least two non-European voices where the bank has them, documents that disagree, and different kinds of source (law, letter, chronicle, petition, travel account).

- [ ] **Step 2: Write a sourcing note for each pool document**

One or two sentences that name the point of view, purpose, historical situation or audience, and say how it affects the document's use as evidence for *this* prompt. Example: *"Afonso writes to the Portuguese king he depends on, so he blames Portuguese merchants and spares Kongo's own nobles, who also sold captives. That purpose makes the letter strong evidence of harm to royal authority but weak evidence of who profited."*

- [ ] **Step 3: Write the notes**

- `thesis`: 2–3 defensible claims, each with a line of reasoning that answers the prompt's task ("relative importance", "extent", "effects", "how").
- `contextualization`: 2–3 broader developments from before or during the period, e.g. Ottoman control of eastern Mediterranean trade routes, or the end of the Reconquista in 1492.
- `outsideEvidence`: 4–6 specific items from AMSCO Unit 4 that no pool document covers, e.g. caravel, lateen sail, astrolabe, encomienda, mita, Manila galleons, the Treaty of Tordesillas, joint-stock companies, the Dutch at Dejima.
- `complexity`: 2–3 routes, e.g. explaining both similarity and difference, corroborating across groups, or qualifying with a counter-argument.

- [ ] **Step 4: Validate after each prompt**

Run: `node tools/validate.js`
Expected: `The bank is valid.` A "no balanced set" error means the pool is too narrow: add documents or replace one that shares an author with another.

- [ ] **Step 5: Run the tests and commit**

```bash
npm test
git add data/dbqs.json
git commit -F - <<'EOF'
Add the ten Unit 4 DBQ prompts

Each prompt has a 9-12 document pool sorted into argument groups,
per-document sourcing notes, and rubric notes (theses,
contextualization, outside evidence, complexity). Every pool passes
the 1,000-seed balanced-draw check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Write the SAQs and multiple-choice sets

**Files:**
- Modify: `data/saqs.json`, `data/mcqs.json`

**Interfaces:**
- Consumes: `data/documents.json` (verified documents only; drills never add documents).
- Produces: ≥ 18 SAQs (aim for 20) and ≥ 13 multiple-choice sets (aim for 15) in the spec's shapes, meeting `node tools/validate.js --release` for drills.

- [ ] **Step 1: Write the SAQs**

- Mix: about 14 with one document, about 3 comparing two documents, and about 3 with no document.
- Ids: `<topic-slug>-<n>`, e.g. `potosi-mita-1`.
- Each topic 4.1–4.8 appears on at least 2 SAQs. Tag SAQs that ask about continuity or change across the period with `4.8`.
- Tasks use AP verbs and one point each: (a) usually "Identify ONE…" or "Describe ONE…", (b) and (c) "Explain ONE…" or "Explain how ONE…". A part asks for ONE thing, never a list.
- `accept`: 2–4 example answers that earn the point, written as a teacher's scoring note. Where students often get it wrong, add one line starting "Does not earn the point:".

- [ ] **Step 2: Write the multiple-choice sets**

- Each set uses one document and has 3–4 questions. Every topic 4.1–4.8 is covered by at least one set.
- Ask the kinds of questions the exam asks of a stimulus: the context that produced it, a cause, an effect, a comparison, a continuity, or the document's point of view.
- All four options are plausible and historically real. Don't use joke options or "all of the above".
- Spread the answer key across A–D; no letter may be the answer more than 40% of the time.
- `explanation`: why the right answer is right, and why the most tempting wrong option is wrong.

- [ ] **Step 3: Validate, test and commit**

```bash
node tools/validate.js --release
npm test
git add data/saqs.json data/mcqs.json
git commit -F - <<'EOF'
Add Unit 4 SAQ and multiple-choice drills

SAQs follow the exam's a/b/c format with scoring guides; MCQ sets use
one stimulus each with explained answers. Every topic 4.1-4.8 is
covered and the answer key is balanced across A-D.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Expected: `The bank is valid and meets the release minimums.` and all tests PASS.

---

### Task 10: Accuracy review

**Files:**
- Modify: `data/dbqs.json`, `data/saqs.json`, `data/mcqs.json` (fixes only)

**Interfaces:**
- Consumes: the whole bank.
- Produces: a corrected bank, and a summary of what was changed, for the release report.

This review is done in the main session (by me), not delegated. Read every DBQ note, sourcing note, SAQ scoring guide and multiple-choice question with its explanation, and check:

- [ ] **Step 1: Historical accuracy**

Dates, names, places and causal claims are right. Nothing is anachronistic (e.g. no "Canton System" before 1757). Every outside-evidence item belongs to Unit 4 c. 1450–1750 and is something AMSCO covers.

- [ ] **Step 2: Consistency with the documents**

Each sourcing note matches its document's sourceLine and content. Each SAQ part can be answered from its document plus Unit 4 knowledge. Each multiple-choice answer is supported, and no distractor is also defensible.

- [ ] **Step 3: Exam fit**

Theses answer the prompt's actual task. "Accept" lists are neither so loose that a vague answer passes nor so narrow that a good answer fails. Question stems don't give away the answer.

- [ ] **Step 4: Validate, test and commit fixes**

```bash
node tools/validate.js --release && npm test
git add data
git commit -F - <<'EOF'
Correct issues found in the accuracy review

<one line per kind of fix, e.g. "Fix the date of the Tokugawa
exclusion edict in two MCQ explanations">

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

If nothing needed fixing, skip the commit and say so in the release report.

---

### Task 11: Release

**Files:**
- Create: `site.json`
- Output (not committed): `dist/index.html`, `dist/local.html`

**Interfaces:**
- Consumes: the complete bank and the page.
- Produces: the published artifact URL, and `site.json` holding it.

- [ ] **Step 1: Build from the real bank and check the page**

```bash
node tools/validate.js --release && npm test && npm run build
python3 -m http.server 8765 --directory dist   # run in background
```

In Chrome (via the `claude-in-chrome` skill), open `http://localhost:8765/local.html` and run the Task 5 Step 8 checklist again, now with real content. Also check:
- Five New DBQ clicks give different prompts or document sets, with no prompt repeating within three clicks.
- A real excerpt with accented names and quotation marks displays exactly as written.
- Every SAQ and multiple-choice set opens from a code typed into the box.
- Print preview of `local.html` shows the prompt and documents, without controls.

Stop the server. Fix anything broken, rebuild and recheck.

- [ ] **Step 2: Publish**

Publish `dist/index.html` with the Artifact tool: `icon: "book"`, `description: "Random AP World History DBQs and short drills for AMSCO Unit 4 (c. 1450–1750), built from verified primary sources with self-check rubrics."`. Take one look at the published page if the session offers a preview. Fix what it shows, if anything, in one pass.

- [ ] **Step 3: Bake in the link and republish**

```bash
printf '{\n  "shareBase": "%s"\n}\n' '<artifact url from Step 2>' > site.json
npm run build
```

Republish the same `dist/index.html` path (no `icon`), so it goes to the same URL. "Copy link" now appears.

- [ ] **Step 4: Commit**

```bash
git add site.json
git commit -F - <<'EOF'
Record the published artifact URL for share links

The build reads site.json so "Copy link" can offer
<artifact url>#<code>.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Log the loose ends in the todo list**

Following `~/Development/todo/README.md`: add a `nat` section to `TODO.md` with dated items pointing to this repo. At minimum, list image documents (the spec's first planned extension) and any research `gaps` worth chasing. Append a dated entry to `log/2026-10.md`, add the index row to `README.md`, then commit and push the todo repo.

- [ ] **Step 6: Finish the branch**

Use superpowers:finishing-a-development-branch. The local repo has no remote, so landing `v1` means `git switch main && git merge --ff-only v1`. Report `git log --oneline main` and the artifact link.
