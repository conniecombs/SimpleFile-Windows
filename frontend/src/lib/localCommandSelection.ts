import type { SimpleFileAppState } from './appState';
import type { FileEntry, PathString } from './types';

export function firstSelectedPath(state: SimpleFileAppState) {
  const value = state.selectedEntries.values().next().value;
  return typeof value === 'string' ? value : null;
}

export function findEntry(state: SimpleFileAppState, path: PathString) {
  return state.entries.find((entry) => entry.path === path)
    ?? state.filteredEntries.find((entry) => entry.path === path)
    ?? null;
}

export function getSelectedEntriesInViewOrder(state: SimpleFileAppState) {
  const selected = state.selectedEntries;
  const ordered = state.filteredEntries.filter((entry) => selected.has(entry.path));
  const known = new Set(ordered.map((entry) => entry.path));
  const extras = [...selected]
    .filter((path) => !known.has(path))
    .map((path) => state.entries.find((entry) => entry.path === path))
    .filter((entry): entry is FileEntry => Boolean(entry));
  return [...ordered, ...extras];
}

export function getSelectedDirectoryPathsInFilteredView(state: SimpleFileAppState) {
  return [...state.selectedEntries].filter((path) => {
    const entry = state.filteredEntries.find((candidate) => candidate.path === path);
    return entry?.is_dir;
  });
}
