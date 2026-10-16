// The site's landing page: one card per unit, plus a script that forwards old root links
// carrying a #code to Unit 4 (only Unit 4 existed when those links were shared).
import { escapeHtml, fill } from './html.js';

export const UNIT_HOME = 'unit-4';

// Plain browser JavaScript. Served over http(s) the links go to unit-N/ and the forward to unit-4/#code;
// from disk (file:) a folder has no index, so both go to unit-N/local.html. The destination is built from
// UNIT_HOME and the hash only, so a hash can never choose a different URL scheme or host.
export const FORWARD_SCRIPT = `
var UNIT_HOME = '${UNIT_HOME}';
function unitUrl(unit) { return location.protocol === 'file:' ? unit + '/local.html' : unit + '/'; }
var links = document.querySelectorAll('a[data-unit]');
for (var i = 0; i < links.length; i++) links[i].setAttribute('href', unitUrl(links[i].getAttribute('data-unit')));
if (location.hash.length > 1) location.replace(unitUrl(UNIT_HOME) + location.hash);
`;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function unitCard({ unit, counts }) {
  const line = [
    count(counts.dbqs, 'DBQ'),
    count(counts.saqs, 'short-answer question'),
    count(counts.mcqs, 'multiple-choice set'),
    count(counts.documents, 'document'),
  ].join(' · ');
  const id = escapeHtml(unit.id);
  return `<li class="unit-card"><a href="${id}/" data-unit="${id}">`
    + `<span class="unit-name">Unit ${escapeHtml(unit.number)} · ${escapeHtml(unit.title)}</span>`
    + `<span class="unit-period">${escapeHtml(unit.period)}</span>`
    + `<span class="unit-counts">${escapeHtml(line)}</span></a></li>`;
}

// units: [{ unit, counts: { documents, dbqs, saqs, mcqs } }]
// Unit text goes in last, so a title containing a marker such as /*FORWARD*/ can never be filled.
export function landingPage(template, styles, units) {
  let page = fill(template, '/*STYLES*/', styles);
  page = fill(page, '/*FORWARD*/', FORWARD_SCRIPT);
  return fill(page, '__UNITS__', units.map(unitCard).join('\n'));
}
