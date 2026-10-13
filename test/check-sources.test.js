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
