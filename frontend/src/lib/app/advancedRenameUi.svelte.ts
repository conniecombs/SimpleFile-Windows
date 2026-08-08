import type {
  AdvancedRenamePreviewMode,
  AdvancedRenamePreviewRow,
} from '../components/advanced-rename-preview/AdvancedRenamePreview.svelte';

export type AdvancedRenamePreviewState = {
  extraCount: number;
  limit: number;
  message: string;
  mode: AdvancedRenamePreviewMode;
  rows: AdvancedRenamePreviewRow[];
  totalRows: number;
};

export type AdvancedRenameFormState = {
  addEnabled: boolean;
  addIndex: string;
  addPosition: string;
  addString: string;
  applyPart: string;
  capitalizeEnabled: boolean;
  capitalizeMode: string;
  extensionCustom: string;
  extensionEnabled: boolean;
  extensionMode: string;
  filterCase: boolean;
  filterEnabled: boolean;
  filterExtensions: string;
  filterInvert: boolean;
  filterRegex: boolean;
  filterText: string;
  numberEnabled: boolean;
  numberPad: string;
  numberPosition: string;
  numberSeparator: string;
  numberStart: string;
  numberStep: string;
  removeCase: boolean;
  removeEnabled: boolean;
  removeRegex: boolean;
  removeString: string;
  replaceCase: boolean;
  replaceEnabled: boolean;
  replaceFind: string;
  replaceRegex: boolean;
  replaceWith: string;
  sanitizeEnabled: boolean;
  sanitizeReplacement: string;
  scopeHidden: boolean;
  scopeRecursive: boolean;
  separatorCollapse: boolean;
  separatorEnabled: boolean;
  separatorMode: string;
  templateEnabled: boolean;
  templateKeepExt: boolean;
  templatePattern: string;
  trimCollapse: boolean;
  trimEnabled: boolean;
  trimMode: string;
};

export type AdvancedRenameUiState = {
  form: AdvancedRenameFormState;
  preview: AdvancedRenamePreviewState;
  summary: string;
  visible: boolean;
};

export function createDefaultAdvancedRenameForm(): AdvancedRenameFormState {
  return {
    addEnabled: false,
    addIndex: '1',
    addPosition: 'prefix',
    addString: '',
    applyPart: 'full',
    capitalizeEnabled: false,
    capitalizeMode: 'first',
    extensionCustom: '',
    extensionEnabled: false,
    extensionMode: 'lower',
    filterCase: false,
    filterEnabled: false,
    filterExtensions: '',
    filterInvert: false,
    filterRegex: false,
    filterText: '',
    numberEnabled: false,
    numberPad: '3',
    numberPosition: 'suffix',
    numberSeparator: '_',
    numberStart: '1',
    numberStep: '1',
    removeCase: false,
    removeEnabled: false,
    removeRegex: false,
    removeString: '',
    replaceCase: false,
    replaceEnabled: false,
    replaceFind: '',
    replaceRegex: false,
    replaceWith: '',
    sanitizeEnabled: true,
    sanitizeReplacement: '_',
    scopeHidden: false,
    scopeRecursive: false,
    separatorCollapse: true,
    separatorEnabled: false,
    separatorMode: 'spaces-to-dashes',
    templateEnabled: false,
    templateKeepExt: true,
    templatePattern: '{base}_{n}',
    trimCollapse: false,
    trimEnabled: false,
    trimMode: 'both',
  };
}

const emptyPreview = (): AdvancedRenamePreviewState => ({
  extraCount: 0,
  limit: 500,
  message: '',
  mode: 'empty',
  rows: [],
  totalRows: 0,
});

export const advancedRenameUi = $state<AdvancedRenameUiState>({
  form: createDefaultAdvancedRenameForm(),
  preview: emptyPreview(),
  summary: '',
  visible: false,
});

export function isAdvancedRenameVisible() {
  return advancedRenameUi.visible;
}

export function openAdvancedRenameUi() {
  advancedRenameUi.form = createDefaultAdvancedRenameForm();
  advancedRenameUi.visible = true;
  advancedRenameUi.summary = 'Building preview…';
  advancedRenameUi.preview = {
    extraCount: 0,
    limit: 500,
    message: 'Building preview…',
    mode: 'loading',
    rows: [],
    totalRows: 0,
  };
}

export function closeAdvancedRenameUi() {
  advancedRenameUi.visible = false;
  advancedRenameUi.summary = '';
  advancedRenameUi.form = createDefaultAdvancedRenameForm();
  advancedRenameUi.preview = emptyPreview();
}

export function setAdvancedRenamePreview(preview: Partial<AdvancedRenamePreviewState> & { mode: AdvancedRenamePreviewMode }) {
  advancedRenameUi.preview = {
    ...advancedRenameUi.preview,
    ...preview,
    rows: preview.rows ?? advancedRenameUi.preview.rows,
  };
}

export function setAdvancedRenameSummary(summary: string) {
  advancedRenameUi.summary = summary;
}

/** Form field helpers used by rename plan generation (no DOM reads). */
export function formChecked(key: keyof AdvancedRenameFormState) {
  return Boolean(advancedRenameUi.form[key]);
}

export function formString(key: keyof AdvancedRenameFormState, fallback = '') {
  const value = advancedRenameUi.form[key];
  if (value == null) return fallback;
  // Number inputs may bind as numbers; coerce consistently for plan builders.
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
