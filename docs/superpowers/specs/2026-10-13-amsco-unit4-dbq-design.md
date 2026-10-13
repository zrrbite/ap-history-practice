# AMSCO Unit 4 practice-question generator — design

Date: 2026-10-13. Status: agreed in conversation; written spec awaiting review.

## Purpose

A practice tool for AP World History: Modern, scoped to **Unit 4 of the AMSCO
textbook, "Transoceanic Interconnections, c. 1450–1750"** (topics 4.1–4.8). A
student opens a web page and gets a fresh, exam-style question on demand:

- a **full DBQ** (prompt + 7 documents, 60 minutes), or
- a **quick drill**: a stimulus-based **SAQ** (parts a/b/c) or a **multiple-choice
  set** (one document, 3–4 questions).

After answering, the student checks their own work against a rubric or answer
key. There is **no AI at runtime** and no automated grading of written answers.

### What the user said vs. what is assumed

Said: both DBQs and short document questions; Unit 4 of AMSCO only; show the
rubric rather than grade; real sources mixed at random (approach A), with
balanced draws; a private claude.ai page; a local git repo.

Assumed: the user is a student practising alone or with a parent/teacher, on a
phone or laptop; exam conventions follow the current (2023+) College Board
course and exam description.

### Success criteria

1. About 10 DBQ prompts, each able to produce many different balanced 7-document
   sets.
2. About 70 documents, every one a **real primary-source excerpt verified
   against an online source text**, with that link kept in the data.
3. About 20 SAQs and about 15 multiple-choice sets, each with a scoring guide or
   explained answer key.
4. The build validates all content and fails on any broken invariant.
5. The page works at phone width and in light and dark themes, and prints as a
   clean exam handout.
6. Published as a private claude.ai artifact; updates republish to the same URL.

## Topics (AMSCO Unit 4)

| Tag | Topic |
|---|---|
| 4.1 | Technological innovations, 1450–1750 |
| 4.2 | Exploration: causes and events, 1450–1750 |
| 4.3 | Columbian Exchange |
| 4.4 | Maritime empires established |
| 4.5 | Maritime empires maintained and developed |
| 4.6 | Internal and external challenges to state power |
| 4.7 | Changing social hierarchies |
| 4.8 | Continuity and change, 1450–1750 |

## Content

### Documents (`data/documents.json`)

Primary sources only. Secondary sources (modern historians) are excluded
because they are under copyright. Each document:

```json
{
  "id": "lascasas-1542-short-account",
  "authorKey": "las-casas",
  "sourceLine": "Bartolomé de las Casas, Spanish Dominican friar and former encomienda holder, A Short Account of the Destruction of the Indies, 1542",
  "year": 1542,
  "kind": "text",
  "text": "…the excerpt as shown to the student…",
  "adapted": false,
  "original": null,
  "translation": "Translator, title, year of the translation used",
  "topics": ["4.4", "4.6"],
  "sourceUrl": "https://…",
  "verified": true
}
```

