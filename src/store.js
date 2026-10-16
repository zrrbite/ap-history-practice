// Best-effort browser storage. Storage can be missing, throw on access (private windows,
// blocked site data) or hold junk; the page must work the same without it.
export function safeStore(getStorage) {
  const storage = () => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };
  return {
    get(key, fallback) {
      try {
        const raw = storage()?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage()?.setItem(key, JSON.stringify(value));
      } catch {
        // Unavailable or full: the remembered filter and recency are conveniences only.
      }
    },
  };
}

export function asStringArray(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
}

// The topics to start with: the saved choice limited to this unit's topics, or all of them when nothing
// saved applies (a first visit, junk in storage, or a choice saved by another unit's page on the same site).
export function selectTopics(saved, allTopics) {
  const kept = allTopics.filter((topic) => saved.includes(topic));
  return kept.length > 0 ? kept : [...allTopics];
}

// Units share one origin (and so one localStorage). Unit 4 keeps the bare names it has always used, so its
// students keep their saved filter; every other unit gets its own namespace.
export function storageKey(unitId, name) {
  return unitId === 'unit-4' ? name : `${unitId}:${name}`;
}
