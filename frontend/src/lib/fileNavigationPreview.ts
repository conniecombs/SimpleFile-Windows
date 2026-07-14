import type { FileNavigationActions, FileNavigationHost } from './fileNavigation';

export type PreviewPaneNavigationActions = Pick<
  FileNavigationActions,
  | 'togglePreviewPane'
  | 'updatePreviewPane'
>;

export function createPreviewPaneNavigationActions(
  host: FileNavigationHost,
): PreviewPaneNavigationActions {
  const { state } = host;
  let previewPaneToken = 0;

  const actions: PreviewPaneNavigationActions = {
    togglePreviewPane() {
      state.showPreviewPane = !state.showPreviewPane;
      host.setPreviewPaneVisible(state.showPreviewPane);

      if (state.showPreviewPane) {
        void actions.updatePreviewPane();
      } else {
        previewPaneToken += 1;
        host.clearPreviewPane();
      }
    },

    async updatePreviewPane() {
      if (!state.showPreviewPane) return;

      const token = ++previewPaneToken;

      if (state.selectedEntries.size !== 1) {
        host.renderPreviewPane({ mode: 'empty' });
        return;
      }

      const path = state.selectedEntries.values().next().value;
      if (!path) {
        host.renderPreviewPane({ mode: 'empty' });
        return;
      }

      const entry = state.entries.find((candidate) => candidate.path === path)
        || state.filteredEntries.find((candidate) => candidate.path === path);

      if (!entry) {
        host.renderPreviewPane({ mode: 'empty' });
        return;
      }

      if (entry.is_dir) {
        host.renderPreviewPane({ mode: 'folder', entry });
        return;
      }

      host.renderPreviewPane({ mode: 'loading', entry });

      try {
        const preview = await host.readFilePreview(path);
        if (token !== previewPaneToken || !state.showPreviewPane) return;
        host.renderPreviewPane({ mode: 'preview', entry, preview });
      } catch (error) {
        if (token !== previewPaneToken || !state.showPreviewPane) return;
        host.renderPreviewPane({
          mode: 'error',
          entry,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };

  return actions;
}
