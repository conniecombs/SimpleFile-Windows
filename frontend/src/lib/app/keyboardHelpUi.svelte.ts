export type KeyboardHelpRow = {
  action: string;
  shortcut: string;
};

export type KeyboardHelpSection = {
  rows: KeyboardHelpRow[];
  title: string;
};

export type KeyboardHelpUiState = {
  sections: KeyboardHelpSection[];
  visible: boolean;
};

export const keyboardHelpUi = $state<KeyboardHelpUiState>({
  sections: [],
  visible: false,
});

export function isKeyboardHelpVisible() {
  return keyboardHelpUi.visible;
}

export function openKeyboardHelpUi(sections: KeyboardHelpSection[]) {
  keyboardHelpUi.sections = sections;
  keyboardHelpUi.visible = true;
}

export function closeKeyboardHelpUi() {
  keyboardHelpUi.visible = false;
  keyboardHelpUi.sections = [];
}
