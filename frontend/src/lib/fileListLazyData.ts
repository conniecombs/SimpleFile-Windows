import {
  calculateFolderSize,
  cancelFolderItemCount,
  cancelFolderSize,
  countFolderItems,
  generateThumbnails,
} from './api';
import type { SimpleFileAppState } from './appState';
import type { FileEntry, PathString } from './types';

const IMAGE_EXTENSION_RE = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
const THUMBNAIL_BATCH_SIZE = 24;
const METRIC_CONCURRENCY = 2;

type MetricKind = 'size' | 'count';

type MetricRequest = {
  path: PathString;
  needCount: boolean;
  needSize: boolean;
};

type MetricBatchResult = {
  counts: Map<PathString, number>;
  sizes: Map<PathString, number>;
};

let thumbnailCache = new Map<string, string | null>();
let thumbnailToken = 0;
let thumbnailInFlight = new Set<string>();
let thumbnailRevision = 0;
const thumbnailListeners = new Set<() => void>();

let passiveMetricToken = 0;
const metricInFlight = new Set<string>();
const failedMetricKeys = new Set<string>();

function metricKey(path: PathString, kind: MetricKind) {
  return `${kind}:${path}`;
}

function notifyThumbnailListeners() {
  thumbnailRevision += 1;
  for (const listener of thumbnailListeners) {
    try {
      listener();
    } catch (error) {
      console.warn('Thumbnail listener failed:', error);
    }
  }
}

export function isImageFileName(name: string) {
  return IMAGE_EXTENSION_RE.test(name);
}

export function getThumbnailRevision() {
  return thumbnailRevision;
}

export function subscribeThumbnailCache(listener: () => void) {
  thumbnailListeners.add(listener);
  return () => thumbnailListeners.delete(listener);
}

export function getCachedThumbnail(path: PathString): string | null | undefined {
  if (!thumbnailCache.has(path)) {
    return undefined;
  }
  return thumbnailCache.get(path) ?? null;
}

export function clearThumbnailCache() {
  thumbnailToken += 1;
  thumbnailCache = new Map();
  thumbnailInFlight = new Set();
  notifyThumbnailListeners();
}

export function cancelPassiveFolderMetricWork() {
  passiveMetricToken += 1;
  metricInFlight.clear();
  cancelFolderSize().catch((error) => console.warn('Failed to cancel passive folder size work:', error));
  cancelFolderItemCount().catch((error) => console.warn('Failed to cancel passive folder item count work:', error));
}

/**
 * Generate thumbnails only for currently visible image paths.
 * Results are cached; in-flight paths are not re-requested.
 */
export async function ensureVisibleThumbnails(
  paths: PathString[],
  size: number,
): Promise<number> {
  const requestToken = thumbnailToken;
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const missing = uniquePaths.filter((path) => (
    !thumbnailCache.has(path) && !thumbnailInFlight.has(path)
  ));

  if (missing.length === 0) {
    return thumbnailRevision;
  }

  for (const path of missing) {
    thumbnailInFlight.add(path);
  }

  try {
    for (let offset = 0; offset < missing.length; offset += THUMBNAIL_BATCH_SIZE) {
      if (requestToken !== thumbnailToken) {
        return thumbnailRevision;
      }

      const batch = missing.slice(offset, offset + THUMBNAIL_BATCH_SIZE);
      let results;
      try {
        results = await generateThumbnails(batch, size);
      } catch (error) {
        console.warn('Visible thumbnail batch failed:', error);
        for (const path of batch) {
          if (!thumbnailCache.has(path)) {
            thumbnailCache.set(path, null);
          }
        }
        continue;
      }

      if (requestToken !== thumbnailToken) {
        return thumbnailRevision;
      }

      const returned = new Set<string>();
      for (const result of results) {
        returned.add(result.path);
        thumbnailCache.set(result.path, result.data || null);
      }
      for (const path of batch) {
        if (!returned.has(path) && !thumbnailCache.has(path)) {
          thumbnailCache.set(path, null);
        }
      }

      notifyThumbnailListeners();
    }
  } finally {
    for (const path of missing) {
      thumbnailInFlight.delete(path);
    }
  }

  return thumbnailRevision;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  isCurrent: () => boolean,
) {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (isCurrent()) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}

/**
 * Lazily calculate folder sizes / child counts for currently visible folders.
 * Only paths not already known (or in-flight) are requested.
 */
