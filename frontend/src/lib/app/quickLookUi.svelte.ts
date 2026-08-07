import type { PathString } from '../types';
import type { QuickLookPreview } from '../components/quick-look/QuickLookModal.svelte';

export type QuickLookUiState = {
  info: string;
  path: PathString | null;
  preview: QuickLookPreview | null;
  title: string;
  visible: boolean;
};

export const quickLookUi = $state<QuickLookUiState>({
  info: '',
  path: null,
  preview: null,
  title: 'Preview',
  visible: false,
});

export function isQuickLookVisible() {
  return quickLookUi.visible;
}

export function openQuickLookUi(options: {
  info?: string;
  path: PathString;
  preview: QuickLookPreview | null;
  title: string;
}) {
  quickLookUi.path = options.path;
  quickLookUi.preview = options.preview;
  quickLookUi.title = options.title;
  quickLookUi.info = options.info || '';
  quickLookUi.visible = true;
}

export function closeQuickLookUi() {
  quickLookUi.visible = false;
  quickLookUi.path = null;
  quickLookUi.preview = null;
  quickLookUi.title = 'Preview';
  quickLookUi.info = '';
}
