// Choosing what to show: seeded randomness, the balanced DBQ draw, recency and topic filters.
// Pure functions with no DOM access, so the tests and the build's validation use them too.

export const DBQ_SIZE = 7;
const PER_GROUP = 2;
const MAX_ATTEMPTS = 50;

// mulberry32: a small seeded PRNG. Returns floats in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Draws DBQ_SIZE pool entries: PER_GROUP from every group first, then any others, never the
// same author twice. A failed attempt (author clashes) retries with the next shuffle.
export function drawDbq(prompt, docsById, seed) {
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chosen = tryDraw(prompt, docsById, shuffle(prompt.pool, rng));
    if (chosen) return chosen.sort((x, y) => byYearThenId(docsById.get(x.doc), docsById.get(y.doc)));
  }
  throw new Error(`Cannot draw a balanced set of ${DBQ_SIZE} documents for "${prompt.id}"`);
}

function tryDraw(prompt, docsById, order) {
  const chosen = [];
  const authors = new Set();
  const take = (entry) => {
    const author = docsById.get(entry.doc).authorKey;
    if (chosen.includes(entry) || authors.has(author)) return false;
    chosen.push(entry);
    authors.add(author);
    return true;
  };
  for (const group of prompt.groups) {
    let taken = 0;
    for (const entry of order) {
      if (taken === PER_GROUP) break;
      if (entry.group === group.key && take(entry)) taken++;
    }
    if (taken < PER_GROUP) return null;
  }
  for (const entry of order) {
    if (chosen.length === DBQ_SIZE) break;
    take(entry);
  }
  return chosen.length === DBQ_SIZE ? chosen : null;
}

function byYearThenId(a, b) {
  return a.year - b.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Picks a random item, skipping ids in `recent` (newest first; recent[0] is the item on screen).
// When that leaves nothing, it forgets the oldest recent ids first, so the item on screen comes
// back only when it is the only match. Returns null when there are no items.
export function pickRandom(items, recent, rng) {
  if (items.length === 0) return null;
  for (let keep = recent.length; keep >= 1; keep--) {
    const skip = new Set(recent.slice(0, keep));
    const left = items.filter((item) => !skip.has(item.id));
    if (left.length > 0) return left[Math.floor(rng() * left.length)];
  }
  return items[Math.floor(rng() * items.length)];
}

export function pushRecent(recent, id, max) {
  return [id, ...recent.filter((x) => x !== id)].slice(0, max);
}

export function matchesFilter(item, topics) {
  return item.topics.some((t) => topics.includes(t));
}

export function topicsWithItems(items) {
  return [...new Set(items.flatMap((item) => item.topics))].sort();
}
