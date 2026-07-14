import type { TransferWorkflowHost } from './transferWorkflow';
import type { PathString, TransferResult } from './types';

export function addCopyUndo(
  host: TransferWorkflowHost,
  transferred: TransferResult[],
  destination: PathString,
  description = `Copy ${transferred.length} item(s)`,
) {
  host.pushUndoEntry({
    description,
    undo: async () => { await host.api.moveToTrash(transferred.map((item) => item.destination)); },
    redo: async () => {
      for (const item of transferred) {
        await host.api.copyEntryResolved(item.source, destination, 'rename');
      }
    },
  });
}

export function addMoveUndo(
  host: TransferWorkflowHost,
  transferred: TransferResult[],
  destination: PathString,
  description = `Move ${transferred.length} item(s)`,
) {
  host.pushUndoEntry({
    description,
    undo: async () => {
      for (const item of [...transferred].reverse()) {
        await host.api.moveEntryResolved(item.destination, host.getParentPath(item.source), 'rename');
      }
    },
    redo: async () => {
      for (const item of transferred) {
        await host.api.moveEntryResolved(item.source, destination, 'rename');
      }
    },
  });
}
