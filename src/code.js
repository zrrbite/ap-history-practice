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
    const example = bank.unit?.exampleCode ?? 'dbq.example-prompt.k2x9q1';
    return { ok: false, message: `That code isn’t valid. Codes look like ${example}.` };
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

// Where "Copy link" should point. Served directly (GitHub Pages, a local server), the page's own
// address is shareable. Inside the claude.ai viewer's frame it is not, so use the configured
// artifact URL. A page opened from disk has no shareable address.
export function shareBaseFor(configured, loc, framed) {
  if (framed) return configured ?? null;
  return /^https?:$/.test(loc.protocol) ? `${loc.origin}${loc.pathname}` : null;
}
