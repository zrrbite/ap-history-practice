# Unit 5 practice, and one site for several units

**Date:** 2026-10-15
**Builds on:** `2026-10-13-amsco-unit4-dbq-design.md`. Every rule there still holds unless this spec changes it.
**Branch:** `unit-5`, cut from `main`. It deploys by fast-forwarding `main` once Unit 5 passes its release checks.

## Goal

Add AMSCO Unit 5, *Revolutions, c. 1750–1900*, as a second practice page with the same formats (DBQ, SAQ, MCQ), the same verification and the same scoring-guide behaviour as Unit 4. Ship a smaller first release, then grow it to match Unit 4. Build it at a fraction of Unit 4's usage.

**Success:**
- `https://zrrbite.github.io/ap-history-practice/` is an index linking Unit 4 and Unit 5.
- Unit 4 works exactly as before at `/unit-4/`, and old root links carrying a code still open their set.
- Unit 5 passes its release checks and has its own claude.ai artifact.

## What the student gets

- **An index page** at the site root that names each unit, its period and its counts, and links to it.
- **Unit 4** unchanged, at `/unit-4/`. Its claude.ai artifact keeps its URL.
- **Unit 5** at `/unit-5/`: the same page as Unit 4, with Unit 5's title, period and topics, and its own claude.ai artifact.

A code from one unit pasted into the other unit's page gets the existing "no longer in the bank" message. Telling the units apart in that message is a non-goal for now.

## Architecture

### Data per unit

Each unit has its own folder:

```
data/unit-4/   unit.json, documents.json, dbqs.json, saqs.json, mcqs.json, research/
data/unit-5/   the same layout
```

Unit 4's existing files move into `data/unit-4/` unchanged, with `git mv` so their history follows.

`unit.json` holds everything that is now hard-coded for Unit 4:

```json
{
  "id": "unit-4",
  "number": 4,
  "title": "Transoceanic Interconnections",
  "period": "c. 1450–1750",
  "years": [1400, 1760],
  "topics": { "4.1": "Technological innovations", "...": "..." },
  "minimums": { "documents": 60, "dbqs": 10, "saqs": 18, "mcqs": 13 },
  "shareBase": "https://claude.ai/artifact/8YMSYcGaX9ygMu27SfboDY"
}
```

- `years` is the range a document's `year` may fall in. Unit 4's stays 1400–1760, today's rule. Unit 5's is 1740–1910.
- `topics` maps each topic code to the short label shown on its chip. The key order is the chip order.
- `minimums` replaces `RELEASE_MINIMUMS`. The release check still requires every topic to be covered by at least one drill.
- `shareBase` replaces `site.json`, which is deleted. It may be `null` until the unit's artifact exists.

### Tools

- **`validate(data, { release })`** reads `data.unit`. Topic codes, the year range and the minimums come from it. A missing or malformed `unit.json` is a validation error that names the field. With no `--unit`, the CLI validates every unit; `--unit unit-5` validates one.
- **`loadData(dir)`** also loads `unit.json`.
- **`build`** writes, for each unit:
  - `dist/<unit>/index.html`, to publish as that unit's artifact
  - `dist/<unit>/local.html`, for disk, printing and Pages

  It also writes `dist/index.html`, the landing page.
- **Page template:** the `<title>`, eyebrow and heading come from `unit.json`. The title becomes "Unit N DBQ Practice" and the eyebrow "AP World History: Modern · AMSCO Unit N · <period>", so Unit 4's read exactly as today.
- **Unit 4 must not change for a student.** Two checks prove it:
  - **Content:** the documents, DBQs, SAQs and MCQ sets embedded in Unit 4's built page are deep-equal to today's. A unit test compares a SHA-256 of their JSON against the hash taken on `main` before the restructure.
  - **Rendering:** `check-page` compares the rendered text of Unit 4's page, for a fixed list of codes, against a snapshot taken from today's build. The page bytes do change (the bank gains `unit`, and `app.js` changes), so byte equality is not the test.
