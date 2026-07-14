import type { FileEntry, PathString, SearchOptions, SearchResult } from './types';

export type SearchWorkflowOptions = {
  caseSensitive?: boolean;
  contentSearch?: boolean;
  dateAfter?: string | null;
  dateBefore?: string | null;
  fileTypes?: string[];
  includeHidden?: boolean;
  maxDepth?: number | null;
  maxResults?: number | null;
  maxSize?: number | null;
  minSize?: number | null;
  searchPath?: PathString;
};

export function parseOptionalNumber(value: unknown) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function mbToBytes(value: unknown) {
  const parsed = parseOptionalNumber(value);
  return parsed === null ? null : Math.round(parsed * 1024 * 1024);
}

export function dateToSearchTimestamp(value: unknown, endOfDay = false) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;

  return endOfDay ? `${cleaned}T23:59:59` : `${cleaned}T00:00:00`;
}

function normalizeFileTypes(value: unknown) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

export function readAdvancedSearchOptions(documentRef: Document): SearchWorkflowOptions {
  const getInput = (id: string) => documentRef.getElementById(id) as HTMLInputElement | null;

  return {
    contentSearch: getInput('advanced-search-content')?.checked || false,
    caseSensitive: getInput('advanced-search-case')?.checked || false,
    includeHidden: getInput('advanced-search-hidden')?.checked || false,
    fileTypes: normalizeFileTypes(getInput('advanced-search-types')?.value),
    minSize: mbToBytes(getInput('advanced-search-min-size')?.value),
    maxSize: mbToBytes(getInput('advanced-search-max-size')?.value),
    dateAfter: dateToSearchTimestamp(getInput('advanced-search-after')?.value, false),
    dateBefore: dateToSearchTimestamp(getInput('advanced-search-before')?.value, true),
    maxDepth: parseOptionalNumber(getInput('advanced-search-depth')?.value) || 10,
    maxResults: parseOptionalNumber(getInput('advanced-search-results')?.value) || 500,
  };
}

export function toSearchCommandOptions({
  currentPath,
  options,
  query,
  searchId,
  showHiddenFiles,
}: {
  currentPath: PathString;
  options: SearchWorkflowOptions;
  query: string;
  searchId?: string;
  showHiddenFiles: boolean;
}): SearchOptions {
  const commandOptions: SearchOptions = {
    query,
    search_path: options.searchPath || currentPath,
    case_sensitive: !!options.caseSensitive,
    include_hidden: options.includeHidden ?? showHiddenFiles,
    content_search: !!options.contentSearch,
    file_types: options.fileTypes?.length ? options.fileTypes : null,
    min_size: options.minSize ?? null,
    max_size: options.maxSize ?? null,
    date_after: options.dateAfter || null,
    date_before: options.dateBefore || null,
    max_results: options.maxResults || 500,
    max_depth: options.maxDepth || 10,
  };

  if (searchId) {
    commandOptions.search_id = searchId;
  }

  return commandOptions;
}

export function searchResultToFileEntry(result: SearchResult): FileEntry {
  return {
    name: result.name,
    path: result.path,
    is_dir: result.is_dir,
    is_symlink: false,
    size: result.size,
    modified: result.modified,
    extension: result.extension || '',
  };
}
