import type { SimpleFileAppState } from './appState';
import type { ClipboardAction, PathString } from './types';

export const MAX_CLIPBOARD_HISTORY = 10;

export function pushClipboardHistory(
  state: SimpleFileAppState,
  paths: PathString[],
  action: ClipboardAction,
) {
  const last = state.clipboardHistory[0];
  if (
    last
    && last.action === action
    && last.paths.length === paths.length
    && last.paths.every((path, index) => path === paths[index])
  ) {
    return;
  }

  state.clipboardHistory = [
    { paths: [...paths], action },
    ...state.clipboardHistory,
  ].slice(0, MAX_CLIPBOARD_HISTORY);
}