- **`app.js`** takes topic labels from the bank's `unit.topics` instead of its own constant.
- **`check-refs`, `check-sources` and `candidates`** default to every unit, or take `--unit <id>`. Paths they print are relative to the unit's folder.
- **`check-refs` paces Britannica lookups** at no more than one Wayback request per second. Without that, the Unit 4 release run was rate-limited (HTTP 429) after about 116 links.
- **Page check:** the headless-Chrome harness used for Unit 4 moves into the repo as `tools/check-page.js` (run with `npm run check-page`). It builds, loads each unit's `local.html` at 400 px, runs the 34 checks (including opening every code in the bank), and prints PASS/FAIL. It needs a local Chrome, so CI does not run it.

### Landing page

`dist/index.html` is a small static page in the same visual style as the unit pages. It lists each unit from its `unit.json`, with its period and counts, and links to `unit-N/`.

If the landing page is opened with a `#code`, it forwards to `unit-4/#code`. Only Unit 4 existed when root links were shared, so they all belong to it.

The landing page is for Pages and local use only; claude.ai shows each unit's artifact on its own.

### Pages workflow

The build job runs:
1. `npm test`
2. `node tools/validate.js --release`, for every unit
3. `npm run build`

It then assembles `_site/` as follows:
- `dist/index.html` → `_site/index.html`
- each `dist/unit-N/local.html` → `_site/unit-N/index.html`

The deploy job is unchanged.

### Tests

- Existing tests move to the unit-aware API. The fixture gains a `unit` object.
- New tests cover these cases:
  - a topic outside the unit's list is rejected, and the error names the unit
  - a year outside the unit's range is rejected
  - the unit's own minimums are enforced
  - a malformed `unit.json` is reported field by field
  - the build writes one folder per unit plus the landing page
  - the landing page forwards a `#code` to Unit 4
  - Unit 4's embedded content hashes to the value recorded from `main`

## Unit 5 content

### Topics

| Code | Chip label | AMSCO / CED topic |
|---|---|---|
| 5.1 | Enlightenment | The Enlightenment |
| 5.2 | Nationalism and revolutions | Nationalism and Revolutions |
| 5.3 | Industrial Revolution begins | Industrial Revolution Begins |
| 5.4 | Industrialization spreads | Industrialization Spreads |
| 5.5 | Technology | Technology of the Industrial Age |
| 5.6 | Government's role | Industrialization: Government's Role |
| 5.7 | Economic developments | Economic Developments and Innovations |
| 5.8 | Reactions to industrialization | Reactions to the Industrial Economy |
| 5.9 | Society | Society and the Industrial Age |
| 5.10 | Continuity and change | Continuity and Change in the Industrial Age |

The research step's first task is to check this list against AMSCO's Unit 5 table of contents. If they differ, AMSCO's list wins and the difference is ledgered.

### First release: 6 DBQs, 12 SAQs, 9 MCQ sets, about 80 documents

`unit-5/unit.json` minimums: `{ "documents": 60, "dbqs": 6, "saqs": 12, "mcqs": 9 }`. Every topic must be covered by at least one drill, the same rule as Unit 4.

The six DBQ prompts and their lines of argument:

| Prompt id | Topics | Groups (at least 2 documents drawn from each) |
|---|---|---|
| `enlightenment-revolutions` | 5.1, 5.2 | ideas / grievances / limits |
| `latin-american-independence` | 5.2 | ideas / creole-interests / fear-from-below |
| `industrial-revolution-causes` | 5.3 | resources / capital-markets / labor-technology |
| `state-led-industrialization` | 5.4, 5.6 | defense / economic-growth / limits |
| `reactions-industrial-economy` | 5.8 | labor / socialism / reform-from-above |
| `industrial-society` | 5.9 | class / gender-family / cities |

