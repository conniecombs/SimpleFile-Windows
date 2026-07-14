import type { LocalCommandWorkflowHost } from './localCommandWorkflow';
import { modalText } from './localCommandDialogUtils';
import {
  firstSelectedPath,
  getSelectedDirectoryPathsInFilteredView,
  getSelectedEntriesInViewOrder,
} from './localCommandSelection';

export async function compareSelected(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;

  if (state.selectedEntries.size !== 2) {
    ui.showError('Select exactly two files to compare.');
    return;
  }

  const selected = getSelectedEntriesInViewOrder(state);
  if (selected.length !== 2) {
    ui.showError('Select exactly two files to compare.');
    return;
  }
  if (selected.some((entry) => entry.is_dir)) {
    ui.showError('File comparison is available for files, not folders.');
    return;
  }

  try {
    const comparison = await api.compareFiles(selected[0].path, selected[1].path);
    await ui.showFileComparison(comparison);
  } catch (error) {
    ui.showError(error);
  }
}

export async function deleteSelected(host: LocalCommandWorkflowHost) {
  const { state, api, ui, t } = host;
  if (state.selectedEntries.size === 0) return;

  let confirmed = true;
  if (state.settings.confirmDelete !== false) {
    const count = state.selectedEntries.size;
    confirmed = Boolean(await ui.showModal(
      t('delete_title'),
      `<p>${t('delete_confirm', { count })}</p>`,
      t('delete_title'),
      true,
    ));
  }

  if (!confirmed) return;

  try {
    await api.moveToTrash([...state.selectedEntries]);
    ui.showSuccess(t('items_deleted'));
    await host.refresh();
  } catch (error) {
    if (typeof error === 'string' && error.startsWith('TRASH_UNAVAILABLE')) {
      const count = state.selectedEntries.size;
      const fallback = await ui.showModal(
        t('trash_unavailable_title'),
        `<p>${t('trash_unavailable_confirm', { count })}</p>`,
        t('permanently_delete'),
        true,
      );

      if (fallback) {
        try {
          for (const path of state.selectedEntries) {
            await api.deleteEntry(path);
          }
          ui.showSuccess(t('items_deleted'));
          await host.refresh();
        } catch (deleteError) {
          ui.showError(deleteError);
        }
      }
      return;
    }

    ui.showError(error);
  }
}

export async function renameSelected(host: LocalCommandWorkflowHost) {
  const { state, api, ui, t } = host;

  if (state.selectedEntries.size !== 1) return;

  const path = firstSelectedPath(state);
  if (!path) return;

  const entry = state.entries.find((candidate) => candidate.path === path);
  if (!entry) return;

  const result = await ui.showModal(
    t('rename_title'),
    `<input type="text" id="rename-input" value="${host.escapeHtml(entry.name)}" class="input-full">`,
    t('rename_title'),
    true,
  );
  const newName = modalText(result);

  if (newName && newName !== entry.name && host.isValidFileName(newName)) {
    try {
      const newPath = await api.renameEntry(path, newName);
      host.pushUndoEntry({
        description: `Rename "${entry.name}" \u2192 "${newName}"`,
        undo: async () => { await api.renameEntry(newPath, entry.name); },
        redo: async () => { await api.renameEntry(path, newName); },
      });
      ui.showUndoableSuccess(t('renamed_successfully'), () => host.undo());
      await host.refresh();
    } catch (error) {
      ui.showError(error);
    }
  }
}

export async function packIntoFolder(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;
  if (state.selectedEntries.size === 0) return;

  const count = state.selectedEntries.size;
  const result = await ui.showModal(
    'Pack into Folder',
    `<p class="mb-md">Move ${count} item(s) into a new folder:</p>
             <input type="text" class="form-input input-full" id="pack-folder-name" value="New Folder">`,
    'Pack',
    true,
  );
  const folderName = modalText(result);

  if (!folderName || !host.isValidFileName(folderName)) return;

  const destDir = host.joinPath(state.currentPath, folderName);
  try {
    await api.createDirectory(state.currentPath, folderName);
    for (const sourcePath of state.selectedEntries) {
      await api.moveEntry(sourcePath, destDir);
    }
    ui.showSuccess(`Packed ${count} item(s) into "${folderName}"`);
    await host.refresh();
  } catch (error) {
    ui.showError(error);
    await host.refresh();
  }
}

export async function unpackFolder(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;
  const selectedDirs = getSelectedDirectoryPathsInFilteredView(state);

  if (selectedDirs.length === 0) {
    ui.showError('Select one or more folders to unpack.');
    return;
  }

  const confirmed = await ui.showModal(
    'Unpack Folder Here',
    `<p>Move the contents of ${selectedDirs.length} folder(s) into the current directory, then remove the folder(s)?</p>`,
    'Unpack',
    true,
  );
  if (!confirmed) return;

  try {
    for (const dirPath of selectedDirs) {
      const listing = await api.listDirectory(dirPath);
      for (const entry of listing.entries) {
        await api.moveEntry(entry.path, state.currentPath);
      }
      await api.moveToTrash([dirPath]);
    }
    ui.showSuccess(`Unpacked ${selectedDirs.length} folder(s)`);
    await host.refresh();
  } catch (error) {
    ui.showError(error);
    await host.refresh();
  }
}

export async function createFolder(host: LocalCommandWorkflowHost) {
  const { state, api, ui, t } = host;
  const result = await ui.showModal(
    t('new_folder_title'),
    `<input type="text" id="folder-name" placeholder="${t('new_folder_placeholder')}" class="input-full">`,
    t('create'),
    true,
  );
  const name = modalText(result);

  if (name && host.isValidFileName(name)) {
    try {
      const newPath = await api.createDirectory(state.currentPath, name);
      host.pushUndoEntry({
        description: `Create folder "${name}"`,
        undo: async () => { await api.moveToTrash([newPath]); },
        redo: async () => { await api.createDirectory(state.currentPath, name); },
      });
      ui.showUndoableSuccess(t('folder_created'), () => host.undo());
      await host.refresh();
    } catch (error) {
      ui.showError(error);
    }
  }
}

export async function createFile(host: LocalCommandWorkflowHost) {
  const { state, api, ui, t } = host;
  const result = await ui.showModal(
    t('new_file_title'),
    `<input type="text" id="file-name" placeholder="${t('new_file_placeholder')}" class="input-full">`,
    t('create'),
    true,
  );
  const name = modalText(result);

  if (name && host.isValidFileName(name)) {
    try {
      const newPath = await api.createFile(state.currentPath, name);
      host.pushUndoEntry({
        description: `Create file "${name}"`,
        undo: async () => { await api.moveToTrash([newPath]); },
        redo: async () => { await api.createFile(state.currentPath, name); },
      });
      ui.showUndoableSuccess(t('file_created'), () => host.undo());
      await host.refresh();
    } catch (error) {
      ui.showError(error);
    }
  }
}
