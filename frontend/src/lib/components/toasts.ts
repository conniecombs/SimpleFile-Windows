import { mount } from 'svelte';

import ToastHost from './toasts/ToastHost.svelte';
import { addToast } from './toasts/toastStore';
import type { ToastKind } from './toasts/toastStore';

const TOAST_ROOT_ID = 'simplefile-svelte-toast-root';

let mounted = false;

function normalizeMessage(message: unknown, fallback: string) {
  if (typeof message === 'string') {
    return message;
  }

  if (message instanceof Error && message.message) {
    return message.message;
  }

  if (message && typeof message === 'object' && 'message' in message) {
    const value = (message as { message?: unknown }).message;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const text = String(message ?? '');
  return text.length > 0 ? text : fallback;
}

function ensureToastHost() {
  if (mounted) {
    return;
  }

  let target = document.getElementById(TOAST_ROOT_ID);
  if (!target) {
    target = document.createElement('div');
    target.id = TOAST_ROOT_ID;
    document.body.appendChild(target);
  }

  mount(ToastHost, { target });
  mounted = true;
}

export function showToast(message: unknown, kind: ToastKind, durationMs: number) {
  ensureToastHost();

  return addToast({
    message: normalizeMessage(
      message,
      kind === 'error' ? 'An error occurred' : 'Operation completed',
    ),
    kind,
    durationMs,
  });
}

export function showSuccess(message: unknown) {
  return showToast(message, 'success', 2000);
}

export function showError(message: unknown) {
  return showToast(message, 'error', 3000);
}

export function showUndoableSuccess(message: unknown, onUndo?: () => void) {
  ensureToastHost();

  return addToast({
    message: normalizeMessage(message, 'Operation completed'),
    kind: 'success',
    durationMs: 4000,
    action: {
      label: 'Undo',
      callback: onUndo,
    },
  });
}
