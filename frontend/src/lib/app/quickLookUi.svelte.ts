import type { PathString } from '../types';
import type {
  QuickLookFolderSummary,
  QuickLookPreview,
} from '../components/quick-look/QuickLookModal.svelte';

export type QuickLookUiState = {
  folder: QuickLookFolderSummary | null;
  info: string;
  isFolder: boolean;
  openLabel: string;
  path: PathString | null;
  preview: QuickLookPreview | null;
  title: string;
  visible: boolean;
};

export const quickLookUi = $state<QuickLookUiState>({
  folder: null,
  info: '',
  isFolder: false,
  openLabel: 'Open with Default App',
  path: null,
  preview: null,
  title: 'Preview',
  visible: false,
});

export function isQuickLookVisible() {
  return quickLookUi.visible;
}

export function openQuickLookUi(options: {
  folder?: QuickLookFolderSummary | null;
  info?: string;
  isFolder?: boolean;
  openLabel?: string;
  path: PathString;
  preview: QuickLookPreview | null;
  title: string;
}) {
  quickLookUi.folder = options.folder || null;
  quickLookUi.isFolder = options.isFolder || false;
  quickLookUi.openLabel = options.openLabel || 'Open with Default App';
  quickLookUi.path = options.path;
  quickLookUi.preview = options.preview;
  quickLookUi.title = options.title;
  quickLookUi.info = options.info || '';
  quickLookUi.visible = true;
}

export function patchQuickLookFolder(updates: Partial<QuickLookFolderSummary>) {
  if (!quickLookUi.folder) return null;
  quickLookUi.folder = {
    ...quickLookUi.folder,
    ...updates,
  };
  return quickLookUi.folder;
}

export function updateQuickLookInfo(info: string) {
  quickLookUi.info = info;
}

export function closeQuickLookUi() {
  quickLookUi.visible = false;
  quickLookUi.folder = null;
  quickLookUi.isFolder = false;
  quickLookUi.openLabel = 'Open with Default App';
  quickLookUi.path = null;
  quickLookUi.preview = null;
  quickLookUi.title = 'Preview';
  quickLookUi.info = '';
}
