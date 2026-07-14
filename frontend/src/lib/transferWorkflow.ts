import type { SimpleFileAppState } from './appState';
import { pushClipboardHistory } from './transferClipboard';
import { getTransferVerb, toTransferAction, type TransferAction } from './transferPathUtils';
import {
  queueFileTransfer,
  refreshPanesAfterTransfer,
  runTransferEntriesWithProgress,
} from './transferRunner';
import { addCopyUndo, addMoveUndo } from './transferUndo';
import type {
  ConflictAction,
  DirectoryListing,
  OperationId,
  PathString,
  TransferResult,
} from './types';

type Translate = (key: string, values?: Record<string, unknown>) => string;
type Prompt = (message: string, defaultValue?: string) => string | null;
type UndoEntry = {
  description: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
};

type TransferApi = {
  listDirectory: (path: PathString) => Promise<DirectoryListing>;
  copyEntryResolved: (
    source: PathString,
    destination: PathString,
    conflictAction: ConflictAction,
  ) => Promise<PathString>;
  moveEntryResolved: (
    source: PathString,
    destination: PathString,
    conflictAction: ConflictAction,
  ) => Promise<PathString>;
  copyWithProgress: (
    sources: PathString[],
    destination: PathString,
    operationId: OperationId | null,
    conflictAction: ConflictAction,
  ) => Promise<TransferResult[]>;
  moveWithProgress: (
    sources: PathString[],
    destination: PathString,
    operationId: OperationId | null,
    conflictAction: ConflictAction,
  ) => Promise<TransferResult[]>;
  moveToTrash: (paths: PathString[]) => Promise<unknown>;
};

type TransferUi = {
  showModal: (
    title: string,
    bodyHtml: string,
    confirmText?: string,
    showCancel?: boolean,
  ) => Promise<unknown>;
  hideModal: () => void;
  showError: (error: unknown) => void;
  showSuccess: (message: string) => void;
  showUndoableSuccess: (message: string, onUndo: () => void) => void;
  updateCutItemsVisual: () => void;
};

type QueuedTransfer = {
  provider: string;
  direction: 'local';
  name: string;
  source: string;
  destination: PathString;
  operationId: OperationId;
  run: () => Promise<TransferResult[]>;
  onComplete: (_transfer: unknown, result: unknown) => Promise<void>;
  onError: (_transfer: unknown, error: unknown) => Promise<void>;
};

export type TransferWorkflowHost = {
  state: SimpleFileAppState;
  api: TransferApi;
  ui: TransferUi;
  t: Translate;
  escapeHtml: (value: unknown) => string;
  getFileName: (path: PathString) => string;
  getParentPath: (path: PathString) => PathString;
  isArchivePath: (path: PathString) => boolean;
  uniqueId: (prefix?: string) => OperationId;
  pushUndoEntry: (entry: UndoEntry) => void;
  refresh: () => unknown;
  loadSecondaryPane: () => unknown;
  undo: () => void;
  enqueueTransfer: (transfer: QueuedTransfer) => unknown;
  document?: Document;
  prompt?: Prompt;
};

export type TransferWorkflowActions = {
  copy: () => void;
  cut: () => void;
  showClipboardHistory: () => Promise<void>;
  pasteFromHistory: (idx: number) => Promise<void>;
  transferEntries: (
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
    operationId?: OperationId | null,
  ) => Promise<TransferResult[]>;
  paste: () => Promise<void>;
  copyTo: (sources: PathString[], destination: PathString) => Promise<void>;
  moveTo: (sources: PathString[], destination: PathString) => Promise<void>;
  handleExternalDrop: (
    paths: PathString[] | null | undefined,
    destinationOverride?: PathString | null,
  ) => Promise<void>;
  copyToOtherPane: () => Promise<void>;
  moveToOtherPane: () => Promise<void>;
};

