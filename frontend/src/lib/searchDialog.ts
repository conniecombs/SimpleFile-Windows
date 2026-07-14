export type AdvancedSearchDialogProps = {
  escapeHtml: (value: unknown) => string;
  includeHidden: boolean;
  initialQuery: string;
  recentSearches: string[];
};

export function renderAdvancedSearchDialog({
  escapeHtml,
  includeHidden,
  initialQuery,
  recentSearches,
}: AdvancedSearchDialogProps) {
  const datalist = recentSearches
    .map((query) => `<option value="${escapeHtml(query)}"></option>`)
    .join('');

  return `
            <div class="advanced-search-form">
                <p class="settings-section-hint">Search the current folder with optional content, size, date, and file-type filters.</p>
                <label class="form-label">Query</label>
                <input type="text" id="advanced-search-query" list="advanced-search-recent" class="input-full" value="${escapeHtml(initialQuery)}" autocomplete="off">
                <datalist id="advanced-search-recent">${datalist}</datalist>
                <div class="settings-row"><label>Search file contents</label><input type="checkbox" id="advanced-search-content"></div>
                <div class="settings-row"><label>Case sensitive</label><input type="checkbox" id="advanced-search-case"></div>
                <div class="settings-row"><label>Include hidden files</label><input type="checkbox" id="advanced-search-hidden" ${includeHidden ? 'checked' : ''}></div>
                <div class="settings-row"><label>File extensions</label><input type="text" id="advanced-search-types" placeholder="jpg,png,txt" class="input-full"></div>
                <div class="settings-row"><label>Minimum size (MB)</label><input type="number" min="0" step="0.1" id="advanced-search-min-size" class="input-full"></div>
                <div class="settings-row"><label>Maximum size (MB)</label><input type="number" min="0" step="0.1" id="advanced-search-max-size" class="input-full"></div>
                <div class="settings-row"><label>Modified after</label><input type="date" id="advanced-search-after" class="input-full"></div>
                <div class="settings-row"><label>Modified before</label><input type="date" id="advanced-search-before" class="input-full"></div>
                <div class="settings-row"><label>Max depth</label><input type="number" min="1" max="100" id="advanced-search-depth" class="input-full" value="10"></div>
                <div class="settings-row"><label>Max results</label><input type="number" min="1" max="10000" id="advanced-search-results" class="input-full" value="500"></div>
            </div>`;
}
