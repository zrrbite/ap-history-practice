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
