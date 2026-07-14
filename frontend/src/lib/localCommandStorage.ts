import type { SimpleFileAppState } from './appState';

export const OPEN_WITH_APPS_KEY = 'simplefile-open-with-apps';

function loadJsonArray(storage: Storage | undefined, key: string) {
  if (!storage) return [];

  try {
    const raw = storage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveJsonArray(storage: Storage | undefined, key: string, values: string[], limit = 10) {
  if (!storage) return values;

  try {
    const cleaned = [...new Set(values.filter(Boolean))].slice(0, limit);
    storage.setItem(key, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return values;
  }
}

export function getOpenWithSuggestions(state: SimpleFileAppState, storage: Storage | undefined) {
  const recent = loadJsonArray(storage, OPEN_WITH_APPS_KEY);
  const isWindows = (state.homePath || '').includes('\\');
  const platformDefaults = isWindows
    ? ['notepad.exe', 'mspaint.exe', 'code.cmd']
    : ['code', 'gedit', 'xdg-open', 'open', 'vim'];
  return [...new Set([...recent, ...platformDefaults])];
}

export function rememberOpenWithApplication(storage: Storage | undefined, appName: string) {
  const trimmed = appName.trim();
  if (!trimmed) return;

  const existing = loadJsonArray(storage, OPEN_WITH_APPS_KEY).filter((value) => value !== trimmed);
  saveJsonArray(storage, OPEN_WITH_APPS_KEY, [trimmed, ...existing], 12);
}