Researchers may propose a different group split when the sources argue it better, as long as each group can supply at least 3 documents from different authors. The change is ledgered as a ruling.

Topics 5.5, 5.7 and 5.10 are covered by the drills.

The sources must include non-European voices on industrialization and on reform, for example Meiji Japan, Muhammad Ali's Egypt, the Ottoman Tanzimat, Qing self-strengthening and Latin American writers.

### "Match Unit 4": the second release

When the user says "match Unit 4", it means:
- **Grow Unit 5 to Unit 4's size:** 10 DBQs, 20 SAQs, 15 MCQ sets, about 150 documents, and every topic in at least two drills.
- **Add four DBQ prompts,** chosen then. The candidates are technology and transport (5.5), economic developments (5.7), nationalism (5.2) and continuity and change (5.10).
- **Raise `unit-5/unit.json` minimums to Unit 4's:** `{ "documents": 60, "dbqs": 10, "saqs": 18, "mcqs": 13 }`.

The same pipeline applies. This section is the definition; the todo list points here.

### Sources

Unit 5 sources are mostly published in English, or in English translations that are already public domain. They sit on scriptable sites such as Avalon, the Fordham Internet History Sourcebooks, Hanover Historical Texts, Project Gutenberg, Wikisource, the Online Library of Liberty and the Marxists Internet Archive. The provenance rules are unchanged:
- every excerpt is checked word for word against its `sourceUrl` by `check-sources.js`
- anything the script cannot confirm is checked by a reviewer or dropped
- spelling may be modernised only when the document is marked "(adapted)", with the original kept alongside it

## Pipeline and cost controls

| Step | Who | Model |
|---|---|---|
| Restructure the code for several units | me (TDD); mechanical edits delegated | Haiku for mechanical edits |
| Research: two clusters (5.1–5.2 and 5.8–5.9; 5.3–5.7 and 5.10) | 2 agents | Sonnet |
| Mechanical source check | script | — |
| Verification: one pass over every document | 1 agent per cluster, one after the other | Sonnet |
| Writing: DBQs; SAQs and MCQ sets | 2 agents | Sonnet |
| Accuracy review | 1 agent | Sonnet |
| Final code review | 1 agent, code-only diff | Sonnet |
| Fixes from reviews | delegated | Haiku |

Rules for every agent:
- **The model is set explicitly on every dispatch.** Nothing inherits Opus.
- **At most two agents run at once.**
- **Each agent saves its output file after every finished item** (document, prompt, question), so a usage cutoff loses at most one item. A resumed agent continues from the file.
- **Pages are read through `check-sources.js --text <url>`,** which returns plain text, not raw HTML.
- **Each brief names a cap on web fetches.**
- **The reference check runs once at release, unattended,** not inside every agent.

## Deploy

On the `unit-5` branch:
1. `npm test`
2. `node tools/validate.js --release` (every unit)
3. `node tools/check-refs.js` (every unit)
4. `npm run check-page`

When all four pass:
1. Publish `dist/unit-5/index.html` as a new artifact.
2. Write its URL into `unit-5/unit.json`, rebuild and republish.
3. Update the README.
4. `git switch main && git merge --ff-only unit-5 && git push`. This triggers the Pages deploy.
5. Confirm the index, `/unit-4/` and `/unit-5/` load, and that `/#dbq.silver-trade.1` forwards to Unit 4.
6. Push `unit-5` too.

The Unit 4 artifact is also republished from `dist/unit-4/index.html` to its existing URL, once `check-page` shows its rendering unchanged. Its page bytes change with the restructure, even though nothing a student sees does.

## Non-goals

- A unit switcher inside one page, or mixing units in one draw.
- Codes that name their unit, or a cross-unit "wrong unit" message.
- Image documents (maps, engravings, political cartoons). They remain the follow-up logged for Unit 4.
- Changes to Unit 4's content.