- `text` is 60–200 words (the exam's range is about 80–180). Cuts are marked
  with "…". Text is otherwise verbatim from the source.
- If spelling or punctuation is modernised, `adapted` is `true`, the source line
  ends in "(adapted)", and `original` holds the verbatim text. The source check
  runs against `original`, and a reviewer confirms the adaptation changed only
  spelling and punctuation.
- `kind: "table"` replaces `text` with `{caption, columns, rows}`. A table is
  allowed only if its numbers can be checked against a page that can be fetched.
- `authorKey` identifies the author, so a draw can avoid using the same author
  twice.
- Translations are public domain or openly licensed (credited in
  `translation`). Fordham Internet History Sourcebook excerpts are acceptable.
  The source of record is the page in `sourceUrl`.
- `verified` is set only by the verification pass (below). The build refuses
  any document whose `verified` is not `true`.

### DBQ prompts (`data/dbqs.json`)

Draft list (wording may be tightened while authoring):

| Topics | Prompt |
|---|---|
| 4.1–4.2 | Evaluate the relative importance of the causes of European maritime exploration, 1450–1750 |
| 4.3 | Evaluate the extent to which the Columbian Exchange changed societies in the Americas, Africa and Europe, 1492–1750 |
| 4.4 | Evaluate the extent to which European states relied on violence rather than negotiation and alliance to build maritime empires, 1450–1750 |
| 4.5 | Evaluate the effects of the Atlantic slave trade on African states and societies, 1450–1750 |
| 4.5 | Evaluate the extent to which the global silver trade transformed economies, 1550–1750 |
| 4.5 | Evaluate the extent to which mercantilism shaped how European states and joint-stock companies ran their empires, 1600–1750 |
| 4.4–4.6 | Evaluate how East Asian states responded to European traders and missionaries, 1550–1750 |
| 4.6 | Evaluate the extent to which Indigenous peoples resisted European colonization in the Americas, 1492–1750 |
| 4.6 | Evaluate the causes of rebellions and other challenges to state power, 1450–1750 |
| 4.7 | Evaluate the extent to which social hierarchies in the Spanish and Portuguese Americas changed, 1500–1750 |

Each prompt:

```json
{
  "id": "columbian-exchange",
  "topics": ["4.3"],
  "prompt": "Evaluate the extent to which …",
  "groups": [
    {"key": "demographic", "label": "Disease and demographic collapse"},
    {"key": "economic", "label": "New crops, animals and labour systems"}
  ],
  "pool": [
    {"doc": "lascasas-1542-short-account", "group": "demographic",
     "sourcing": "Point of view: … Purpose: … — how it could earn the sourcing point."}
  ],
  "notes": {
    "thesis": ["2–3 example defensible theses"],
    "contextualization": ["ideas"],
    "outsideEvidence": ["specific evidence from AMSCO Unit 4 not in the documents"],
    "complexity": ["ways to earn the complexity point"]
  }
}
```

- The pool has 9–12 documents in 2–3 groups. A group is a line of argument the
  document supports.
- `sourcing` is written for this prompt, because the same document's point of
  view can matter differently to different prompts.

### SAQs (`data/saqs.json`)

```json
{
  "id": "…",
  "topics": ["4.3"],
  "docs": ["doc-id"],
  "parts": [
    {"label": "a", "task": "Identify ONE …", "accept": ["answers that earn the point …"]},
    {"label": "b", "task": "Explain …", "accept": ["…"]},
    {"label": "c", "task": "Explain …", "accept": ["…"]}
  ]
}
```

`docs` has 0–2 entries. Most SAQs use one or two documents from the bank, and a
few have none, as SAQs 3 and 4 do on the exam.

### Multiple-choice sets (`data/mcqs.json`)

```json
{
  "id": "…",
  "topics": ["4.5"],
  "doc": "doc-id",
  "questions": [
    {"stem": "…", "options": ["…", "…", "…", "…"], "answer": 2,
     "explanation": "Why C is right, and why the closest wrong option is wrong."}
  ]
}
```

Four options, A–D, as on the current exam. Each set has 3–4 questions.

## Content production and verification

1. **Research.** Four parallel research agents, one per cluster of DBQ
   prompts: (a) exploration causes and empire building (4.1, 4.2, 4.4); (b)
   Columbian Exchange and social hierarchy (4.3, 4.7); (c) slave trade,
   silver and mercantilism (4.5); (d) East Asia, Indigenous resistance and
   challenges to state power (4.6). Each finds public-domain or openly
   licensed source texts, pulls excerpts, and records `sourceUrl` and
   `translation`. Output goes to `data/documents.json` with `verified: false`.
2. **Mechanical check.** `tools/check-sources.js` fetches each `sourceUrl`,
   strips the HTML, and normalises case, whitespace, curly quotes and dashes.
   It confirms that every "…"-separated segment of `text` (or of `original`,
   when the document is adapted) appears in the page, and writes a report.
3. **Independent verification.** A separate agent that did not do the research
   handles the documents the script could not confirm: PDFs, pages that need
   JavaScript, scanned books. It checks them by hand and either confirms them
   or drops them. Only this pass and the script set `verified: true`.
4. **Authoring.** With the verified bank in hand, the prompts, pools, groups,
   sourcing notes, SAQs and multiple-choice sets are written.
5. **Accuracy review.** I read every rubric note, scoring guide and answer
   explanation for historical accuracy against AMSCO Unit 4 content, and for
   consistency with the documents it cites.

## The page

One self-contained HTML file. Two tabs, plus a topic filter: checkboxes for
4.1–4.8, all on by default, remembered per browser. If nothing matches the
filter (for example, only 4.8 ticked and no item tagged 4.8), the page says so
and names the topics that do have items. It never shows an empty or broken
question.

### DBQ tab: "New DBQ"

1. Picks a random prompt among those whose topics overlap the filter, skipping
   the last 3 seen (remembered in `localStorage`, best effort). If that would
   leave nothing to pick, it skips fewer, never offering the item currently on
   screen unless it is the only match.
2. Draws 7 documents from the prompt's pool: at least 2 from each group, no
   `authorKey` twice, the rest filled at random. The documents are numbered 1–7
   in order of `year`, with ties broken by `id`.
3. Shows the exam directions: 15-minute suggested reading period, 45 minutes
   writing. An optional timer counts down through both phases. The timer is
   visual only, with no sound.
4. "Reveal rubric" opens the 2023+ DBQ scoring guide:

   | Point | Worth |
   |---|---|
   | Thesis/claim | 1 |
   | Contextualization | 1 |
   | Evidence from documents (1 for describing 3 documents, 2 for supporting the argument with 4) | 2 |
   | Evidence beyond the documents | 1 |
   | Sourcing (how or why point of view, purpose, situation or audience matters, for 2 documents) | 1 |
   | Complexity | 1 |

   Under it come the prompt's `notes` and the `sourcing` notes for the 7
   documents actually drawn.

### Drill tab: "New drill"

A choice of SAQ, multiple choice, or either. The drill is picked at random
among those matching the filter, skipping the last 10 seen, with the same
fallback as the DBQ tab.

- **SAQ:** document(s), then parts a/b/c with an optional answer box each.
  "Reveal scoring guide" shows `accept` for each part.
- **Multiple choice:** the document, then the questions as radio groups.
  "Check" marks each question right or wrong and shows every explanation. This
  is a plain answer key.

### Shareable codes

Every item on screen has a code made only of letters, digits, `.` and `-`.
That is all a claude.ai artifact link can pass through to the page after `#`:
`dbq.<prompt-id>.<seed>` (seed in base36), or `saq.<id>` / `mcq.<id>`.

- The code is shown above the question, with a "Copy code" button. An "Open a
  code" box loads any code typed or pasted into it.
- A link ending in `#<code>` opens that item directly.
- Once the page's own URL is known (after the first publish), the build bakes
  it in and a "Copy link" button appears next to "Copy code".
- Opening a code reproduces the item, because the sampler is a pure function of
  (prompt, seed).
- If the code is malformed, or its id no longer exists, the page says so,
  keeps the current item, and offers a new one.
- If a prompt's pool has changed since the code was made, the same seed may
  draw a different set. That is accepted.

### First view

On load the page opens a code if the link carries one. Otherwise it shows a
freshly drawn DBQ, never an empty screen.

### Print

The claude.ai viewer cannot open the print dialog, so the page has no print
button. The build also writes `dist/local.html`, a standalone copy that can be
opened from disk and printed from the browser. Its print stylesheet hides the
controls and prints the prompt, directions and documents. The rubric is
printed only if it has been revealed.

### Look

Exam-like and plain. Colour tokens on `:root` with a dark-mode override.
Readable serif for document text, sans-serif for the UI. Works at phone width
with no horizontal scroll. The artifact page rules apply (title, external
script hosts, theming).

## Code layout

```
data/        documents.json, dbqs.json, saqs.json, mcqs.json
src/         index.html (template), styles.css, sampler.js, app.js
tools/       build.js, validate.js, check-sources.js
test/        sampler.test.js, data.test.js   (node:test)
dist/        index.html — built, not committed
docs/        this spec
```

- `sampler.js` is pure and has no DOM access. It contains a seeded PRNG
  (mulberry32), `drawDbq(prompt, docsById, seed)`, which returns the 7 drawn
  pool entries (document id, group and sourcing note) or throws, and `pickRandom(items, recent, rng)`. The draw picks 2 documents
  per group, then fills the rest, from a seeded shuffle. It retries with the
  next shuffle up to 50 times when author clashes leave no valid set, and
  throws if all 50 fail. The 1,000-seed sampler test below makes sure no
  shipped prompt can reach that throw.
- `app.js` handles the DOM and depends only on `sampler.js` and the inlined
  data.
- `build.js` runs `validate.js`, then inlines the CSS, the JS and the four data
  files into `dist/index.html`, which is published and so carries no
  doctype/html/head/body of its own. It also writes `dist/local.html`, the same
  page wrapped in a full HTML skeleton for opening from disk.

## Validation (fails the build)

- Every id reference resolves. Ids are unique.
- Every document has `verified: true`, a `sourceUrl`, topics within 4.1–4.8,
  and 60–200 words of text (or a well-formed table). Adapted documents have an
  `original`.
- Every DBQ pool has 9–12 documents and 2–3 groups. Every group has at least 2
  documents with distinct `authorKey`s. The pool has at least 7 distinct
  `authorKey`s. Every pool entry has a non-empty `sourcing` note.
- Every SAQ has parts a, b and c with non-empty `accept`. Every multiple-choice
  question has 4 options and a valid `answer`.

## Tests

- **Sampler.** The same (prompt, seed) always returns the same 7 documents.
  Over 1,000 seeds per shipped prompt, every draw is valid: 7 distinct
  documents, at least 2 per group, no repeated author, sorted by year.
- **Data.** The validation runs as a test.
- **Page.** Load the built page in a browser. Generate a DBQ, an SAQ and a
  multiple-choice set. Reveal the rubric, check answers, reopen from a code,
  try a bad code, use an empty filter, and print-preview `local.html`. Check at
  phone width and in dark mode.

## Delivery

Publish `dist/index.html` as a private claude.ai artifact (icon: "book"). Then
rebuild with that URL baked in, so "Copy link" works, and republish to the same
URL. Later updates republish to the same URL. The repo is local only (no
remote).

## Out of scope (v1)

- Image documents (maps, paintings, engravings). Real DBQs often include one.
  This is the first planned extension.
- Long essay questions (LEQs).
- AI grading of written answers.
- Units other than Unit 4.
