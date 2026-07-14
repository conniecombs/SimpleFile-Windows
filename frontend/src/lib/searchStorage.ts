const RECENT_SEARCHES_KEY = 'simplefile-recent-searches';
const RECENT_SEARCH_LIMIT = 12;

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadJsonArray(key: string, storage: Storage | null = getStorage()) {
  if (!storage) return [];

  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function saveJsonArray(
  key: string,
  values: string[],
  limit = 10,
  storage: Storage | null = getStorage(),
) {
  const cleaned = [...new Set(values.filter(Boolean))].slice(0, limit);

  if (!storage) return cleaned;

  try {
    storage.setItem(key, JSON.stringify(cleaned));
  } catch {
    // Storage can be unavailable in private/restricted contexts; keep the
    // in-memory value so callers can continue without interrupting search.
  }

  return cleaned;
}

export function getRecentSearches(storage: Storage | null = getStorage()) {
  return loadJsonArray(RECENT_SEARCHES_KEY, storage);
}

export function rememberRecentSearch(query: string | null | undefined, storage: Storage | null = getStorage()) {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  const existing = getRecentSearches(storage).filter((value) => value !== trimmed);
  return saveJsonArray(RECENT_SEARCHES_KEY, [trimmed, ...existing], RECENT_SEARCH_LIMIT, storage);
}
