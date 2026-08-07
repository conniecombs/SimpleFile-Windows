import { tick } from 'svelte';

export type ModalKind = 'none' | 'confirm' | 'prompt' | 'html' | 'settings';

export type ModalUiState = {
  bodyClass: string;
  bodyHtml: string;
  cancelText: string;
  confirmText: string;
  kind: ModalKind;
  message: string;
  modalClass: string;
  promptLabel: string;
  promptValue: string;
  showCancel: boolean;
  showConfirm: boolean;
  title: string;
  visible: boolean;
};

export const modalUi = $state<ModalUiState>({
  bodyClass: '',
  bodyHtml: '',
  cancelText: 'Cancel',
  confirmText: 'Confirm',
  kind: 'none',
  message: '',
  modalClass: '',
  promptLabel: '',
  promptValue: '',
  showCancel: true,
  showConfirm: true,
  title: 'Dialog',
  visible: false,
});

type ResolveFn = (value: unknown) => void;

let resolveDialog: ResolveFn | null = null;
let onConfirmHandler: (() => unknown) | null = null;
let dialogGeneration = 0;

function resetModalFields() {
  modalUi.kind = 'none';
  modalUi.title = 'Dialog';
  modalUi.message = '';
  modalUi.bodyHtml = '';
  modalUi.confirmText = 'Confirm';
  modalUi.cancelText = 'Cancel';
  modalUi.showCancel = true;
  modalUi.showConfirm = true;
  modalUi.promptLabel = '';
  modalUi.promptValue = '';
  modalUi.modalClass = '';
  modalUi.bodyClass = '';
  onConfirmHandler = null;
}

function settleDialog(result: unknown) {
  const resolve = resolveDialog;
  resolveDialog = null;
  dialogGeneration += 1;
  modalUi.visible = false;
  resetModalFields();
  if (resolve) resolve(result);
}

export function isModalVisible() {
  return modalUi.visible;
}

export function isSettingsModalOpen() {
  return modalUi.visible && modalUi.kind === 'settings';
}

/** Close whatever is open. Dialogs resolve with `result`; settings do not use a promise. */
export function closeModalUi(result: unknown = false) {
  if (!modalUi.visible) return;

  if (modalUi.kind === 'settings') {
    modalUi.visible = false;
    resetModalFields();
    return;
  }

  settleDialog(result);
}

export function cancelModalUi() {
  if (modalUi.kind === 'settings') {
    closeModalUi();
    return;
  }
  // confirm/prompt/html: cancel → null for prompt-style consumers of showDialog,
  // false for showHtmlDialog. Callers pass explicit result via closeModalUi.
  if (modalUi.kind === 'prompt' || modalUi.kind === 'confirm') {
    settleDialog(null);
    return;
  }
  settleDialog(false);
}

export function confirmModalUi() {
  if (!modalUi.visible) return;

  if (modalUi.kind === 'settings') {
    closeModalUi();
    return;
  }

  if (modalUi.kind === 'prompt') {
    settleDialog(modalUi.promptValue.trim());
    return;
  }

  if (modalUi.kind === 'confirm') {
    settleDialog(true);
    return;
  }

  if (modalUi.kind === 'html') {
    const result = onConfirmHandler ? onConfirmHandler() : true;
    settleDialog(result);
  }
}

function beginDialogSession(): number {
  if (resolveDialog) {
    settleDialog(modalUi.kind === 'prompt' || modalUi.kind === 'confirm' ? null : false);
  } else if (modalUi.visible) {
    modalUi.visible = false;
    resetModalFields();
  }
  dialogGeneration += 1;
  return dialogGeneration;
}

export function openConfirmDialog(options: {
  confirmText?: string;
  message?: string;
  title: string;
}): Promise<boolean | null> {
  const generation = beginDialogSession();
  modalUi.kind = 'confirm';
  modalUi.title = options.title;
  modalUi.message = options.message || '';
  modalUi.confirmText = options.confirmText || 'OK';
  modalUi.cancelText = 'Cancel';
  modalUi.showCancel = true;
  modalUi.showConfirm = true;
  modalUi.visible = true;

  return new Promise((resolve) => {
    resolveDialog = (value) => {
      if (generation !== dialogGeneration && value !== null && value !== false && value !== true) {
        // generation advanced; still resolve this waiter
      }
      resolve(value as boolean | null);
    };
  });
}

export function openPromptDialog(options: {
  confirmText?: string;
  defaultValue?: string;
  label?: string;
  message?: string;
  title: string;
}): Promise<string | null> {
  const generation = beginDialogSession();
  modalUi.kind = 'prompt';
  modalUi.title = options.title;
  modalUi.message = options.message || '';
  modalUi.promptLabel = options.label || options.title;
  modalUi.promptValue = options.defaultValue || '';
  modalUi.confirmText = options.confirmText || 'OK';
  modalUi.cancelText = 'Cancel';
  modalUi.showCancel = true;
  modalUi.showConfirm = true;
  modalUi.visible = true;

  return new Promise((resolve) => {
    resolveDialog = (value) => {
      void generation;
      resolve(typeof value === 'string' || value === null ? value : null);
    };
  });
}

export function openHtmlDialog(options: {
  bodyHtml: string;
  confirmText?: string;
  onConfirm?: () => unknown;
  showCancel?: boolean;
  title: string;
}): Promise<unknown> {
  const generation = beginDialogSession();
  modalUi.kind = 'html';
  modalUi.title = options.title;
  modalUi.bodyHtml = options.bodyHtml || '';
  modalUi.confirmText = options.confirmText || 'OK';
  modalUi.cancelText = 'Cancel';
  modalUi.showCancel = options.showCancel !== false;
  modalUi.showConfirm = true;
  onConfirmHandler = options.onConfirm ?? null;
  modalUi.visible = true;

  const settlePromise = new Promise<unknown>((resolve) => {
    resolveDialog = (value) => {
      void generation;
      resolve(value);
    };
  });

  // Flush ModalBody HTML so progressive prop-id updates (checksums, EXIF) can
  // resolve elements after this call returns a promise.
  return tick().then(() => settlePromise);
}

export function openSettingsModalUi() {
  if (resolveDialog) {
    settleDialog(false);
  }
  modalUi.kind = 'settings';
  modalUi.title = 'Settings';
  modalUi.confirmText = 'Close';
  modalUi.cancelText = 'Cancel';
  modalUi.showCancel = false;
  modalUi.showConfirm = true;
  modalUi.modalClass = 'settings-modal';
  modalUi.bodyClass = 'settings-body';
  modalUi.bodyHtml = '';
  modalUi.message = '';
  modalUi.visible = true;
}

export function closeSettingsModalUi() {
  if (modalUi.kind !== 'settings' && !(modalUi.visible && modalUi.modalClass.includes('settings'))) {
    // Still clear if partially open.
  }
  if (!modalUi.visible) return;
  if (modalUi.kind === 'settings' || modalUi.modalClass.includes('settings')) {
    modalUi.visible = false;
    resetModalFields();
  }
}
