import { Channel, convertFileSrc, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { listen, type EventCallback, type EventName, type UnlistenFn } from '@tauri-apps/api/event';
export type { EventCallback, UnlistenFn };
import type {
  CommandArgs,
  CommandResult,
  ArchiveInfo,
  Checksums,
  CleanupResult,
  DirectoryListing,
  DriveInfo,
  FileEntry,
  FilePreview,
  FileMetadata,
  ImageMetadata,
  SearchOptions,
  SearchResult,
  SmartFolder,
  TauriCommandName,
  TauriEventMap,
} from './types';

const DEV_HOME_PATH = 'C:\\Users\\Admin';
const DEV_ROOT_PATH = 'C:\\';

let devFileSystemReady = false;
let devTagCounter = 0;
const devDirectories = new Map<string, FileEntry[]>();
const devArchives = new Map<string, ArchiveInfo>();
const devSmartFolders = new Map<string, SmartFolder>();
const devTags = new Map<number, DevTag>();
const devPathTags = new Map<string, number[]>();

type DevTag = {
  color: string;
  id: number;
  name: string;
};

function hasTauriInvoke() {
  return typeof window !== 'undefined'
    && typeof (window as Window & {
      __TAURI_INTERNALS__?: { invoke?: unknown };
    }).__TAURI_INTERNALS__?.invoke === 'function';
}

function shouldUseDevFallback() {
  return import.meta.env.DEV && !hasTauriInvoke();
}

type ChannelLike<T> = Channel<T> | {
  onmessage?: (message: T) => void;
};

export function createCommandChannel<T>(): ChannelLike<T> {
  if (shouldUseDevFallback()) {
    return {};
  }

  return new Channel<T>();
}

function parentPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z]:[\\/]?$/.test(trimmed)) return null;
  if (trimmed === '/') return null;

  const lastSeparator = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (lastSeparator < 0) return null;
  if (lastSeparator === 2 && trimmed[1] === ':') return `${trimmed.slice(0, 2)}\\`;

  return trimmed.slice(0, lastSeparator) || null;
}

