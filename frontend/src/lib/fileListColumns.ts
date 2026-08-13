import type { ColumnId, ColumnPresetId } from './types';

export type FileListColumnId = 'name' | ColumnId;

export type FileListColumnDefinition = {
  id: FileListColumnId;
  label: string;
  maxWidth?: number;
  minWidth?: number;
  sort: string;
  width: number;
};

type FileListColumnSettings = {
  columnWidths?: Partial<Record<FileListColumnId, number>>;
};

export const FILE_LIST_COLUMN_DEFINITIONS: Record<FileListColumnId, FileListColumnDefinition> = {
  name: { id: 'name', label: 'Name', maxWidth: 720, minWidth: 120, sort: 'name', width: 240 },
  size: { id: 'size', label: 'Size', maxWidth: 220, minWidth: 72, sort: 'size', width: 100 },
  items: { id: 'items', label: 'Items', maxWidth: 180, minWidth: 72, sort: 'items', width: 90 },
  date: { id: 'date', label: 'Modified', maxWidth: 260, minWidth: 112, sort: 'modified', width: 140 },
  type: { id: 'type', label: 'Type', maxWidth: 260, minWidth: 84, sort: 'type', width: 100 },
  extension: { id: 'extension', label: 'Extension', maxWidth: 180, minWidth: 88, sort: 'extension', width: 96 },
  git: { id: 'git', label: 'Git State', maxWidth: 220, minWidth: 92, sort: 'git', width: 110 },
  path: { id: 'path', label: 'Path', maxWidth: 880, minWidth: 160, sort: 'path', width: 260 },
  parent: { id: 'parent', label: 'Parent', maxWidth: 520, minWidth: 120, sort: 'parent', width: 180 },
  symlink: { id: 'symlink', label: 'Link Target', maxWidth: 760, minWidth: 140, sort: 'symlink', width: 220 },
};

export const OPTIONAL_FILE_LIST_COLUMNS: ColumnId[] = [
  'size',
  'items',
  'date',
  'type',
  'extension',
  'git',
  'path',
  'parent',
  'symlink',
];

export const DEFAULT_VISIBLE_FILE_LIST_COLUMNS: ColumnId[] = ['size', 'date', 'type'];

export const FILE_LIST_HEADER_QUICK_COLUMNS: ColumnId[] = ['size', 'date', 'type', 'items', 'extension'];

export const FILE_LIST_COLUMN_PRESETS = {
  default: DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
  details: ['size', 'items', 'date', 'type', 'extension'],
  media: ['size', 'date', 'extension', 'type'],
  developer: ['size', 'date', 'extension', 'git', 'symlink', 'path'],
  photo: ['date', 'size', 'extension', 'type'],
} satisfies Record<Exclude<ColumnPresetId, 'custom'>, ColumnId[]>;

export const FILE_LIST_COLUMN_PRESET_LABELS: Record<ColumnPresetId, string> = {
  default: 'Default',
  details: 'Details',
  media: 'Media',
  developer: 'Developer',
  photo: 'Photo',
  custom: 'Custom',
};

export const DEFAULT_FILE_LIST_COLUMN_WIDTHS = Object.fromEntries(
  Object.values(FILE_LIST_COLUMN_DEFINITIONS).map((column) => [column.id, column.width]),
) as Record<FileListColumnId, number>;

export function isColumnId(value: unknown): value is ColumnId {
  return OPTIONAL_FILE_LIST_COLUMNS.includes(value as ColumnId);
}

export function isColumnPresetId(value: unknown): value is ColumnPresetId {
  return value === 'custom' || Object.hasOwn(FILE_LIST_COLUMN_PRESETS, String(value));
}

export function columnsForPreset(preset: ColumnPresetId | string | undefined): ColumnId[] {
  if (preset && preset !== 'custom' && Object.hasOwn(FILE_LIST_COLUMN_PRESETS, preset)) {
    return [...FILE_LIST_COLUMN_PRESETS[preset as Exclude<ColumnPresetId, 'custom'>]];
  }
  return [...DEFAULT_VISIBLE_FILE_LIST_COLUMNS];
}

export function normalizeVisibleColumns(
  value: unknown,
  fallback: readonly ColumnId[] = DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
) {
  const source = Array.isArray(value) ? value : fallback;
  const columns = source.filter(isColumnId);
  const uniqueColumns = [...new Set(columns)];
  return uniqueColumns.length > 0 ? uniqueColumns : [...fallback];
}

export function orderedOptionalColumns(visibleColumns: readonly ColumnId[]) {
  const visible = normalizeVisibleColumns(visibleColumns);
  return [
    ...visible,
    ...OPTIONAL_FILE_LIST_COLUMNS.filter((column) => !visible.includes(column)),
  ];
}

export function columnDefinition(column: FileListColumnId) {
  return FILE_LIST_COLUMN_DEFINITIONS[column];
}

export function defaultFileListColumnWidth(column: FileListColumnId) {
  return columnDefinition(column).width;
}

export function clampFileListColumnWidth(column: FileListColumnId, value: unknown) {
  const definition = columnDefinition(column);
  const width = Number(value);
  if (!Number.isFinite(width)) {
    return definition.width;
  }

  const minWidth = definition.minWidth ?? 56;
  const maxWidth = definition.maxWidth ?? 800;
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

export function fileListColumnWidth(settings: FileListColumnSettings, column: FileListColumnId) {
  const width = Number(settings.columnWidths?.[column] || 0);
  return width > 0
    ? `${width}px`
    : `var(--col-${column}-width, ${columnDefinition(column).width}px)`;
}

export function buildFileListColumnsForIds(
  settings: FileListColumnSettings,
  columns: readonly FileListColumnId[],
) {
  return columns.map((column) => fileListColumnWidth(settings, column)).join(' ');
}

export function buildFileListColumns(
  settings: FileListColumnSettings,
  visibleColumns: readonly ColumnId[] = DEFAULT_VISIBLE_FILE_LIST_COLUMNS,
) {
  return buildFileListColumnsForIds(settings, ['name', ...normalizeVisibleColumns(visibleColumns)]);
}
