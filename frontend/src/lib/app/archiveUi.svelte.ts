import type { ArchiveEntry, ArchiveFormat, PathString } from '../types';

export type ArchiveViewerState = {
  archivePath: PathString | null;
  compressedSize: number | null;
  entries: ArchiveEntry[];
  format: string;
  title: string;
  totalSize: number | null;
  unsafeEntries: string[];
  visible: boolean;
};

export type CreateArchiveState = {
  defaultName: string;
  format: ArchiveFormat;
  name: string;
  selectedNames: string[];
  selectedPaths: PathString[];
  targetDirectory: PathString;
  visible: boolean;
};

export const archiveViewer = $state<ArchiveViewerState>({
  archivePath: null,
  compressedSize: null,
  entries: [],
  format: '',
  title: 'Archive Contents',
  totalSize: null,
  unsafeEntries: [],
  visible: false,
});

export const createArchiveUi = $state<CreateArchiveState>({
  defaultName: 'archive.zip',
  format: 'zip',
  name: 'archive.zip',
  selectedNames: [],
  selectedPaths: [],
  targetDirectory: '',
  visible: false,
});

export function isArchiveViewerVisible() {
  return archiveViewer.visible;
}

export function isCreateArchiveVisible() {
  return createArchiveUi.visible;
}

export function showArchiveViewer(options: {
  archivePath: PathString;
  compressedSize?: number | null;
  entries?: ArchiveEntry[];
  format?: string;
  title?: string;
  totalSize?: number | null;
  unsafeEntries?: string[];
}) {
  archiveViewer.archivePath = options.archivePath;
  archiveViewer.compressedSize = options.compressedSize ?? null;
  archiveViewer.entries = options.entries ?? [];
  archiveViewer.format = options.format ?? '';
  archiveViewer.title = options.title || 'Archive Contents';
  archiveViewer.totalSize = options.totalSize ?? null;
  archiveViewer.unsafeEntries = options.unsafeEntries ?? [];
  archiveViewer.visible = true;
}

export function closeArchiveViewer() {
  archiveViewer.visible = false;
  archiveViewer.archivePath = null;
  archiveViewer.entries = [];
  archiveViewer.unsafeEntries = [];
  archiveViewer.format = '';
  archiveViewer.title = 'Archive Contents';
  archiveViewer.totalSize = null;
  archiveViewer.compressedSize = null;
}

export function openCreateArchiveUi(options: {
  defaultName: string;
  format: ArchiveFormat;
  selectedNames: string[];
  selectedPaths: PathString[];
  targetDirectory: PathString;
}) {
  createArchiveUi.defaultName = options.defaultName;
  createArchiveUi.name = options.defaultName;
  createArchiveUi.format = options.format;
  createArchiveUi.selectedNames = options.selectedNames;
  createArchiveUi.selectedPaths = options.selectedPaths;
  createArchiveUi.targetDirectory = options.targetDirectory;
  createArchiveUi.visible = true;
}

export function closeCreateArchiveUi() {
  createArchiveUi.visible = false;
  createArchiveUi.selectedNames = [];
  createArchiveUi.selectedPaths = [];
  createArchiveUi.targetDirectory = '';
}
