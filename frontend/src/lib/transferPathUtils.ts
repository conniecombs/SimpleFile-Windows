import type { ClipboardAction, PathString, TransferResult } from './types';

export type TransferAction = 'copy' | 'move';

export function normalizeTransferResults(result: unknown): TransferResult[] {
  return Array.isArray(result)
    ? result.filter((item): item is TransferResult => Boolean(item?.source && item?.destination))
    : [];
}

export function normalizeComparablePath(path: PathString) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function pathsEqual(a: PathString, b: PathString) {
  return normalizeComparablePath(a) === normalizeComparablePath(b);
}

export function pathContains(parent: PathString, child: PathString) {
  const parentPath = normalizeComparablePath(parent);
  const childPath = normalizeComparablePath(child);
  if (!parentPath || !childPath) return false;
  if (parentPath === childPath) return true;
  return childPath.startsWith(parentPath.endsWith('/') ? parentPath : `${parentPath}/`);
}

export function getTransferVerb(action: TransferAction) {
  return action === 'move' ? 'Move' : 'Copy';
}

export function toTransferAction(action: ClipboardAction | null): TransferAction {
  return action === 'copy' ? 'copy' : 'move';
}