export function createTransferWorkflowActions(host: TransferWorkflowHost): TransferWorkflowActions {
  const { state, ui } = host;
  const documentRef = host.document ?? document;

  const actions: TransferWorkflowActions = {
    copy() {
      if (state.selectedEntries.size > 0) {
        const paths = [...state.selectedEntries];
        pushClipboardHistory(state, paths, 'copy');
        state.clipboard = paths;
        state.clipboardAction = 'copy';
        ui.updateCutItemsVisual();
      }
    },

    cut() {
      if (state.selectedEntries.size > 0) {
        const paths = [...state.selectedEntries];
        pushClipboardHistory(state, paths, 'cut');
        state.clipboard = paths;
        state.clipboardAction = 'cut';
        ui.updateCutItemsVisual();
      }
    },

    async showClipboardHistory() {
      const history = state.clipboardHistory;
      if (history.length === 0) {
        void ui.showModal(
          'Clipboard History',
          '<p class="placeholder-msg">Clipboard history is empty.</p>',
          'Close',
          false,
        );
        return;
      }

      const rows = history.map((entry, idx) => {
        const icon = entry.action === 'cut' ? '&#9986;' : '&#128203;';
        const label = entry.paths.length === 1
          ? host.getFileName(entry.paths[0])
          : `${entry.paths.length} items`;
        return `
                <div class="clipboard-history-item" data-index="${idx}" role="option" tabindex="0" title="${host.escapeHtml(entry.paths.join('\n'))}">
                    <span class="clipboard-history-icon" aria-hidden="true">${icon}</span>
                    <span class="clipboard-history-label">${host.escapeHtml(label)}</span>
                    <span class="clipboard-history-action">${host.escapeHtml(entry.action)}</span>
                    <button class="clipboard-history-paste btn btn-sm btn-primary" data-index="${idx}">Paste</button>
                </div>
            `;
      }).join('');

      const content = `<div class="clipboard-history-list" role="listbox" aria-label="Clipboard history">${rows}</div>`;
      void ui.showModal('Clipboard History', content, 'Close', false);

      documentRef.querySelectorAll('.clipboard-history-paste').forEach((button) => {
        if (!(button instanceof HTMLElement)) return;

        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const idx = Number.parseInt(button.dataset.index ?? '', 10);
          ui.hideModal();
          void actions.pasteFromHistory(idx);
        });
      });
    },

    async pasteFromHistory(idx) {
      const entry = state.clipboardHistory[idx];
      if (!entry) return;

      state.clipboard = [...entry.paths];
      state.clipboardAction = entry.action;
      ui.updateCutItemsVisual();
      await actions.paste();
    },

    async transferEntries(sources, destination, action, operationId = null) {
      return runTransferEntriesWithProgress(host, sources, destination, action, operationId);
    },

    async paste() {
      if (!state.clipboard || state.clipboard.length === 0) return;

      const destination = state.currentPath;
      const sources = [...state.clipboard];
      const action = toTransferAction(state.clipboardAction);
      const label = sources.length === 1 ? host.getFileName(sources[0]) : `${sources.length} items`;

      try {
        await queueFileTransfer(host, {
          sources,
          destination,
          action,
          name: `${getTransferVerb(action)} ${label}`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              if (action === 'copy') {
                addCopyUndo(host, transferred, destination);
                ui.showUndoableSuccess(`Copied ${transferred.length} item(s)`, () => host.undo());
              } else {
                addMoveUndo(host, transferred, destination);
                ui.showUndoableSuccess(`Moved ${transferred.length} item(s)`, () => host.undo());
                state.clipboard = null;
                state.clipboardAction = null;
              }
            }

            await refreshPanesAfterTransfer(host, sources, destination);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },

    async copyTo(sources, destination) {
      try {
        await queueFileTransfer(host, {
          sources,
          destination,
          action: 'copy',
          name: `Copy ${sources.length} item(s)`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              addCopyUndo(host, transferred, destination);
              ui.showUndoableSuccess(`Copied ${transferred.length} item(s)`, () => host.undo());
            }

            await refreshPanesAfterTransfer(host, sources, destination);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },

    async moveTo(sources, destination) {
      try {
        await queueFileTransfer(host, {
          sources,
          destination,
          action: 'move',
          name: `Move ${sources.length} item(s)`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              addMoveUndo(host, transferred, destination);
              ui.showUndoableSuccess(`Moved ${transferred.length} item(s)`, () => host.undo());
            }

            await refreshPanesAfterTransfer(host, sources, destination);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },

    async handleExternalDrop(paths, destinationOverride = null) {
      if (!paths || paths.length === 0) return;

      const destination = destinationOverride || state.currentPath;
      if (!destination) {
        ui.showError('Choose a destination folder before dropping files.');
        return;
      }

      const label = paths.length === 1
        ? host.getFileName(paths[0])
        : `${paths.length} items`;

      try {
        await queueFileTransfer(host, {
          sources: paths,
          destination,
          action: 'copy',
          name: `Copy ${label}`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              ui.showSuccess(`Copied ${label} to ${host.getFileName(destination) || destination}`);
            }

            await refreshPanesAfterTransfer(host, paths, destination);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },

    async copyToOtherPane() {
      if (!state.dualPaneEnabled) return;

      const sources = state.activePane === 'primary'
        ? state.selectedEntries
        : state.secondarySelectedEntries;
      const destination = state.activePane === 'primary'
        ? state.secondaryPath
        : state.currentPath;

      if (sources.size === 0) {
        ui.showError(host.t('no_files_selected'));
        return;
      }

      try {
        await queueFileTransfer(host, {
          sources: [...sources],
          destination,
          action: 'copy',
          name: `Copy ${sources.size} item(s) to other pane`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              addCopyUndo(
                host,
                transferred,
                destination,
                `Copy ${transferred.length} item(s) to other pane`,
              );
              ui.showUndoableSuccess(`Copied ${transferred.length} item(s)`, () => host.undo());
            }

            await Promise.all([
              host.refresh(),
              host.loadSecondaryPane(),
            ]);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },

    async moveToOtherPane() {
      if (!state.dualPaneEnabled) return;

      const sources = state.activePane === 'primary'
        ? state.selectedEntries
        : state.secondarySelectedEntries;
      const destination = state.activePane === 'primary'
        ? state.secondaryPath
        : state.currentPath;

      if (sources.size === 0) {
        ui.showError(host.t('no_files_selected'));
        return;
      }

      try {
        await queueFileTransfer(host, {
          sources: [...sources],
          destination,
          action: 'move',
          name: `Move ${sources.size} item(s) to other pane`,
          onComplete: async (transferred) => {
            if (transferred.length > 0) {
              addMoveUndo(
                host,
                transferred,
                destination,
                `Move ${transferred.length} item(s) to other pane`,
              );
              ui.showUndoableSuccess(`Moved ${transferred.length} item(s)`, () => host.undo());
            }

            await Promise.all([
              host.refresh(),
              host.loadSecondaryPane(),
            ]);
          },
        });
      } catch (error) {
        ui.showError(error);
      }
    },
  };

  return actions;
}
