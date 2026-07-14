import type { DriveInfo, FileEntry, PathString } from './types';

export type SortDirection = 'asc' | 'desc';

export function isWindowsRoot(path: PathString) {
  return /^[a-zA-Z]:[\\/]?$/.test(path.trim());
}

export function isRootPath(path: PathString) {
  const trimmed = path.trim();
  return trimmed === '/' || isWindowsRoot(trimmed);
}

export function pathSeparator(path: PathString) {
  return path.includes('/') && !path.includes('\\') ? '/' : '\\';
}

export function trimTrailingSeparators(path: PathString) {
  const trimmed = path.trim();
  if (isRootPath(trimmed)) {
    return isWindowsRoot(trimmed) ? `${trimmed.slice(0, 2)}\\` : '/';
  }

  return trimmed.replace(/[\\/]+$/, '');
}

export function joinPath(parent: PathString, name: string) {
  const cleanParent = trimTrailingSeparators(parent);
  if (cleanParent === '/') {
    return `/${name}`;
  }

  return `${cleanParent}${pathSeparator(cleanParent)}${name}`;
}

export function getParentPath(path: PathString) {
  const cleanPath = trimTrailingSeparators(path);
  if (!cleanPath || isRootPath(cleanPath)) {
    return null;
  }

  const lastSeparator = Math.max(cleanPath.lastIndexOf('\\'), cleanPath.lastIndexOf('/'));
  if (lastSeparator < 0) {
    return null;
  }

  if (lastSeparator === 2 && cleanPath[1] === ':') {
    return `${cleanPath.slice(0, 2)}\\`;
  }

  if (lastSeparator === 0) {
    return '/';
  }

  return cleanPath.slice(0, lastSeparator);
}

export function basename(path: PathString) {
  const cleanPath = trimTrailingSeparators(path);
  if (isWindowsRoot(cleanPath)) {
    return cleanPath.slice(0, 2);
  }

  if (cleanPath === '/') {
    return '/';
  }

  return cleanPath.split(/[\\/]/).filter(Boolean).pop() || cleanPath;
}

export function createFallbackDriveForPath(path: PathString): DriveInfo | null {
  if (!path) {
    return null;
  }

  const windowsRoot = /^[a-zA-Z]:[\\/]/.exec(path);
  const rootPath = windowsRoot ? windowsRoot[0] : '/';

  return {
    drive_type: windowsRoot ? 'Fixed' : 'Mount',
    free_space: 0,
    name: windowsRoot ? `Local Disk (${rootPath.slice(0, 2)})` : rootPath,
    path: rootPath,
    total_space: 0,
  };
}

export function isValidFileName(name: string) {
  const trimmed = name.trim();
  return trimmed.length > 0
    && !/[<>:"/\\|?*\u0000-\u001F]/.test(trimmed)
    && trimmed !== '.'
    && trimmed !== '..';
}

export function formatFileSize(bytes: number, isDirectory = false) {
  if (isDirectory) {
    return '';
  }

  const numericBytes = Number(bytes);
  if (!Number.isFinite(numericBytes) || numericBytes < 0) {
    return '';
  }

  if (numericBytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = numericBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatModified(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function fileType(entry: FileEntry) {
  if (entry.is_dir) {
    return 'Folder';
  }

  return entry.extension ? `${entry.extension.toUpperCase()} File` : 'File';
}

function sortValue(entry: FileEntry, sortBy: string) {
  switch (sortBy) {
    case 'size':
      return entry.size;
    case 'modified':
    case 'date':
      return new Date(entry.modified || 0).getTime() || 0;
    case 'items':
      return Number((entry as FileEntry & { itemCountValue?: number }).itemCountValue || 0);
    case 'extension':
    case 'type':
      return entry.is_dir ? 'folder' : (entry.extension || '').toLowerCase();
    case 'name':
    default:
      return entry.name.toLowerCase();
  }
}

export function sortEntries(entries: FileEntry[], sortBy = 'name', sortAsc = true) {
  const direction = sortAsc ? 1 : -1;

  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) {
      return a.is_dir ? -1 : 1;
    }

    const left = sortValue(a, sortBy);
    const right = sortValue(b, sortBy);

    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function filterEntries(entries: FileEntry[], query = '', showHidden = false) {
  const normalizedQuery = query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (!showHidden && entry.name.startsWith('.')) {
      return false;
    }

    return !normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery);
  });
}

export function visibleEntries(
  entries: FileEntry[],
  {
    filterQuery = '',
    showHidden = false,
    sortAsc = true,
    sortBy = 'name',
  }: {
    filterQuery?: string;
    showHidden?: boolean;
    sortAsc?: boolean;
    sortBy?: string;
  } = {},
) {
  return sortEntries(filterEntries(entries, filterQuery, showHidden), sortBy, sortAsc);
}
