<script lang="ts">
  import {
    advancedRenameUi,
    closeAdvancedRenameUi,
  } from '../app/advancedRenameUi.svelte';
  import AdvancedRenamePreview from './advanced-rename-preview/AdvancedRenamePreview.svelte';

  const form = $derived(advancedRenameUi.form);

  function emitClose() {
    document.dispatchEvent(new CustomEvent('simplefile:advanced-rename-close', { bubbles: true }));
    closeAdvancedRenameUi();
  }

  function emitConfirm() {
    document.dispatchEvent(new CustomEvent('simplefile:advanced-rename-confirm', { bubbles: true }));
  }

  function handleControlInput() {
    document.dispatchEvent(new CustomEvent('simplefile:advanced-rename-input', { bubbles: true }));
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) emitClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!advancedRenameUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      emitClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<div
  class="modal-overlay"
  class:visible={advancedRenameUi.visible}
  id="advanced-rename-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="adv-rename-heading"
  aria-hidden={!advancedRenameUi.visible}
  onmousedown={handleOverlayMouseDown}
  oninput={handleControlInput}
  onchange={handleControlInput}
>
  <div class="modal advanced-rename-modal">
    <div class="modal-header">
      <h3 id="adv-rename-heading">Advanced Rename</h3>
      <button type="button" class="modal-close" id="adv-rename-close" aria-label="Close advanced rename" onclick={emitClose}>&times;</button>
    </div>
    <div class="modal-body adv-rename-body">
      <div class="adv-rename-options-column">
        <p class="adv-rename-summary" id="adv-rename-summary">{advancedRenameUi.summary}</p>
        <div class="adv-rename-scope">
          <label class="adv-inline-check">
            <input type="checkbox" id="adv-scope-recursive" bind:checked={advancedRenameUi.form.scopeRecursive}>
            Include files inside selected folders
          </label>
          <label class="adv-inline-check">
            <input type="checkbox" id="adv-scope-hidden" bind:checked={advancedRenameUi.form.scopeHidden}>
            Include dotfiles
          </label>
          <label for="adv-apply-part">Apply text ops to:</label>
          <select class="form-input" id="adv-apply-part" bind:value={advancedRenameUi.form.applyPart}>
            <option value="full">Full name</option>
            <option value="base">Name without extension</option>
            <option value="extension">Extension only</option>
          </select>
        </div>
        <div class="adv-rename-ops">

          <div class="adv-rename-op" id="adv-op-filter" class:op-enabled={form.filterEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-filter-enabled" bind:checked={advancedRenameUi.form.filterEnabled}>
              <span class="adv-op-label">Filter Targets</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-filter-text">Name:</label>
                <input type="text" class="form-input" id="adv-filter-text" placeholder="Only names matching" bind:value={advancedRenameUi.form.filterText}>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-filter-regex" bind:checked={advancedRenameUi.form.filterRegex}> Regex
                </label>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-filter-case" bind:checked={advancedRenameUi.form.filterCase}> Case sensitive
                </label>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-filter-invert" bind:checked={advancedRenameUi.form.filterInvert}> Invert
                </label>
              </div>
              <div class="adv-field-row">
                <label for="adv-filter-extensions">Extensions:</label>
                <input type="text" class="form-input" id="adv-filter-extensions" placeholder="jpg, png, md" bind:value={advancedRenameUi.form.filterExtensions}>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-template" class:op-enabled={form.templateEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-template-enabled" bind:checked={advancedRenameUi.form.templateEnabled}>
              <span class="adv-op-label">Template</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-template-pattern">Pattern:</label>
                <input type="text" class="form-input" id="adv-template-pattern" placeholder={'{base}_{n}'} bind:value={advancedRenameUi.form.templatePattern}>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-template-keep-ext" bind:checked={advancedRenameUi.form.templateKeepExt}> Keep extension
                </label>
              </div>
              <div class="adv-template-help">
                <p><strong>Available Variables:</strong></p>
                <ul class="adv-template-vars">
                  <li><code>{'{base}'}</code>: Original file name without extension</li>
                  <li><code>{'{ext}'}</code>: Original file extension</li>
                  <li><code>{'{name}'}</code>: Full original file name</li>
                  <li><code>{'{parent}'}</code>: Parent folder name</li>
                  <li><code>{'{n}'}</code>: Sequence number (from 'Sequential Numbering' section)</li>
                  <li><code>{'{yyyy}'}</code>, <code>{'{mm}'}</code>, <code>{'{dd}'}</code>: Current Year, Month, Day</li>
                  <li><code>{'{hh}'}</code>, <code>{'{min}'}</code>, <code>{'{ss}'}</code>: Current Hour, Minute, Second</li>
                  <li><code>{'{date}'}</code>, <code>{'{time}'}</code>: Current date (YYYY-MM-DD) and time (HHMMSS)</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-remove" class:op-enabled={form.removeEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-remove-enabled" bind:checked={advancedRenameUi.form.removeEnabled}>
              <span class="adv-op-label">Remove String</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-remove-string">Remove:</label>
                <input type="text" class="form-input" id="adv-remove-string" placeholder="Text to remove" bind:value={advancedRenameUi.form.removeString}>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-remove-regex" bind:checked={advancedRenameUi.form.removeRegex}> Regex
                </label>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-remove-case" bind:checked={advancedRenameUi.form.removeCase}> Case sensitive
                </label>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-replace" class:op-enabled={form.replaceEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-replace-enabled" bind:checked={advancedRenameUi.form.replaceEnabled}>
              <span class="adv-op-label">Replace String</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-replace-find">Find:</label>
                <input type="text" class="form-input" id="adv-replace-find" placeholder="Find text" bind:value={advancedRenameUi.form.replaceFind}>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-replace-regex" bind:checked={advancedRenameUi.form.replaceRegex}> Regex
                </label>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-replace-case" bind:checked={advancedRenameUi.form.replaceCase}> Case sensitive
                </label>
              </div>
              <div class="adv-field-row">
                <label for="adv-replace-with">Replace:</label>
                <input type="text" class="form-input" id="adv-replace-with" placeholder="Replace with (empty = delete)" bind:value={advancedRenameUi.form.replaceWith}>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-trim" class:op-enabled={form.trimEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-trim-enabled" bind:checked={advancedRenameUi.form.trimEnabled}>
              <span class="adv-op-label">Trim Whitespace</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-trim-mode">Mode:</label>
                <select class="form-input" id="adv-trim-mode" bind:value={advancedRenameUi.form.trimMode}>
                  <option value="both">Start and end</option>
                  <option value="start">Start only</option>
                  <option value="end">End only</option>
                </select>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-trim-collapse" bind:checked={advancedRenameUi.form.trimCollapse}> Collapse spaces
                </label>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-add" class:op-enabled={form.addEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-add-enabled" bind:checked={advancedRenameUi.form.addEnabled}>
              <span class="adv-op-label">Add String</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-add-string">Insert:</label>
                <input type="text" class="form-input" id="adv-add-string" placeholder="Text to add" bind:value={advancedRenameUi.form.addString}>
                <label for="adv-add-position">Position:</label>
                <select class="form-input" id="adv-add-position" bind:value={advancedRenameUi.form.addPosition}>
                  <option value="prefix">Before name</option>
                  <option value="suffix">After name</option>
                  <option value="before-ext">Before extension</option>
                  <option value="index">At character</option>
                </select>
                <label for="adv-add-index">Index:</label>
                <input type="number" class="form-input adv-number-input" id="adv-add-index" min="0" step="1" bind:value={advancedRenameUi.form.addIndex}>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-capitalize" class:op-enabled={form.capitalizeEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-capitalize-enabled" bind:checked={advancedRenameUi.form.capitalizeEnabled}>
              <span class="adv-op-label">Capitalize</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-capitalize-mode">Mode:</label>
                <select class="form-input" id="adv-capitalize-mode" bind:value={advancedRenameUi.form.capitalizeMode}>
                  <option value="first">Capitalize first letter</option>
                  <option value="words">Capitalize each word</option>
                  <option value="title">Title Case</option>
                  <option value="sentence">Sentence case</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                </select>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-separator" class:op-enabled={form.separatorEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-separator-enabled" bind:checked={advancedRenameUi.form.separatorEnabled}>
              <span class="adv-op-label">Separators</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-separator-mode">Convert:</label>
                <select class="form-input" id="adv-separator-mode" bind:value={advancedRenameUi.form.separatorMode}>
                  <option value="spaces-to-dashes">Spaces to dashes</option>
                  <option value="spaces-to-underscores">Spaces to underscores</option>
                  <option value="underscores-to-spaces">Underscores to spaces</option>
                  <option value="dashes-to-spaces">Dashes to spaces</option>
                  <option value="dots-to-spaces">Dots to spaces</option>
                </select>
                <label class="adv-inline-check">
                  <input type="checkbox" id="adv-separator-collapse" bind:checked={advancedRenameUi.form.separatorCollapse}> Collapse repeats
                </label>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-number" class:op-enabled={form.numberEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-number-enabled" bind:checked={advancedRenameUi.form.numberEnabled}>
              <span class="adv-op-label">Sequential Numbering</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-number-start">Start:</label>
                <input type="number" class="form-input adv-number-input" id="adv-number-start" min="0" step="1" bind:value={advancedRenameUi.form.numberStart}>
                <label for="adv-number-step">Step:</label>
                <input type="number" class="form-input adv-number-input" id="adv-number-step" min="1" step="1" bind:value={advancedRenameUi.form.numberStep}>
                <label for="adv-number-pad">Digits:</label>
                <input type="number" class="form-input adv-number-input" id="adv-number-pad" min="1" max="10" step="1" bind:value={advancedRenameUi.form.numberPad}>
              </div>
              <div class="adv-field-row">
                <label for="adv-number-position">Position:</label>
                <select class="form-input" id="adv-number-position" bind:value={advancedRenameUi.form.numberPosition}>
                  <option value="prefix">Before name</option>
                  <option value="suffix">After name</option>
                  <option value="before-ext">Before extension</option>
                  <option value="replace">Replace name</option>
                </select>
                <label for="adv-number-separator">Separator:</label>
                <input type="text" class="form-input adv-number-input" id="adv-number-separator" maxlength="8" placeholder="_" bind:value={advancedRenameUi.form.numberSeparator}>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-extension" class:op-enabled={form.extensionEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-extension-enabled" bind:checked={advancedRenameUi.form.extensionEnabled}>
              <span class="adv-op-label">Extension</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-extension-mode">Mode:</label>
                <select class="form-input" id="adv-extension-mode" bind:value={advancedRenameUi.form.extensionMode}>
                  <option value="lower">lowercase</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="set">Set to</option>
                  <option value="remove">Remove</option>
                </select>
                <label for="adv-extension-custom">Value:</label>
                <input type="text" class="form-input adv-extension-input" id="adv-extension-custom" placeholder="txt" bind:value={advancedRenameUi.form.extensionCustom}>
              </div>
            </div>
          </div>

          <div class="adv-rename-op" id="adv-op-sanitize" class:op-enabled={form.sanitizeEnabled}>
            <label class="adv-op-toggle">
              <input type="checkbox" id="adv-sanitize-enabled" bind:checked={advancedRenameUi.form.sanitizeEnabled}>
              <span class="adv-op-label">Sanitize Invalid Characters</span>
            </label>
            <div class="adv-op-body">
              <div class="adv-field-row">
                <label for="adv-sanitize-replacement">Replace with:</label>
                <input type="text" class="form-input adv-number-input" id="adv-sanitize-replacement" maxlength="8" bind:value={advancedRenameUi.form.sanitizeReplacement}>
              </div>
            </div>
          </div>

        </div>
      </div>
      <div class="adv-rename-preview-column">
        <div class="adv-rename-preview-section">
          <h4 class="adv-rename-preview-title">Preview</h4>
          <div class="adv-rename-preview" id="adv-rename-preview">
            <AdvancedRenamePreview
              mode={advancedRenameUi.preview.mode}
              message={advancedRenameUi.preview.message}
              rows={advancedRenameUi.preview.rows}
              extraCount={advancedRenameUi.preview.extraCount}
              limit={advancedRenameUi.preview.limit}
              totalRows={advancedRenameUi.preview.totalRows}
            />
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" id="adv-rename-cancel" onclick={emitClose}>Cancel</button>
      <button type="button" class="btn btn-primary" id="adv-rename-confirm" onclick={emitConfirm}>Rename</button>
    </div>
  </div>
</div>
