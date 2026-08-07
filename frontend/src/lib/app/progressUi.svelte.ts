import { cancelOperation } from '../api';
import type { OperationId } from '../types';

export type ProgressPhase = 'idle' | 'running' | 'cancelling';

export type ProgressTransferDetails = {
  /** Bytes completed so far (transfer ops). */
  currentBytes?: number | null;
  /** Free-form secondary line (e.g. folder metrics) instead of byte totals. */
  detailLine?: string | null;
  /** Known total bytes (may grow as the backend discovers files). */
  totalBytes?: number | null;
};

export type ProgressUiState = {
  bytesPerSecond: number | null;
  currentBytes: number | null;
  /** Non-byte progress detail (folder metrics, etc.). */
  detailLine: string;
  etaSeconds: number | null;
  item: string;
  onCancel: (() => unknown) | null;
  operationId: OperationId | null;
  percent: number;
  phase: ProgressPhase;
  statusMessage: string;
  title: string;
  totalBytes: number | null;
  visible: boolean;
};

export const progressUi = $state<ProgressUiState>({
  bytesPerSecond: null,
  currentBytes: null,
  detailLine: '',
  etaSeconds: null,
  item: '',
  onCancel: null,
  operationId: null,
  percent: 0,
  phase: 'idle',
  statusMessage: '',
  title: 'Processing...',
  totalBytes: null,
  visible: false,
});

type RateSample = {
  bytes: number;
  timeMs: number;
};

let rateSample: RateSample | null = null;
let rateEma = 0;
let cancelHideTimer: ReturnType<typeof setTimeout> | null = null;

function clampPercent(percent: number) {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

function clearCancelHideTimer() {
  if (cancelHideTimer != null) {
    clearTimeout(cancelHideTimer);
    cancelHideTimer = null;
  }
}

function resetRateTracking() {
  rateSample = null;
  rateEma = 0;
}

function noteByteSample(currentBytes: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!rateSample) {
    rateSample = { bytes: currentBytes, timeMs: now };
    return;
  }

  const elapsedSec = (now - rateSample.timeMs) / 1000;
  if (elapsedSec < 0.12) return;

  const delta = currentBytes - rateSample.bytes;
  rateSample = { bytes: currentBytes, timeMs: now };
  if (delta < 0) {
    rateEma = 0;
    return;
  }

  const instant = delta / elapsedSec;
  rateEma = rateEma > 0 ? rateEma * 0.72 + instant * 0.28 : instant;
}

function recomputeEta(currentBytes: number | null, totalBytes: number | null) {
  if (
    currentBytes == null
    || totalBytes == null
    || totalBytes <= 0
    || currentBytes >= totalBytes
    || rateEma <= 1
  ) {
    progressUi.etaSeconds = null;
    progressUi.bytesPerSecond = rateEma > 1 ? rateEma : null;
    return;
  }

  progressUi.bytesPerSecond = rateEma;
  progressUi.etaSeconds = (totalBytes - currentBytes) / rateEma;
}

export function isProgressVisible() {
  return progressUi.visible;
}

export function isProgressCancelling() {
  return progressUi.visible && progressUi.phase === 'cancelling';
}

export function showProgressUi(
  title: string,
  item = '',
  percent = 0,
  operationId: OperationId | null = null,
  onCancel: (() => unknown) | null = null,
  details: ProgressTransferDetails = {},
) {
  clearCancelHideTimer();
  resetRateTracking();
  progressUi.title = title || 'Processing...';
  progressUi.item = item || '';
  progressUi.percent = clampPercent(percent);
  progressUi.operationId = operationId;
  progressUi.onCancel = onCancel;
  progressUi.phase = 'running';
  progressUi.statusMessage = '';
  progressUi.currentBytes = details.currentBytes ?? null;
  progressUi.totalBytes = details.totalBytes ?? null;
  progressUi.detailLine = details.detailLine ?? '';
  progressUi.bytesPerSecond = null;
  progressUi.etaSeconds = null;
  progressUi.visible = true;

  if (typeof details.currentBytes === 'number') {
    noteByteSample(details.currentBytes);
  }
}

export function updateProgressUi(
  percent: number,
  item?: string,
  details: ProgressTransferDetails = {},
) {
  progressUi.percent = clampPercent(percent);
  if (typeof item === 'string' && item) {
    progressUi.item = item;
  }

  if (details.currentBytes !== undefined) {
    progressUi.currentBytes = details.currentBytes;
  }
  if (details.totalBytes !== undefined) {
    progressUi.totalBytes = details.totalBytes;
  }
  if (details.detailLine !== undefined) {
    progressUi.detailLine = details.detailLine || '';
  }

  if (typeof progressUi.currentBytes === 'number' && !progressUi.detailLine) {
    noteByteSample(progressUi.currentBytes);
    recomputeEta(progressUi.currentBytes, progressUi.totalBytes);
  }

  if (progressUi.phase === 'cancelling' && !progressUi.statusMessage) {
    progressUi.statusMessage = 'Cancelling…';
  }
}

export function hideProgressUi() {
  clearCancelHideTimer();
  resetRateTracking();
  progressUi.visible = false;
  progressUi.operationId = null;
  progressUi.onCancel = null;
  progressUi.percent = 0;
  progressUi.item = '';
  progressUi.title = 'Processing...';
  progressUi.phase = 'idle';
  progressUi.statusMessage = '';
  progressUi.currentBytes = null;
  progressUi.totalBytes = null;
  progressUi.detailLine = '';
  progressUi.bytesPerSecond = null;
  progressUi.etaSeconds = null;
}

/**
 * Cancel button: request backend cancel, run optional cancel hook, keep the
 * dialog visible with "Cancelling…" feedback until the op finishes or times out.
 */
export function cancelProgressUi() {
  if (!progressUi.visible || progressUi.phase === 'cancelling') return;

  progressUi.phase = 'cancelling';
  progressUi.statusMessage = 'Cancelling…';

  const operationId = progressUi.operationId;
  const onCancel = progressUi.onCancel;

  if (operationId) {
    // Ignore "operation not found" races when the backend finishes with the click.
    cancelOperation(operationId).catch(() => {});
  }
  if (onCancel) {
    Promise.resolve(onCancel()).catch(() => {});
  }

  // Frontend-only progress (no backend op id) still needs to close promptly.
  if (!operationId) {
    clearCancelHideTimer();
    cancelHideTimer = setTimeout(() => {
      hideProgressUi();
    }, 180);
    return;
  }

  // Safety net if a cancel acknowledgement never arrives.
  clearCancelHideTimer();
  cancelHideTimer = setTimeout(() => {
    if (progressUi.phase === 'cancelling' && progressUi.operationId === operationId) {
      hideProgressUi();
    }
  }, 45_000);
}

/** Escape / dismiss without requesting backend cancel (matches prior shell behavior). */
export function dismissProgressUi() {
  hideProgressUi();
}

export function formatProgressBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatProgressRate(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond) || bytesPerSecond < 1) {
    return '';
  }
  return `${formatProgressBytes(bytesPerSecond)}/s`;
}

export function formatProgressEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 1) return 'Less than a second remaining';
  if (seconds < 60) return `About ${Math.ceil(seconds)}s remaining`;

  const totalMinutes = Math.ceil(seconds / 60);
  if (totalMinutes < 60) {
    return `About ${totalMinutes} min remaining`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `About ${hours}h remaining`;
  return `About ${hours}h ${minutes}m remaining`;
}

export function progressItemLabel(pathOrName: string): string {
  if (!pathOrName) return '';
  const normalized = pathOrName.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || pathOrName;
}
