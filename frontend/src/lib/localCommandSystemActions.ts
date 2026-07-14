import type { LocalCommandWorkflowHost } from './localCommandWorkflow';
import { firstSelectedPath } from './localCommandSelection';

export async function quickLook(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;

  if (state.selectedEntries.size !== 1) return;

  const path = firstSelectedPath(state);
  if (!path) return;

  const entry = state.entries.find((candidate) => candidate.path === path);
  if (!entry) return;

  try {
    const preview = await api.readFilePreview(path);
    ui.showQuickLook(entry, preview, null);
  } catch (error) {
    ui.showError(error);
  }
}

export async function openTerminal(host: LocalCommandWorkflowHost) {
  try {
    await host.api.openTerminal(host.state.currentPath);
  } catch (error) {
    host.ui.showError(error);
  }
}

export async function openTerminalInSelected(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;

  try {
    if (state.selectedEntries.size === 1) {
      const path = firstSelectedPath(state);
      const entry = path ? state.entries.find((candidate) => candidate.path === path) : null;
      if (entry?.is_dir) {
        await api.openTerminal(entry.path);
        return;
      }
    }

    await api.openTerminal(state.currentPath);
  } catch (error) {
    ui.showError(error);
  }
}

export async function openPowerShellAdminInSelected(host: LocalCommandWorkflowHost) {
  const { state, api, ui } = host;

  try {
    if (state.selectedEntries.size === 1) {
      const path = firstSelectedPath(state);
      const entry = path ? state.entries.find((candidate) => candidate.path === path) : null;
      if (entry?.is_dir) {
        await api.openPowerShellAdmin(entry.path);
        return;
      }
    }

    await api.openPowerShellAdmin(state.currentPath);
  } catch (error) {
    ui.showError(error);
  }
}