function normalizeDevPath(path: string) {
  const normalized = (path || DEV_HOME_PATH).replace(/\//g, '\\').trim();
  if (/^[a-zA-Z]:$/.test(normalized)) return `${normalized}\\`;
  if (/^[a-zA-Z]:\\?$/.test(normalized)) return `${normalized.slice(0, 2)}\\`;
  return normalized.replace(/\\+$/, '');
}

function devPathKey(path: string) {
  return normalizeDevPath(path).toLowerCase();
}

function devBasename(path: string) {
  return normalizeDevPath(path).split('\\').filter(Boolean).pop() || path;
}

function devJoinPath(parent: string, name: string) {
  const cleanParent = normalizeDevPath(parent);
  if (cleanParent.endsWith('\\')) return `${cleanParent}${name}`;
  return `${cleanParent}\\${name}`;
}

function devEntry(name: string, path: string, isDir = true): FileEntry {
  return {
    extension: isDir ? '' : name.split('.').pop() ?? '',
    is_dir: isDir,
    is_symlink: false,
    modified: '2026-01-01T00:00:00.000Z',
    name,
    path,
    size: 0,
  };
}

function devTextFileContent(name: string) {
  switch (name.toLowerCase()) {
    case 'readme.txt':
      return [
        'SimpleFile browser development preview.',
        '',
        'This text is served by the local Tauri fallback so the Svelte preview pane can be smoke-tested without a desktop shell.',
      ].join('\n');
    case 'notes.txt':
    case 'notes-copy.txt':
      return [
        'SimpleFile browser development preview.',
        '',
        'This second text file gives Compare Files a deterministic browser-dev target.',
      ].join('\n');
    default:
      return '';
  }
}

function devTextFileEntry(name: string, path: string) {
  const entry = devEntry(name, path, false);
  entry.size = devTextFileContent(name).length;
  return entry;
}

function cloneDevEntry(entry: FileEntry): FileEntry {
  return { ...entry };
}

function cloneDevSmartFolder(folder: SmartFolder): SmartFolder {
  return {
    ...folder,
    search_options: {
      ...folder.search_options,
      file_types: folder.search_options.file_types ? [...folder.search_options.file_types] : null,
    },
  };
}

function validateDevName(name: string) {
  const trimmed = name.trim();
  const baseName = name.split('.')[0]?.replace(/ +$/, '').toUpperCase() || '';
  const reserved = ['CON', 'PRN', 'AUX', 'NUL'].includes(baseName)
    || /^COM[1-9]$/.test(baseName)
    || /^LPT[1-9]$/.test(baseName);
  if (
    !trimmed
    || /[<>:"/\\|?*\u0000-\u001F]/.test(trimmed)
    || trimmed === '.'
    || trimmed === '..'
    || /[ .]$/.test(name)
    || reserved
  ) {
    throw new Error(`Invalid file name: ${name}`);
  }

  return name;
}

function setDevDirectory(path: string, entries: FileEntry[]) {
  devDirectories.set(devPathKey(path), entries);
}

function getDevDirectory(path: string) {
  return devDirectories.get(devPathKey(path));
}

function ensureDevDirectory(path: string) {
  const normalizedPath = normalizeDevPath(path);
  const existing = getDevDirectory(normalizedPath);
  if (existing) return existing;

  const parent = getDevParent(normalizedPath);
  if (!parent) throw new Error(`Destination is not a directory: ${normalizedPath}`);

  const parentEntries = ensureDevDirectory(parent);
  const name = validateDevName(devBasename(normalizedPath));
  const existingEntry = parentEntries.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (existingEntry && !existingEntry.is_dir) {
    throw new Error(`Destination is not a directory: ${normalizedPath}`);
  }

  if (!existingEntry) {
    parentEntries.push(devEntry(name, normalizedPath, true));
  }

  const entries: FileEntry[] = [];
  setDevDirectory(normalizedPath, entries);
  return entries;
}

function getDevParent(path: string) {
  return parentPath(normalizeDevPath(path));
}

function findDevEntry(path: string) {
  const parent = getDevParent(path);
  if (!parent) return null;

  return getDevDirectory(parent)
    ?.find((entry) => devPathKey(entry.path) === devPathKey(path))
    ?? null;
}

function deleteDevPath(path: string) {
  const normalizedPath = normalizeDevPath(path);
  const parent = getDevParent(normalizedPath);
  if (!parent) throw new Error('Cannot delete a root path.');

  const entries = getDevDirectory(parent);
  const entry = entries?.find((candidate) => devPathKey(candidate.path) === devPathKey(normalizedPath));
  if (!entries || !entry) throw new Error(`Path does not exist: ${normalizedPath}`);

  const entryKey = devPathKey(entry.path);
  const subtreePrefix = `${entryKey}\\`;
  const nextEntries = entries.filter((candidate) => candidate !== entry);
  setDevDirectory(parent, nextEntries);

  if (entry.is_dir) {
    for (const key of [...devDirectories.keys()]) {
      if (key === entryKey || key.startsWith(subtreePrefix)) {
        devDirectories.delete(key);
      }
    }
  }
}

function cloneDevDirectory(sourcePath: string, destinationPath: string) {
  const sourceEntries = getDevDirectory(sourcePath) ?? [];
  const clonedEntries = sourceEntries.map((child) => {
    const childPath = devJoinPath(destinationPath, child.name);
    const clonedChild = { ...child, path: childPath };
    if (child.is_dir) {
      cloneDevDirectory(child.path, childPath);
    }
    return clonedChild;
  });
  setDevDirectory(destinationPath, clonedEntries);
}

function uniqueDevDestinationName(entries: FileEntry[], name: string) {
  const dotIndex = name.lastIndexOf('.');
  const hasExtension = dotIndex > 0;
  const stem = hasExtension ? name.slice(0, dotIndex) : name;
  const extension = hasExtension ? name.slice(dotIndex) : '';

  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? ' (copy)' : ` (copy ${index})`;
    const candidate = `${stem}${suffix}${extension}`;
    if (!entries.some((entry) => entry.name.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
  }

  return name;
}

function resolveDevDestinationPath(sourceEntry: FileEntry, destinationPath: string, conflictAction = 'error') {
  const destinationEntries = getDevDirectory(destinationPath);
  if (!destinationEntries) throw new Error(`Destination is not a directory: ${destinationPath}`);

  const existing = destinationEntries.find((entry) => entry.name.toLowerCase() === sourceEntry.name.toLowerCase());
  if (!existing) return devJoinPath(destinationPath, sourceEntry.name);

  switch (conflictAction.toLowerCase()) {
    case 'skip':
      return null;
    case 'replace':
      if (devPathKey(existing.path) === devPathKey(sourceEntry.path)) {
        return existing.path;
      }
      deleteDevPath(existing.path);
      return devJoinPath(destinationPath, sourceEntry.name);
    case 'rename':
    case 'keep-both':
    case 'keep_both':
      return devJoinPath(destinationPath, uniqueDevDestinationName(destinationEntries, sourceEntry.name));
    default:
      throw new Error(`CONFLICT: destination already exists: ${devJoinPath(destinationPath, sourceEntry.name)}`);
  }
}

function copyDevPath(source: string, destination: string, conflictAction = 'error') {
  const sourcePath = normalizeDevPath(source);
  const destinationPath = normalizeDevPath(destination);
  const sourceEntry = findDevEntry(sourcePath);
  const destinationEntries = getDevDirectory(destinationPath);

  if (!sourceEntry) throw new Error(`Source does not exist: ${sourcePath}`);
  if (!destinationEntries) throw new Error(`Destination is not a directory: ${destinationPath}`);
  const copiedPath = resolveDevDestinationPath(sourceEntry, destinationPath, conflictAction);
  if (!copiedPath) return `SKIPPED:${sourcePath}`;

  if (devPathKey(copiedPath) === devPathKey(sourceEntry.path)) {
    return copiedPath;
  }

  const finalDestinationEntries = getDevDirectory(destinationPath);
  if (!finalDestinationEntries) throw new Error(`Destination is not a directory: ${destinationPath}`);
  const copiedName = devBasename(copiedPath);
  finalDestinationEntries.push({
    ...sourceEntry,
    extension: sourceEntry.is_dir ? '' : copiedName.split('.').pop() ?? '',
    name: copiedName,
    path: copiedPath,
  });

  if (sourceEntry.is_dir) {
    cloneDevDirectory(sourceEntry.path, copiedPath);
  }

  return copiedPath;
}

function moveDevPath(source: string, destination: string, conflictAction = 'error') {
  const copiedPath = copyDevPath(source, destination, conflictAction);
  if (!copiedPath.startsWith('SKIPPED:') && devPathKey(copiedPath) !== devPathKey(source)) {
    deleteDevPath(source);
  }
  return copiedPath;
}

function transferDevPaths(sources: string[], destination: string, conflictAction: string, action: 'copy' | 'move') {
  const transferred: Array<{ source: string; destination: string }> = [];
  for (const source of sources) {
    const finalPath = action === 'copy'
      ? copyDevPath(source, destination, conflictAction)
      : moveDevPath(source, destination, conflictAction);
    if (!finalPath.startsWith('SKIPPED:')) {
      transferred.push({ source: normalizeDevPath(source), destination: finalPath });
    }
  }
  return transferred;
}

function renameDevPath(path: string, newName: string) {
  const cleanName = validateDevName(newName);
  const parent = getDevParent(path);
  if (!parent) throw new Error('Cannot rename a root path.');
  const entries = getDevDirectory(parent);
  const entry = entries?.find((candidate) => devPathKey(candidate.path) === devPathKey(path));
  if (!entries || !entry) throw new Error(`Path does not exist: ${path}`);
  if (entries.some((candidate) =>
    candidate !== entry && candidate.name.toLowerCase() === cleanName.toLowerCase()
  )) {
    throw new Error(`A file or directory with that name already exists: ${cleanName}`);
  }

  const oldPath = entry.path;
  const newPath = devJoinPath(parent, cleanName);
  entry.name = cleanName;
  entry.path = newPath;
  entry.extension = entry.is_dir ? '' : cleanName.split('.').pop() ?? '';

  const archive = devArchives.get(devPathKey(oldPath));
  if (archive) {
    devArchives.delete(devPathKey(oldPath));
    devArchives.set(devPathKey(newPath), { ...archive, path: newPath });
  }

  if (entry.is_dir) {
    const oldPrefix = `${devPathKey(oldPath)}\\`;
    const moves = [...devDirectories.entries()]
      .filter(([key]) => key === devPathKey(oldPath) || key.startsWith(oldPrefix));
    for (const [oldKey, children] of moves) {
      devDirectories.delete(oldKey);
      const suffix = oldKey.slice(devPathKey(oldPath).length);
      const nextPath = `${newPath}${suffix}`;
      for (const child of children) {
        if (devPathKey(child.path).startsWith(oldPrefix)) {
          child.path = `${newPath}\\${child.path.slice(oldPath.length + 1)}`;
        }
      }
      setDevDirectory(nextPath, children);
    }
  }

  return newPath;
}

function devArchiveFormat(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.rar')) return 'rar';
  return 'zip';
}

function devArchiveInfo(path: string): ArchiveInfo {
  const normalizedPath = normalizeDevPath(path);
  const existing = devArchives.get(devPathKey(normalizedPath));
  if (existing) return existing;

  const entry = findDevEntry(normalizedPath);
  if (!entry) throw new Error(`Archive does not exist: ${normalizedPath}`);
  if (entry.is_dir) throw new Error(`Path is not an archive: ${normalizedPath}`);

  return {
    compressed_size: entry.size,
    entries: [],
    format: devArchiveFormat(normalizedPath),
    path: normalizedPath,
    total_size: 0,
    unsafe_entries: [],
  };
}

function ensureDevFileSystem() {
  if (devFileSystemReady) return;
  devFileSystemReady = true;

  setDevDirectory(DEV_ROOT_PATH, [
    devEntry('Users', 'C:\\Users'),
    devEntry('Temp', 'C:\\Temp'),
  ]);
  setDevDirectory('C:\\Users', [
    devEntry('Admin', DEV_HOME_PATH),
  ]);
  setDevDirectory(DEV_HOME_PATH, [
    devEntry('Desktop', 'C:\\Users\\Admin\\Desktop'),
    devEntry('Documents', 'C:\\Users\\Admin\\Documents'),
    devEntry('Downloads', 'C:\\Users\\Admin\\Downloads'),
    devEntry('Pictures', 'C:\\Users\\Admin\\Pictures'),
    devTextFileEntry('readme.txt', 'C:\\Users\\Admin\\readme.txt'),
    devTextFileEntry('notes.txt', 'C:\\Users\\Admin\\notes.txt'),
    devTextFileEntry('notes-copy.txt', 'C:\\Users\\Admin\\notes-copy.txt'),
  ]);

  for (const path of [
    'C:\\Temp',
    'C:\\Users\\Admin\\Desktop',
    'C:\\Users\\Admin\\Documents',
    'C:\\Users\\Admin\\Downloads',
    'C:\\Users\\Admin\\Pictures',
  ]) {
    setDevDirectory(path, []);
  }
}

function devDirectoryListing(path: string): DirectoryListing {
  ensureDevFileSystem();
  const basePath = normalizeDevPath(path || DEV_HOME_PATH);
  const entries = getDevDirectory(basePath);
  if (!entries) {
    throw new Error(`Path is not a directory: ${basePath}`);
  }

  return {
    entries: entries.map(cloneDevEntry),
    parent: parentPath(basePath),
    path: basePath,
  };
}

function devDrives(): DriveInfo[] {
  return [{
    drive_type: 'Fixed',
    drive_status: 'available',
    free_space: 0,
    name: 'Local Disk (C:)',
    path: 'C:\\',
    remote_path: null,
    status_detail: null,
    total_space: 0,
  }];
}

function devFilePreview(path: string, maxSize?: number): FilePreview {
  const filePath = normalizeDevPath(path);
  const entry = findDevEntry(filePath);
  if (!entry) throw new Error(`Path does not exist: ${filePath}`);
  if (entry.is_dir) throw new Error(`Path is a directory: ${filePath}`);

  const content = devTextFileContent(entry.name);
  const truncatedContent = content.slice(0, maxSize ?? content.length);

  return {
    content: truncatedContent,
    encoding: 'utf-8',
    file_type: 'text',
    mime_type: 'text/plain',
    size: content.length,
  };
}

function devSearchFiles(options: SearchOptions): SearchResult[] {
  const query = options.case_sensitive ? options.query.trim() : options.query.trim().toLowerCase();
  const searchPath = normalizeDevPath(options.search_path || DEV_HOME_PATH);
  const maxDepth = options.max_depth ?? 10;
  const maxResults = options.max_results ?? 500;
  const results: SearchResult[] = [];

  function matches(entry: FileEntry) {
    if (!options.include_hidden && entry.name.startsWith('.')) return false;
    if (options.file_types?.length && !entry.is_dir) {
      const extension = (entry.extension || '').toLowerCase();
      if (!options.file_types.includes(extension)) return false;
    }
    if (!entry.is_dir && options.min_size !== null && options.min_size !== undefined && entry.size < options.min_size) return false;
    if (!entry.is_dir && options.max_size !== null && options.max_size !== undefined && entry.size > options.max_size) return false;
    if (options.date_after && new Date(entry.modified) < new Date(options.date_after)) return false;
    if (options.date_before && new Date(entry.modified) > new Date(options.date_before)) return false;

    const haystack = options.case_sensitive ? entry.name : entry.name.toLowerCase();
    return !query || haystack.includes(query);
  }

  function visit(path: string, depth: number) {
    if (results.length >= maxResults || depth > maxDepth) return;
    const entries = getDevDirectory(path) ?? [];
    for (const entry of entries) {
      if (matches(entry)) {
        results.push({
          extension: entry.extension,
          is_dir: entry.is_dir,
          match_type: 'name',
          modified: entry.modified,
          name: entry.name,
          path: entry.path,
          size: entry.size,
        });
      }

      if (entry.is_dir) {
        visit(entry.path, depth + 1);
      }
      if (results.length >= maxResults) break;
    }
  }

  visit(searchPath, 0);
  return results;
}

function devHexDigest(value: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let hex = hash.toString(16).padStart(8, '0');
  while (hex.length < length) {
    hash = Math.imul(hash ^ hex.length, 16777619) >>> 0;
    hex += hash.toString(16).padStart(8, '0');
  }
  return hex.slice(0, length);
}

function devChecksums(path: string): Checksums {
  const entry = findDevEntry(path);
  if (!entry) throw new Error(`Path does not exist: ${normalizeDevPath(path)}`);
  if (entry.is_dir) throw new Error('Checksums are available for files, not folders.');

  const content = devTextFileContent(entry.name);
  const seed = `${normalizeDevPath(path)}\n${content}`;
  return {
    md5: devHexDigest(`md5:${seed}`, 32),
    sha1: devHexDigest(`sha1:${seed}`, 40),
    sha256: devHexDigest(`sha256:${seed}`, 64),
  };
}

function devImageMetadata(path: string): ImageMetadata {
  const entry = findDevEntry(path);
  if (!entry) throw new Error(`Path does not exist: ${normalizeDevPath(path)}`);
  if (entry.is_dir) throw new Error('Image metadata is available for image files only.');

  return {
    exif: [],
    height: 0,
    width: 0,
  };
}

function devFileMetadata(path: string): FileMetadata {
  const entry = findDevEntry(path);
  if (!entry) throw new Error(`Path does not exist: ${normalizeDevPath(path)}`);
  if (entry.is_dir) {
    return { fields: [], kind: 'unsupported', summary: null };
  }

  const extension = String(entry.extension || entry.name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff'].includes(extension)) {
    return {
      fields: [['Dimensions', '0 × 0']],
      kind: 'image',
      summary: '0 × 0',
    };
  }
  if (extension === 'pdf') {
    return {
      fields: [
        ['Pages', '1'],
        ['Title', devBasename(path)],
      ],
      kind: 'pdf',
      summary: `1 pages · ${devBasename(path)}`,
    };
  }
  if (['mp3', 'flac', 'ogg', 'wav', 'm4a', 'aac'].includes(extension)) {
    return {
      fields: [
        ['Duration', '3:00'],
        ['Title', devBasename(path)],
      ],
      kind: 'audio',
      summary: `${devBasename(path)} (3:00)`,
    };
  }
  if (['mp4', 'm4v', 'mov', 'webm', 'mkv'].includes(extension)) {
    return {
      fields: [
        ['Duration', '1:00'],
        ['Dimensions', '1280 × 720'],
      ],
      kind: 'video',
      summary: '1280 × 720 · 1:00',
    };
  }
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(extension)) {
    return {
      fields: [
        ['Format', extension.toUpperCase()],
        ['Title', devBasename(path)],
      ],
      kind: 'office',
      summary: devBasename(path),
    };
  }

  return { fields: [], kind: 'unsupported', summary: null };
}

function collectDevFiles(directory: string) {
  const rootPath = normalizeDevPath(directory);
  if (!getDevDirectory(rootPath)) throw new Error(`Path is not a directory: ${rootPath}`);

  const files: FileEntry[] = [];
  const visit = (path: string) => {
    for (const entry of getDevDirectory(path) ?? []) {
      if (entry.is_dir) visit(entry.path);
      else files.push(entry);
    }
  };

  visit(rootPath);
  return files;
}

function devCalculateFolderSize(path: string) {
  return collectDevFiles(path).reduce((total, entry) => total + Number(entry.size || 0), 0);
}

function devCountFolderItems(path: string) {
  const normalizedPath = normalizeDevPath(path);
  const entries = getDevDirectory(normalizedPath);
  if (!entries) throw new Error(`Path is not a directory: ${normalizedPath}`);
  return entries.length;
}

function devDiskCleanup(directory: string, sizeThreshold?: number): CleanupResult {
  const threshold = Number(sizeThreshold ?? 100 * 1024 * 1024);
  const files = collectDevFiles(directory);
  const large_files = files
    .filter((entry) => Number(entry.size || 0) >= threshold)
    .map((entry) => [entry.path, Number(entry.size || 0)] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byContent = new Map<string, FileEntry[]>();

  for (const entry of files) {
    const content = devTextFileContent(entry.name);
    const key = `${entry.size}:${content}`;
    byContent.set(key, [...(byContent.get(key) ?? []), entry]);
  }

  const duplicates = [...byContent.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      files: group.map((entry) => entry.path).sort(),
      hash: devHexDigest(`sha256:${devTextFileContent(group[0].name)}`, 64),
    }))
    .sort((a, b) => (a.files[0] || '').localeCompare(b.files[0] || ''));

  return { duplicates, large_files };
}

function cloneDevTag(tag: DevTag): DevTag {
  return { ...tag };
}

function createDevTag(name: string, color: string) {
  const tag = {
    color: color || '#64748b',
    id: ++devTagCounter,
    name: name.trim() || 'Label',
  };
  devTags.set(tag.id, tag);
  return cloneDevTag(tag);
}

function updateDevTag(id: number, name: string, color: string) {
  if (!devTags.has(id)) throw new Error(`Tag does not exist: ${id}`);
  devTags.set(id, {
    color: color || '#64748b',
    id,
    name: name.trim() || 'Label',
  });
}

function deleteDevTag(id: number) {
  devTags.delete(id);
  for (const [path, tagIds] of [...devPathTags.entries()]) {
    const nextIds = tagIds.filter((tagId) => tagId !== id);
    if (nextIds.length) devPathTags.set(path, nextIds);
    else devPathTags.delete(path);
  }
}

function setDevTagsForPath(path: string, tagIds: number[]) {
  const normalizedPath = normalizeDevPath(path);
  const validTagIds = tagIds.filter((id) => devTags.has(id));
  if (validTagIds.length) devPathTags.set(normalizedPath, validTagIds);
  else devPathTags.delete(normalizedPath);
}

function getDevTagsForPath(path: string) {
  return (devPathTags.get(normalizeDevPath(path)) ?? [])
    .map((id) => devTags.get(id))
    .filter((tag): tag is DevTag => Boolean(tag))
    .map(cloneDevTag);
}

function getAllDevFileTags() {
  const result: Record<string, DevTag> = {};
  for (const [path, tagIds] of devPathTags.entries()) {
    const tag = tagIds.map((id) => devTags.get(id)).find(Boolean);
    if (tag) result[path] = cloneDevTag(tag);
  }
  return result;
}

function devCompareFiles(pathA: string, pathB: string) {
  const left = findDevEntry(pathA);
  const right = findDevEntry(pathB);
  if (!left || !right) throw new Error('Both files must exist to compare.');
  if (left.is_dir || right.is_dir) throw new Error('File comparison is available for files, not folders.');

  const leftLines = devTextFileContent(left.name).split(/\r?\n/);
  const rightLines = devTextFileContent(right.name).split(/\r?\n/);
  const rowCount = Math.max(leftLines.length, rightLines.length);
  const rows = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (let index = 0; index < rowCount; index++) {
    const leftText = leftLines[index];
    const rightText = rightLines[index];
    if (leftText === rightText) {
      rows.push({
        kind: 'equal',
        left_line: index + 1,
        left_text: leftText,
        right_line: index + 1,
        right_text: rightText,
      });
    } else if (leftText === undefined) {
      added += 1;
      rows.push({
        kind: 'added',
        left_line: null,
        left_text: null,
        right_line: index + 1,
        right_text: rightText,
      });
    } else if (rightText === undefined) {
      removed += 1;
      rows.push({
        kind: 'removed',
        left_line: index + 1,
        left_text: leftText,
        right_line: null,
        right_text: null,
      });
    } else {
      changed += 1;
      rows.push({
        kind: 'modified',
        left_line: index + 1,
        left_text: leftText,
        right_line: index + 1,
        right_text: rightText,
      });
    }
  }

  return {
    added,
    changed,
    identical: added === 0 && removed === 0 && changed === 0,
    left_name: left.name,
    left_path: left.path,
    left_size: left.size,
    removed,
    right_name: right.name,
    right_path: right.path,
    right_size: right.size,
    rows,
  };
}

async function invokeDevCommand<Name extends TauriCommandName>(
  command: Name,
  args: CommandArgs<Name> | undefined,
): Promise<CommandResult<Name>> {
  ensureDevFileSystem();

  switch (command) {
    case 'get_home_dir':
      return DEV_HOME_PATH as CommandResult<Name>;
    case 'select_directory': {
      const defaultPath = (args as { defaultPath?: string | null } | undefined)?.defaultPath;
      return normalizeDevPath(defaultPath || DEV_HOME_PATH) as CommandResult<Name>;
    }
    case 'list_drives':
      return devDrives() as CommandResult<Name>;
    case 'list_directory': {
      const listArgs = args as { path?: string; onChunk?: { onmessage?: (chunk: unknown) => void } } | undefined;
      const listing = devDirectoryListing(listArgs?.path ?? DEV_HOME_PATH);
      const chunkPayload = {
        path: listing.path,
        parent: listing.parent,
        entries: listing.entries,
        chunk_index: 0,
        done: true,
        is_network: false,
      };
      try {
        listArgs?.onChunk?.onmessage?.(chunkPayload);
      } catch {
        // Dev channel handlers are best-effort.
      }
      return {
        ...listing,
        is_network: false,
      } as CommandResult<Name>;
    }
    case 'list_subdirectories': {
      const listing = devDirectoryListing((args as { path?: string } | undefined)?.path ?? DEV_HOME_PATH);
      return listing.entries
        .filter((entry) => entry.is_dir)
        .map((entry) => ({
          children: [],
          has_children: (getDevDirectory(entry.path)?.some((child) => child.is_dir)) ?? false,
          name: entry.name,
          path: entry.path,
        })) as CommandResult<Name>;
    }
    case 'create_directory': {
      const { path, name } = args as { path: string; name: string };
      const cleanName = validateDevName(name);
      const parent = normalizeDevPath(path);
      const entries = getDevDirectory(parent);
      if (!entries) throw new Error(`Path is not a directory: ${parent}`);
      if (entries.some((entry) => entry.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error(`Directory already exists: ${cleanName}`);
      }
      const newPath = devJoinPath(parent, cleanName);
      entries.push(devEntry(cleanName, newPath, true));
      setDevDirectory(newPath, []);
      return newPath as CommandResult<Name>;
    }
    case 'create_file': {
      const { path, name } = args as { path: string; name: string };
      const cleanName = validateDevName(name);
      const parent = normalizeDevPath(path);
      const entries = getDevDirectory(parent);
      if (!entries) throw new Error(`Path is not a directory: ${parent}`);
      if (entries.some((entry) => entry.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error(`File already exists: ${cleanName}`);
      }
      const newPath = devJoinPath(parent, cleanName);
      entries.push(devEntry(cleanName, newPath, false));
      return newPath as CommandResult<Name>;
    }
    case 'rename_entry': {
      const { path, newName } = args as { path: string; newName: string };
      return renameDevPath(path, newName) as CommandResult<Name>;
    }
    case 'batch_rename': {
      const { entries } = args as { entries: Array<{ path: string; new_name: string }> };
      return entries.map((entry) => renameDevPath(entry.path, entry.new_name)) as CommandResult<Name>;
    }
    case 'delete_entry': {
      const { path } = args as { path: string };
      deleteDevPath(path);
      return undefined as CommandResult<Name>;
    }
    case 'move_to_trash': {
      const { paths } = args as { paths: string[] };
      for (const path of paths) deleteDevPath(path);
      return undefined as CommandResult<Name>;
    }
    case 'get_entry_info': {
      const { path } = args as { path: string };
      const normalizedPath = normalizeDevPath(path);
      const entry = findDevEntry(normalizedPath);
      if (!entry) throw new Error(`Path does not exist: ${normalizedPath}`);
      return cloneDevEntry(entry) as CommandResult<Name>;
    }
    case 'copy_entry': {
      const { source, destination } = args as { source: string; destination: string };
      return copyDevPath(source, destination) as CommandResult<Name>;
    }
    case 'move_entry': {
      const { source, destination } = args as { source: string; destination: string };
      return moveDevPath(source, destination) as CommandResult<Name>;
    }
    case 'copy_entry_resolved': {
      const { source, destination, conflictAction } = args as { source: string; destination: string; conflictAction?: string };
      return copyDevPath(source, destination, conflictAction || 'error') as CommandResult<Name>;
    }
    case 'move_entry_resolved': {
      const { source, destination, conflictAction } = args as { source: string; destination: string; conflictAction?: string };
      return moveDevPath(source, destination, conflictAction || 'error') as CommandResult<Name>;
    }
    case 'copy_with_progress': {
      const { sources, destination, conflictAction } = args as { sources: string[]; destination: string; conflictAction?: string };
      return transferDevPaths(sources, destination, conflictAction || 'error', 'copy') as CommandResult<Name>;
    }
    case 'move_with_progress': {
      const { sources, destination, conflictAction } = args as { sources: string[]; destination: string; conflictAction?: string };
      return transferDevPaths(sources, destination, conflictAction || 'error', 'move') as CommandResult<Name>;
    }
    case 'list_archive': {
      const { path } = args as { path: string };
      return devArchiveInfo(path) as CommandResult<Name>;
    }
    case 'create_archive': {
      const { paths, archivePath, format } = args as { paths: string[]; archivePath: string; format: string };
      const normalizedArchivePath = normalizeDevPath(archivePath);
      const parent = getDevParent(normalizedArchivePath);
      if (!parent) throw new Error('Cannot create an archive at a root path.');
      const parentEntries = getDevDirectory(parent);
      if (!parentEntries) throw new Error(`Destination is not a directory: ${parent}`);
      const archiveName = devBasename(normalizedArchivePath);
      validateDevName(archiveName);
      if (parentEntries.some((entry) => entry.name.toLowerCase() === archiveName.toLowerCase())) {
        throw new Error(`Destination already contains ${archiveName}`);
      }

      const archiveEntries = paths.map((path) => {
        const sourcePath = normalizeDevPath(path);
        const sourceEntry = findDevEntry(sourcePath);
        if (!sourceEntry) throw new Error(`Source does not exist: ${sourcePath}`);
        return {
          compressed_size: Math.max(0, Math.round((sourceEntry.size || 0) * 0.8)),
          is_dir: sourceEntry.is_dir,
          name: sourceEntry.name,
          path: sourceEntry.name,
          size: sourceEntry.size || 0,
        };
      });
      const totalSize = archiveEntries.reduce((sum, entry) => sum + entry.size, 0);
      const archiveEntry = devEntry(archiveName, normalizedArchivePath, false);
      archiveEntry.size = Math.max(archiveEntries.length, Math.round(totalSize * 0.8));
      archiveEntry.extension = archiveName.split('.').pop() ?? '';
      parentEntries.push(archiveEntry);
      devArchives.set(devPathKey(normalizedArchivePath), {
        compressed_size: archiveEntry.size,
        entries: archiveEntries,
        format,
        path: normalizedArchivePath,
        total_size: totalSize,
        unsafe_entries: [],
      });
      return undefined as CommandResult<Name>;
    }
    case 'extract_archive': {
      const { archivePath, destination } = args as { archivePath: string; destination: string };
      const info = devArchiveInfo(archivePath);
      const destinationPath = normalizeDevPath(destination);
      const destinationEntries = ensureDevDirectory(destinationPath);

      const entriesToExtract = info.entries.length > 0
        ? info.entries
        : [{ compressed_size: 0, is_dir: false, name: `${devBasename(info.path)}.extracted.txt`, path: 'extracted.txt', size: 0 }];
      for (const archiveEntry of entriesToExtract) {
        const cleanName = validateDevName(archiveEntry.name || devBasename(archiveEntry.path));
        if (destinationEntries.some((entry) => entry.name.toLowerCase() === cleanName.toLowerCase())) continue;
        const extractedPath = devJoinPath(destinationPath, cleanName);
        destinationEntries.push(devEntry(cleanName, extractedPath, archiveEntry.is_dir));
        if (archiveEntry.is_dir) setDevDirectory(extractedPath, []);
      }
      return undefined as CommandResult<Name>;
    }
    case 'read_file_preview': {
      const { path, maxSize } = args as { path: string; maxSize?: number };
      return devFilePreview(path, maxSize) as CommandResult<Name>;
    }
    case 'compute_checksum': {
      const { path } = args as { path: string };
      return devChecksums(path) as CommandResult<Name>;
    }
    case 'get_image_metadata': {
      const { path } = args as { path: string };
      return devImageMetadata(path) as CommandResult<Name>;
    }
    case 'get_file_metadata': {
      const { path } = args as { path: string };
      return devFileMetadata(path) as CommandResult<Name>;
    }
    case 'generate_thumbnail': {
      // Minimal JPEG payload for browser-dev grid virtualization.
      return '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//Z' as CommandResult<Name>;
    }
    case 'generate_thumbnails': {
      const { paths } = args as { paths: string[] };
      const data = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//Z';
      return paths.map((path) => ({
        path,
        data,
        error: null,
      })) as CommandResult<Name>;
    }
    case 'calculate_folder_size': {
      const { path } = args as { path: string };
      return devCalculateFolderSize(path) as CommandResult<Name>;
    }
    case 'count_folder_items': {
      const { path } = args as { path: string };
      return devCountFolderItems(path) as CommandResult<Name>;
    }
    case 'cancel_folder_size':
    case 'cancel_folder_item_count':
    case 'cancel_count_items':
      return undefined as CommandResult<Name>;
    case 'search_files': {
      const { options } = args as { options: SearchOptions };
      return devSearchFiles(options) as CommandResult<Name>;
    }
    case 'cancel_search':
      return undefined as CommandResult<Name>;
    case 'open_file':
    case 'open_terminal':
    case 'open_powershell_admin':
    case 'open_file_with':
    case 'reveal_in_folder':
    case 'cancel_operation':
    case 'watch_directory':
    case 'unwatch_directory':
      return undefined as CommandResult<Name>;
    case 'compare_files': {
      const { pathA, pathB } = args as { pathA: string; pathB: string };
      return devCompareFiles(pathA, pathB) as CommandResult<Name>;
    }
    case 'load_smart_folders':
      return [...devSmartFolders.values()].map(cloneDevSmartFolder) as CommandResult<Name>;
    case 'save_smart_folder': {
      const { folder } = args as { folder: SmartFolder };
      devSmartFolders.set(folder.id, cloneDevSmartFolder(folder));
      return [...devSmartFolders.values()].map(cloneDevSmartFolder) as CommandResult<Name>;
    }
    case 'delete_smart_folder': {
      const { id } = args as { id: string };
      devSmartFolders.delete(id);
      return [...devSmartFolders.values()].map(cloneDevSmartFolder) as CommandResult<Name>;
    }
    case 'disk_cleanup': {
      const { directory, sizeThreshold } = args as { directory: string; sizeThreshold?: number };
      return devDiskCleanup(directory, sizeThreshold) as CommandResult<Name>;
    }
    case 'cancel_disk_cleanup':
      return undefined as CommandResult<Name>;
    case 'get_all_file_tags':
      return getAllDevFileTags() as CommandResult<Name>;
    case 'get_all_tags':
      return [...devTags.values()].map(cloneDevTag) as CommandResult<Name>;
    case 'create_tag': {
      const { name, color } = args as { name: string; color: string };
      return createDevTag(name, color) as CommandResult<Name>;
    }
    case 'update_tag': {
      const { id, name, color } = args as { id: number; name: string; color: string };
      updateDevTag(Number(id), name, color);
      return undefined as CommandResult<Name>;
    }
    case 'delete_tag': {
      const { id } = args as { id: number };
      deleteDevTag(Number(id));
      return undefined as CommandResult<Name>;
    }
    case 'set_tags_for_path': {
      const { path, tagIds } = args as { path: string; tagIds: number[] };
      setDevTagsForPath(path, (tagIds || []).map(Number));
      return undefined as CommandResult<Name>;
    }
    case 'get_tags_for_path': {
      const { path } = args as { path: string };
      return getDevTagsForPath(path) as CommandResult<Name>;
    }
    case 'get_files_with_tag': {
      const { tagId } = args as { tagId: number };
      return [...devPathTags.entries()]
        .filter(([, tagIds]) => tagIds.includes(Number(tagId)))
        .map(([path]) => path) as CommandResult<Name>;
    }
    case 'get_db_setting':
      return null as CommandResult<Name>;
    case 'set_db_setting':
      return undefined as CommandResult<Name>;

    case 'check_rar_installed':
      return false as CommandResult<Name>;
    case 'prepare_rar_install':
      return {
        confirmation_token: 'dev-rar-confirmation-token',
        download_url: 'https://www.rarlab.com/rar/winrar-x64-723.exe',
        file_name: 'winrar-x64-723.exe',
        installer_path: 'browser-dev-mode',
        publisher: 'CN=win.rar GmbH, O=win.rar GmbH',
        sha256: '8ff0daf3ed564cc743c0e23ff2e253997ffc74460f9673f0b6dd037b2db4ce7b',
      } as CommandResult<Name>;
    case 'discard_rar_install':
      return undefined as CommandResult<Name>;
    case 'install_rar':
      return 'RAR installer is unavailable in browser dev mode.' as CommandResult<Name>;
    case 'get_app_version':
      return 'dev' as CommandResult<Name>;
    case 'get_app_about_info':
      return {
        architecture: 'browser',
        authors: 'SimpleFile contributors',
        build_profile: 'development',
        description: 'SimpleFile browser development shell',
        framework: 'Svelte',
        identifier: 'simplefile.dev',
        license: 'UNLICENSED',
        platform: 'browser',
        product_name: 'SimpleFile',
        repository: '',
        runtime: 'Vite dev server',
        version: 'dev',
      } as CommandResult<Name>;
    case 'check_for_update':
      return null as CommandResult<Name>;
    case 'install_update':
      return undefined as CommandResult<Name>;
    default:
      throw new Error(`Tauri command "${command}" is unavailable in browser dev mode.`);
  }
}

export function invokeCommand<Name extends TauriCommandName>(
  command: Name,
  ...args: CommandArgs<Name> extends undefined ? [] : [args: CommandArgs<Name>]
): Promise<CommandResult<Name>> {
  if (shouldUseDevFallback()) {
    return invokeDevCommand(command, args[0] as CommandArgs<Name> | undefined);
  }

  return invoke<CommandResult<Name>>(command, args[0] as InvokeArgs | undefined);
}

export function listenToEvent<Name extends keyof TauriEventMap>(
  eventName: Name,
  callback: EventCallback<TauriEventMap[Name]>
): Promise<UnlistenFn> {
  if (shouldUseDevFallback()) {
    return Promise.resolve(() => Promise.resolve());
  }

  return listen<TauriEventMap[Name]>(eventName as EventName, callback);
}

export function convertFileSource(filePath: string, protocol?: string): string {
  if (shouldUseDevFallback()) {
    return filePath;
  }

  return convertFileSrc(filePath, protocol);
}
