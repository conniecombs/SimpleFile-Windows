import type { AppAboutInfo } from '../types';

export type AboutUiState = {
  info: AppAboutInfo | null;
  loading: boolean;
  visible: boolean;
};

export const aboutUi = $state<AboutUiState>({
  info: null,
  loading: false,
  visible: false,
});

export function isAboutVisible() {
  return aboutUi.visible;
}

export function openAboutUi(info: AppAboutInfo | null = null) {
  aboutUi.info = info;
  aboutUi.loading = info == null;
  aboutUi.visible = true;
}

export function setAboutInfo(info: AppAboutInfo) {
  aboutUi.info = info;
  aboutUi.loading = false;
}

export function closeAboutUi() {
  aboutUi.visible = false;
  aboutUi.loading = false;
  aboutUi.info = null;
}
