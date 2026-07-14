import type { SimpleFileAppState } from './appState';
import type { LocalCommandModalResult } from './localCommandDialogUtils';
import {
  compareSelected,
  createFile,
  createFolder,
  deleteSelected,
  packIntoFolder,
  renameSelected,
  unpackFolder,
} from './localCommandFileOperations';
import { openWithSelected } from './localCommandOpenWith';
import { showProperties } from './localCommandProperties';
import { setColorLabel } from './localCommandTags';
import {
  openPowerShellAdminInSelected,
  openTerminal,
  openTerminalInSelected,
  quickLook,
} from './localCommandSystemActions';
import type {
  Checksums,
  DirectoryListing,
  FileComparison,
  FileEntry,
  FilePreview,
  ImageMetadata,
  PathString,
} from './types';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type UndoEntry = {
  description: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
};

type LocalCommandApi = {
  openFileWith: (path: PathString, application: string) => Promise<unknown>;
  compareFiles: (pathA: PathString, pathB: PathString) => Promise<FileComparison>;
  moveToTrash: (paths: PathString[]) => Promise<unknown>;
  deleteEntry: (path: PathString) => Promise<unknown>;
  renameEntry: (path: PathString, newName: string) => Promise<PathString>;
  createDirectory: (path: PathString, name: string) => Promise<PathString>;
  moveEntry: (source: PathString, destination: PathString) => Promise<unknown>;
  listDirectory: (path: PathString) => Promise<DirectoryListing>;
  createFile: (path: PathString, name: string) => Promise<PathString>;
  readFilePreview: (path: PathString) => Promise<FilePreview>;
  openTerminal: (path: PathString) => Promise<unknown>;
  openPowerShellAdmin: (path: PathString) => Promise<unknown>;
  getEntryInfo: (path: PathString) => Promise<FileEntry>;
  computeChecksum: (path: PathString) => Promise<Checksums>;
  getImageMetadata: (path: PathString) => Promise<ImageMetadata>;
  setTagsForPath: (path: PathString, tagIds: number[]) => Promise<unknown>;
};

type LocalCommandUi = {
  showModal: (
    title: string,
    bodyHtml: string,
    confirmText?: string,
    showCancel?: boolean,
  ) => Promise<LocalCommandModalResult>;
  showFileComparison: (comparison: FileComparison) => Promise<unknown>;
  showQuickLook: (
    entry: FileEntry,
    preview: FilePreview,
    blobUrl: string | null,
  ) => void;
  showError: (error: unknown) => void;
  showSuccess: (message: string) => void;
  showUndoableSuccess: (message: string, onUndo: () => void) => void;
};

export type LocalCommandWorkflowHost = {
  state: SimpleFileAppState;
  api: LocalCommandApi;
  ui: LocalCommandUi;
  t: Translate;
  escapeHtml: (value: unknown) => string;
  formatSize: (size: number) => string;
  getFileName: (path: PathString) => string;
  joinPath: (path: PathString, name: string) => PathString;
  isValidFileName: (name: string) => boolean;
  pushUndoEntry: (entry: UndoEntry) => void;
  refresh: () => unknown;
  undo: () => void;
  storage?: Storage;
  document?: Document;
};

export type LocalCommandWorkflowActions = {
  openWithSelected: () => Promise<void>;
  compareSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  renameSelected: () => Promise<void>;
  packIntoFolder: () => Promise<void>;
  unpackFolder: () => Promise<void>;
  createFolder: () => Promise<void>;
  createFile: () => Promise<void>;
  quickLook: () => Promise<void>;
  openTerminal: () => Promise<void>;
  openTerminalInSelected: () => Promise<void>;
  openPowerShellAdminInSelected: () => Promise<void>;
  showProperties: () => Promise<void>;
  setColorLabel: () => Promise<void>;
};

export function createLocalCommandWorkflowActions(
  host: LocalCommandWorkflowHost,
): LocalCommandWorkflowActions {
  const storage = host.storage ?? window.localStorage;
  const documentRef = host.document ?? document;

  return {
    openWithSelected: () => openWithSelected(host, storage),
    compareSelected: () => compareSelected(host),
    deleteSelected: () => deleteSelected(host),
    renameSelected: () => renameSelected(host),
    packIntoFolder: () => packIntoFolder(host),
    unpackFolder: () => unpackFolder(host),
    createFolder: () => createFolder(host),
    createFile: () => createFile(host),
    quickLook: () => quickLook(host),
    openTerminal: () => openTerminal(host),
    openTerminalInSelected: () => openTerminalInSelected(host),
    openPowerShellAdminInSelected: () => openPowerShellAdminInSelected(host),
    showProperties: () => showProperties(host, documentRef),
    setColorLabel: () => setColorLabel(host),
  };
}
