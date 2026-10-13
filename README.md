# AP World History: Unit 4 practice

Random practice questions for AP World History: Modern, scoped to Unit 4 of the AMSCO textbook, *Transoceanic Interconnections, c. 1450–1750*.

- **DBQ.** A prompt with seven primary-source documents. Each set is drawn at random from that prompt's pool, takes at least two documents from every line of argument, and never uses the same author twice. The page shows the exam directions, has an optional 15 + 45 minute timer, and keeps a scoring guide hidden until you ask for it: the College Board rubric plus notes for that prompt and for the seven documents you drew.
- **Short drills.** Short-answer questions (parts a, b and c, with scoring guides) and multiple-choice sets (one source, 3–4 questions, each answer explained).
- **Codes.** Every set has a code such as `dbq.silver-trade.k2x9q1` that reopens exactly that set, so you can come back to it or send it to a teacher.

Nothing is graded by AI. Students check their own work against the guides.

## Try it

The page is published as a claude.ai artifact: <https://claude.ai/artifact/8YMSYcGaX9ygMu27SfboDY>. It currently shows placeholder content while the document bank is being built.

To run it locally, build it (see below) and open `dist/local.html` in a browser. That copy also prints cleanly.

## Where the documents come from

Every document is an excerpt from a real primary source written between 1450 and 1750, taken from a public-domain or openly licensed text or translation. Each document records the page it was copied from, and the build refuses any document that has not been checked against that page:

1. Research drafts with candidate excerpts and source links go in `data/research/`.
2. `tools/check-sources.js` fetches each source page and confirms that every quoted passage appears there. It ignores differences in case, accents, punctuation and line-break hyphenation.
3. A separate reviewer compares anything the script can't confirm (scans, PDFs) by hand. Excerpts that can't be confirmed are dropped.
4. `tools/candidates.js promote` moves only verified documents into `data/documents.json`.

Old spelling may be modernised only when the document is marked "(adapted)", and the verbatim original is kept alongside it.

## Development

Requires Node 22 or later. There are no dependencies.

```sh
npm test                    # unit tests
npm run validate            # check the question bank against the content rules
npm run validate -- --release   # also check release minimums and topic coverage
npm run build               # writes dist/index.html (to publish) and dist/local.html (to open or print)

node tools/check-sources.js <file.json> [--mark] [--only id,id]   # check excerpts against their sources
node tools/check-sources.js --text <url>                          # print a page's text, to copy excerpts from
node tools/candidates.js merge | promote                          # research drafts -> candidates -> bank
```

| Path | What it holds |
|---|---|
| `data/` | The question bank: `documents.json`, `dbqs.json`, `saqs.json`, `mcqs.json` |
| `src/` | The page: pure modules (`sampler.js`, `code.js`, `timer.js`, `store.js`), the DOM code (`app.js`), template and styles |
| `tools/` | Validation, build, source checking, candidate handling |
| `test/` | `node:test` suites |
| `docs/superpowers/` | The design spec and implementation plan |
