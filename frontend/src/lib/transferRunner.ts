import type { TransferWorkflowHost } from './transferWorkflow';
import type { ConflictAction, OperationId, PathString, TransferResult } from './types';
import {
  getTransferVerb,
  normalizeTransferResults,
  pathContains,
  pathsEqual,
  type TransferAction,
} from './transferPathUtils';

export function transferTouchesPath(
  host: TransferWorkflowHost,
  viewPath: PathString,
  sources: PathString[],
  destination: PathString,
) {
  if (!viewPath) return false;

  if (pathContains(viewPath, destination) || pathContains(destination, viewPath)) {
    return true;
  }

  return sources.some((source) => {
    const sourceParent = host.getParentPath(source);
    return (
      pathContains(viewPath, sourceParent)
      || pathContains(sourceParent, viewPath)
      || pathsEqual(viewPath, source)
    );
  });
}

export function usesArchiveTransferPath(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
) {
  return host.isArchivePath(destination) || sources.some((source) => host.isArchivePath(source));
}

export async function getDestinationConflicts(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
) {
  try {
    const listing = await host.api.listDirectory(destination);
    const destNames = new Set(
      (listing.entries || []).map((entry) => (entry.name || '').toLowerCase()),
    );
    return sources.filter((source) => destNames.has(host.getFileName(source).toLowerCase()));
  } catch {
    return [];
  }
}

export function getTransferConflictAction(
  host: TransferWorkflowHost,
  conflicts: PathString[],
): ConflictAction | null {
  if (!conflicts || conflicts.length === 0) return 'error';

  const preview = conflicts.slice(0, 5).map((path) => `* ${host.getFileName(path)}`).join('\n');
  const more = conflicts.length > 5 ? `\n...and ${conflicts.length - 5} more` : '';
  const choice = (host.prompt ?? window.prompt)(
    `Some destination items already exist:\n${preview}${more}\n\nType one of: rename, replace, skip, cancel`,
    'rename',
  );

  if (choice === null) return null;

  const normalized = choice.trim().toLowerCase();
  if (normalized === 'rename' || normalized === 'replace' || normalized === 'skip') {
    return normalized;
  }

  return null;
}

export async function getPreparedConflictAction(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
) {
  const conflicts = await getDestinationConflicts(host, sources, destination);
  return getTransferConflictAction(host, conflicts);
}

export async function runResolvedTransferEntries(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
  action: TransferAction,
  conflictAction: ConflictAction,
) {
  const transferred: TransferResult[] = [];

  for (const source of sources) {
    const result = action === 'copy'
      ? await host.api.copyEntryResolved(source, destination, conflictAction)
      : await host.api.moveEntryResolved(source, destination, conflictAction);

    if (typeof result === 'string' && result.startsWith('SKIPPED:')) continue;
    transferred.push({ source, destination: result });
  }

  return transferred;
}

export async function runTransferEntriesWithProgress(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
  action: TransferAction,
  operationId: OperationId | null = null,
) {
  const conflictAction = await getPreparedConflictAction(host, sources, destination);
  if (conflictAction === null) return [];

  if (usesArchiveTransferPath(host, sources, destination)) {
    return runResolvedTransferEntries(host, sources, destination, action, conflictAction);
  }

  const result = action === 'copy'
    ? await host.api.copyWithProgress(sources, destination, operationId, conflictAction)
    : await host.api.moveWithProgress(sources, destination, operationId, conflictAction);
  return normalizeTransferResults(result);
}

export async function refreshPanesAfterTransfer(
  host: TransferWorkflowHost,
  sources: PathString[],
  destination: PathString,
) {
  const refreshes = [];

  if (transferTouchesPath(host, host.state.currentPath, sources, destination)) {
    refreshes.push(host.refresh());
  }

  if (
    host.state.dualPaneEnabled
    && transferTouchesPath(host, host.state.secondaryPath, sources, destination)
  ) {
    refreshes.push(host.loadSecondaryPane());
  }

  await Promise.all(refreshes.filter(Boolean));
}

export async function queueFileTransfer(
  host: TransferWorkflowHost,
  {
    sources,
    destination,
    action,
    name,
    onComplete,
    onError,
  }: {
    sources: PathString[];
    destination: PathString;
    action: TransferAction;
    name?: string;
    onComplete?: (transferred: TransferResult[]) => Promise<void>;
    onError?: (error: unknown) => Promise<void>;
  },
) {
  const transferSources = [...sources];
  if (transferSources.length === 0 || !destination) return null;

  const conflictAction = await getPreparedConflictAction(host, transferSources, destination);
  if (conflictAction === null) return null;

  const operationId = host.uniqueId(action === 'move' ? 'file-move' : 'file-copy');
  const sourceLabel = transferSources.length === 1
    ? transferSources[0]
    : `${transferSources.length} items`;
  const verb = getTransferVerb(action);

  return host.enqueueTransfer({
    provider: 'Files',
    direction: 'local',
    name: name || `${verb} ${transferSources.length} item(s)`,
    source: sourceLabel,
    destination,
    operationId,
    run: async () => {
      if (usesArchiveTransferPath(host, transferSources, destination)) {
        return runResolvedTransferEntries(
          host,
          transferSources,
          destination,
          action,
          conflictAction,
        );
      }

      const result = action === 'copy'
        ? await host.api.copyWithProgress(transferSources, destination, operationId, conflictAction)
        : await host.api.moveWithProgress(transferSources, destination, operationId, conflictAction);
      return normalizeTransferResults(result);
    },
    onComplete: async (_transfer, result) => {
      await onComplete?.(normalizeTransferResults(result));
    },
    onError: async (_transfer, error) => {
      const message = error instanceof Error ? error.message : String(error);
      host.ui.showError(`${verb} failed: ${message}`);
      await onError?.(error);
    },
  });
}
