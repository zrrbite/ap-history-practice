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
