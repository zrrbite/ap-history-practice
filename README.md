# AP World History practice: AMSCO Units 4 and 5

Random practice questions for AP World History: Modern, one page per AMSCO unit:

| Unit | Period | Page |
|---|---|---|
| 4 *Transoceanic Interconnections* | c. 1450–1750 | [GitHub Pages](https://zrrbite.github.io/ap-history-practice/unit-4/) · [claude.ai artifact](https://claude.ai/artifact/8YMSYcGaX9ygMu27SfboDY) |
| 5 *Revolutions* | c. 1750–1900 | [GitHub Pages](https://zrrbite.github.io/ap-history-practice/unit-5/) · [claude.ai artifact](https://claude.ai/artifact/AmNv52SuJvfeyJQrzLivoV) |

The site index, <https://zrrbite.github.io/ap-history-practice/>, links both. An old link to the site root that carries a code (`/#dbq.silver-trade.1`) still opens that set: the index forwards it to Unit 4.

Each page has the same formats:

- **DBQ.** A prompt with seven primary-source documents. Each set is drawn at random from that prompt's pool, takes at least two documents from every line of argument, and never uses the same author twice. The page shows the exam directions, has an optional 15 + 45 minute timer, and keeps a scoring guide hidden until you ask for it: the College Board rubric plus notes for that prompt and for the seven documents you drew.
- **Short drills.** Short-answer questions (parts a, b and c, with scoring guides) and multiple-choice sets (one source, 3–4 questions, each answer explained).
- **Codes.** Every set has a code such as `dbq.silver-trade.k2x9q1` that reopens exactly that set on that unit's page. A code from the other unit says it is no longer in the bank.
- **Check it.** Scoring notes that rely on outside knowledge link to a second reference, a Britannica article or, where Britannica lacks the point, Wikipedia, so students can check the guide against something besides their textbook.

Nothing is graded by AI. Students check their own work against the guides.

To run it locally, build it (see below) and open `dist/index.html` in a browser; each unit also prints cleanly from its `dist/unit-N/local.html`.

## Where the documents come from

Every document is an excerpt from a real primary source from its unit's period (Unit 4: 1400–1760; Unit 5: 1740–1910), taken from a public-domain or openly licensed text or translation. Each document records the page it was copied from, and the build refuses any document that has not been checked against that page:

1. Research drafts with candidate excerpts and source links go in `data/unit-N/research/`.
2. `tools/check-sources.js` fetches each source page and confirms that every quoted passage appears there. It ignores differences in case, accents, punctuation and line-break hyphenation.
3. A separate reviewer compares anything the script can't confirm (scans, PDFs) by hand. Excerpts that can't be confirmed are dropped.
4. `tools/candidates.js promote --unit unit-N` moves only verified documents into `data/unit-N/documents.json`.

Old spelling may be modernised only when the document is marked "(adapted)", and the verbatim original is kept alongside it.

## Development

Requires Node 22 or later. There are no dependencies.

```sh
npm test                        # unit tests
npm run validate                # check every unit's bank against the content rules
npm run validate -- --release   # also check release minimums and topic coverage
npm run validate -- --unit unit-5
npm run build                   # writes dist/index.html (the index) and dist/unit-N/{index,local}.html
npm run check-page              # builds, then checks every page in headless Chrome (needs a local Chrome; not run in CI)

node tools/check-sources.js [--unit id] [file.json] [--mark] [--only id,id]   # check excerpts against their sources
node tools/check-sources.js --text <url>                                      # print a page's text, to copy excerpts from
node tools/candidates.js merge|promote --unit unit-5                          # research drafts -> candidates -> bank
node tools/check-refs.js [--unit id] [file.json ...]                          # confirm every "Check it" link loads the article it names
node tools/check-refs.js --title <url>                                        # print the confirmed title for one link
node tools/apply-edits.js --unit unit-5 research/review-edits.json [--dry]    # apply reviewer edits to a bank
```

Britannica refuses scripted requests, so `check-refs.js` confirms a Britannica link through its Wayback Machine capture instead, at no more than one Wayback request a second. Each unit's `unit.json` holds its title, period, topic labels, document year range, release minimums, sample code and the artifact URL that "Copy link" uses inside claude.ai; on GitHub Pages and locally the page uses its own address.

To add a unit, create `data/unit-N/` with `unit.json`, the four bank files and `research/`; the build, validation, workflow and index pick it up. (Old root links with a code are forwarded to Unit 4 only.)

| Path | What it holds |
|---|---|
| `data/unit-N/` | One unit's question bank: `unit.json`, `documents.json`, `dbqs.json`, `saqs.json`, `mcqs.json`, `research/` |
| `src/` | The page: pure modules (`sampler.js`, `code.js`, `timer.js`, `store.js`), the DOM code (`app.js`), the page and index templates and styles |
| `tools/` | Validation, build, index page, source and reference checking, candidate handling, the Chrome page check |
| `.github/workflows/` | The GitHub Pages build and deploy |
| `test/` | `node:test` suites and the Unit 4 render snapshot |
| `docs/superpowers/` | The design specs and implementation plans |
