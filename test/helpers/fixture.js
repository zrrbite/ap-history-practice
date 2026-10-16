// A small bank that passes every validation rule, built in code so each test can break one rule.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const WORDS_80 = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
export const REF = { title: 'Encomienda', url: 'https://www.britannica.com/topic/encomienda' };

const UNITS = {
  4: {
    title: 'Transoceanic Interconnections',
    period: 'c. 1450–1750',
    years: [1400, 1760],
    firstYear: 1500,
    labels: ['Technological innovations', 'Exploration: causes and events', 'Columbian Exchange', 'Maritime empires established', 'Maritime empires maintained', 'Challenges to state power', 'Changing social hierarchies', 'Continuity and change'],
    minimums: { documents: 60, dbqs: 10, saqs: 18, mcqs: 13 },
    exampleCode: 'dbq.silver-trade.k2x9q1',
  },
  5: {
    title: 'Revolutions',
    period: 'c. 1750–1900',
    years: [1740, 1910],
    firstYear: 1800,
    labels: ['Enlightenment', 'Nationalism and revolutions', 'Industrial Revolution begins', 'Industrialization spreads', 'Technology', "Government's role", 'Economic developments', 'Reactions to industrialization', 'Society', 'Continuity and change'],
    minimums: { documents: 60, dbqs: 6, saqs: 12, mcqs: 9 },
    exampleCode: 'dbq.enlightenment-revolutions.k2x9q1',
  },
};

export function makeUnit(number = 4, overrides = {}) {
  const u = UNITS[number];
  return {
    id: `unit-${number}`,
    number,
    title: u.title,
    period: u.period,
    years: [...u.years],
    topics: Object.fromEntries(u.labels.map((label, i) => [`${number}.${i + 1}`, label])),
    minimums: { ...u.minimums },
    shareBase: null,
    exampleCode: u.exampleCode,
    ...overrides,
  };
}

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

// A valid bank for unit 4 or unit 5. Topics 3 and 5 of the unit are the ones the fixture uses.
// References are copied for every item: a test that edits one must not change the next test's bank.
export function makeData(number = 4) {
  const { firstYear } = UNITS[number];
  const topicA = `${number}.3`;
  const topicB = `${number}.5`;
  const documents = Array.from({ length: 10 }, (_, i) => makeDoc(i + 1, { year: firstYear + i + 1, topics: [topicA] }));
  const dbq = {
    id: 'test-prompt',
    topics: [topicA],
    prompt: 'Evaluate the extent to which tests changed, 1450–1750.',
    groups: [
      { key: 'g1', label: 'Group one' },
      { key: 'g2', label: 'Group two' },
    ],
    pool: documents.map((d, i) => ({ doc: d.id, group: i < 5 ? 'g1' : 'g2', sourcing: `Sourcing note ${i + 1}` })),
    notes: {
      thesis: ['T'],
      contextualization: [{ text: 'C', ref: { ...REF } }],
      outsideEvidence: [{ text: 'O', ref: { title: 'Mit\'a', url: 'https://en.wikipedia.org/wiki/Mita_(Inca)' } }],
      complexity: ['X'],
    },
  };
  const saq = {
    id: 'test-saq',
    topics: [topicA],
    docs: ['doc-1'],
    parts: ['a', 'b', 'c'].map((label) => ({ label, task: `Task ${label}`, accept: [`Accept ${label}`] })),
    refs: [{ ...REF }],
  };
  const mcq = {
    id: 'test-mcq',
    topics: [topicB],
    doc: 'doc-2',
    questions: [1, 2, 3].map((n) => ({
      stem: `Stem ${n}`,
      options: ['One', 'Two', 'Three', 'Four'],
      answer: n % 4,
      explanation: `Because ${n}`,
      ref: { ...REF },
    })),
  };
  return { unit: makeUnit(number), documents, dbqs: [dbq], saqs: [saq], mcqs: [mcq] };
}

export async function writeDataDir(dir, data) {
  await mkdir(dir, { recursive: true });
  if (data.unit !== undefined) await writeFile(path.join(dir, 'unit.json'), `${JSON.stringify(data.unit, null, 2)}\n`);
  for (const name of ['documents', 'dbqs', 'saqs', 'mcqs']) {
    await writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(data[name], null, 2)}\n`);
  }
}
