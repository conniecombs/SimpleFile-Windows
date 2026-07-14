import type { LocalCommandWorkflowHost } from './localCommandWorkflow';
import { modalText } from './localCommandDialogUtils';
import { findEntry, firstSelectedPath } from './localCommandSelection';
import { getOpenWithSuggestions, rememberOpenWithApplication } from './localCommandStorage';

export async function openWithSelected(host: LocalCommandWorkflowHost, storage: Storage | undefined) {
  const { state, api, ui } = host;

  if (state.selectedEntries.size !== 1) {
    ui.showError('Select exactly one file to open with another application.');
    return;
  }

  const path = firstSelectedPath(state);
  if (!path) return;

  const entry = findEntry(state, path);
  if (entry?.is_dir) {
    ui.showError('Open With is available for files, not folders.');
    return;
  }

  const suggestions = getOpenWithSuggestions(state, storage);
  const datalistOptions = suggestions
    .map((appName) => `<option value="${host.escapeHtml(appName)}"></option>`)
    .join('');
  const recentHint = suggestions.length > 0
    ? '<p class="settings-section-hint">Recent and common applications are available in the suggestions list.</p>'
    : '';
  const appName = await ui.showModal(
    'Open With',
    `<p class="mb-md">Choose an application to open <strong>${host.escapeHtml(host.getFileName(path))}</strong>.</p>
             ${recentHint}
             <input type="text" id="open-with-app-input" list="open-with-apps" class="input-full" placeholder="Application name or executable path" autocomplete="off">
             <datalist id="open-with-apps">${datalistOptions}</datalist>`,
    'Open',
    true,
  );
  const application = modalText(appName);
  if (!application) return;

  try {
    await api.openFileWith(path, application);
    rememberOpenWithApplication(storage, application);
    ui.showSuccess(`Opened with ${application}`);
  } catch (error) {
    ui.showError(error);
  }
}
