// The page: renders DBQs and drills from the inlined bank and wires up the controls.
// Every node is built from text nodes, never from HTML strings, so source text shows exactly as written.
import { drawDbq, pickRandom, pushRecent, matchesFilter, topicsWithItems } from './sampler.js';
import { formatCode, parseCode, resolveCode, shareBaseFor } from './code.js';
import { timerState, formatClock } from './timer.js';
import { safeStore, asStringArray, selectTopics, storageKey } from './store.js';

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
const TOPIC_LABELS = bank.unit.topics;
const ALL_TOPICS = Object.keys(TOPIC_LABELS);
const docsById = new Map(bank.documents.map((d) => [d.id, d]));
const rawStore = safeStore(() => window.localStorage);
const store = {
  get: (name, fallback) => rawStore.get(storageKey(bank.unit.id, name), fallback),
  set: (name, value) => rawStore.set(storageKey(bank.unit.id, name), value),
};
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
  return selectTopics(asStringArray(store.get('topics', null)), ALL_TOPICS);
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

function refLink(ref) {
  return el('a', { class: 'ref', href: ref.url, target: '_blank', rel: 'noopener noreferrer' }, `Check it: ${ref.title} ↗`);
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

// Notes are plain text (theses, complexity) or {text, ref} (contextualization, outside evidence).
function noteList(title, items) {
  const item = (note) => (typeof note === 'string' ? el('li', {}, note) : el('li', {}, note.text, ' ', refLink(note.ref)));
  return [el('h3', {}, title), el('ul', { class: 'notes' }, items.map(item))];
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
  const refs = el('p', { class: 'refs', hidden: true }, saq.refs.map((ref) => refLink(ref)));
  guides.push(refs);
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
    refs,
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
        el('p', { class: 'explanation' }, q.explanation, ' ', refLink(q.ref)),
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

function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

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
  const shareBase = shareBaseFor(bank.config.shareBase, location, isFramed());
  if (shareBase) {
    $('copy-link').hidden = false;
    $('copy-link').addEventListener('click', (event) => {
      const code = currentCode();
      if (!code) return;
      const link = `${shareBase}#${code}`;
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