export async function ensureVisibleFolderMetrics(
  requests: MetricRequest[],
  knownSizes: Map<PathString, number> | undefined,
  knownCounts: Set<PathString> | ((path: PathString) => boolean),
): Promise<MetricBatchResult> {
  const token = passiveMetricToken;
  const isCurrent = () => token === passiveMetricToken;
  const hasCount = typeof knownCounts === 'function'
    ? knownCounts
    : (path: PathString) => knownCounts.has(path);

  const sizes = new Map<PathString, number>();
  const counts = new Map<PathString, number>();

  const work = requests.filter((request) => {
    if (!request.path || (!request.needSize && !request.needCount)) {
      return false;
    }

    const needsSize = request.needSize
      && typeof knownSizes?.get(request.path) !== 'number'
      && !failedMetricKeys.has(metricKey(request.path, 'size'))
      && !metricInFlight.has(metricKey(request.path, 'size'));
    const needsCount = request.needCount
      && !hasCount(request.path)
      && !failedMetricKeys.has(metricKey(request.path, 'count'))
      && !metricInFlight.has(metricKey(request.path, 'count'));

    return needsSize || needsCount;
  }).map((request) => ({
    path: request.path,
    needSize: request.needSize
      && typeof knownSizes?.get(request.path) !== 'number'
      && !failedMetricKeys.has(metricKey(request.path, 'size')),
    needCount: request.needCount
      && !hasCount(request.path)
      && !failedMetricKeys.has(metricKey(request.path, 'count')),
  })).filter((request) => request.needSize || request.needCount);

  for (const request of work) {
    if (request.needSize) metricInFlight.add(metricKey(request.path, 'size'));
    if (request.needCount) metricInFlight.add(metricKey(request.path, 'count'));
  }

  try {
    await runPool(work, METRIC_CONCURRENCY, async (request) => {
      if (!isCurrent()) {
        return;
      }

      const tasks: Array<Promise<void>> = [];

      if (request.needSize) {
        tasks.push((async () => {
          try {
            const size = Number(await calculateFolderSize(request.path) || 0);
            if (!isCurrent()) return;
            sizes.set(request.path, size);
          } catch (error) {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : String(error);
            if (!/cancel/i.test(message)) {
              failedMetricKeys.add(metricKey(request.path, 'size'));
              console.warn('Folder size failed:', request.path, error);
            }
          } finally {
            metricInFlight.delete(metricKey(request.path, 'size'));
          }
        })());
      }

      if (request.needCount) {
        tasks.push((async () => {
          try {
            const count = Number(await countFolderItems(request.path) || 0);
            if (!isCurrent()) return;
            counts.set(request.path, count);
          } catch (error) {
            if (!isCurrent()) return;
            const message = error instanceof Error ? error.message : String(error);
            if (!/cancel/i.test(message)) {
              failedMetricKeys.add(metricKey(request.path, 'count'));
              console.warn('Folder item count failed:', request.path, error);
            }
          } finally {
            metricInFlight.delete(metricKey(request.path, 'count'));
          }
        })());
      }

      await Promise.all(tasks);
    }, isCurrent);
  } finally {
    for (const request of work) {
      metricInFlight.delete(metricKey(request.path, 'size'));
      metricInFlight.delete(metricKey(request.path, 'count'));
    }
  }

  if (!isCurrent()) {
    return { counts: new Map(), sizes: new Map() };
  }

  return { counts, sizes };
}

export function resetPassiveMetricFailures() {
  failedMetricKeys.clear();
}

function itemCountLabel(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function patchEntriesWithPassiveMetrics(
  entries: FileEntry[],
  sizes: Map<PathString, number>,
  counts: Map<PathString, number>,
) {
  let changed = false;
  const next = entries.map((entry) => {
    const count = counts.get(entry.path);
    const size = sizes.get(entry.path);
    if (count === undefined && size === undefined) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      ...(count !== undefined
        ? { itemCount: itemCountLabel(count), itemCountValue: count }
        : {}),
      ...(size !== undefined ? { size } : {}),
    };
  });

  return changed ? next : entries;
}

/**
 * Apply lazily-loaded visible-folder size/count results onto app state.
 * Avoids re-sorting unless the active sort depends on those metrics.
 */
export function applyPassiveFolderMetricsToState(
  appState: SimpleFileAppState,
  sizes: Map<PathString, number>,
  counts: Map<PathString, number>,
  refilter?: {
    primary?: () => void;
    secondary?: () => void;
  },
) {
  if (sizes.size === 0 && counts.size === 0) {
    return;
  }

  if (sizes.size > 0) {
    const nextFolderSizes = new Map(appState.folderSizes || new Map());
    for (const [path, size] of sizes) {
      nextFolderSizes.set(path, size);
    }
    appState.folderSizes = nextFolderSizes;
  }

  appState.entries = patchEntriesWithPassiveMetrics(appState.entries, sizes, counts);
  appState.secondaryEntries = patchEntriesWithPassiveMetrics(
    appState.secondaryEntries || [],
    sizes,
    counts,
  );
  if (appState._savedEntries) {
    appState._savedEntries = patchEntriesWithPassiveMetrics(appState._savedEntries, sizes, counts);
  }

  if (appState.sortBy === 'size' || appState.sortBy === 'items') {
    refilter?.primary?.();
    if (appState.dualPaneEnabled) {
      refilter?.secondary?.();
    }
    return;
  }

  appState.filteredEntries = patchEntriesWithPassiveMetrics(
    appState.filteredEntries,
    sizes,
    counts,
  );
  if (appState.dualPaneEnabled) {
    appState.secondaryFilteredEntries = patchEntriesWithPassiveMetrics(
      appState.secondaryFilteredEntries || [],
      sizes,
      counts,
    );
  }
}
