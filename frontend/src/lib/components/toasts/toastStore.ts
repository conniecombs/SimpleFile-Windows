import { writable } from 'svelte/store';

export type ToastKind = 'success' | 'error';

export type ToastAction = {
  label: string;
  callback?: () => void;
};

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  durationMs: number;
  fading: boolean;
  action?: ToastAction;
};

const FADE_OUT_MS = 300;

let nextToastId = 1;
const timers = new Map<number, number[]>();

export const toasts = writable<Toast[]>([]);

function clearToastTimers(id: number) {
  for (const timer of timers.get(id) ?? []) {
    window.clearTimeout(timer);
  }
  timers.delete(id);
}

export function removeToast(id: number) {
  clearToastTimers(id);
  toasts.update((items) => items.filter((toast) => toast.id !== id));
}

export function dismissToast(id: number, animated = true) {
  clearToastTimers(id);

  if (!animated) {
    removeToast(id);
    return;
  }

  let shouldScheduleRemoval = false;
  toasts.update((items) =>
    items.map((toast) => {
      if (toast.id !== id) {
        return toast;
      }

      shouldScheduleRemoval = !toast.fading;
      return { ...toast, fading: true };
    }),
  );

  if (shouldScheduleRemoval) {
    timers.set(id, [window.setTimeout(() => removeToast(id), FADE_OUT_MS)]);
  }
}

export function addToast(
  options: Pick<Toast, 'message' | 'kind' | 'durationMs' | 'action'>,
) {
  const id = nextToastId++;
  const toast: Toast = {
    ...options,
    id,
    fading: false,
  };

  toasts.update((items) => [...items, toast]);

  if (toast.durationMs > 0) {
    timers.set(id, [window.setTimeout(() => dismissToast(id), toast.durationMs)]);
  }

  return id;
}

export function triggerToastAction(toast: Toast) {
  try {
    toast.action?.callback?.();
  } finally {
    dismissToast(toast.id, false);
  }
}
