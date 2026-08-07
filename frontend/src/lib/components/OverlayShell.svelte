<script lang="ts">
  import GenericModal from './GenericModal.svelte';
  import ProgressModal from './ProgressModal.svelte';
</script>

<!-- Native Svelte overlay shell. Progress + generic modal are component-owned state.
     Remaining overlays still expose stable IDs for DOM-based workflow controllers. -->
<div class="context-menu" id="context-menu" role="menu" aria-label="File actions">
        <button class="context-item" id="ctx-open" role="menuitem">Open</button>
        <button class="context-item" id="ctx-open-with" role="menuitem">Open With...</button>
        <button class="context-item" id="ctx-preview" role="menuitem">Quick Look</button>
        <button class="context-item" id="ctx-compare" role="menuitem" style="display: none;">Compare Files</button>
        <button class="context-item" id="ctx-terminal" role="menuitem">Open Terminal Here</button>
        <button class="context-item" id="ctx-powershell-admin" role="menuitem">Open PowerShell as Administrator</button>
        <hr class="context-divider">
        <button class="context-item" id="ctx-rename" role="menuitem">Rename</button>
        <button class="context-item" id="ctx-advanced-rename" role="menuitem">Advanced Rename...</button>
        <button class="context-item" id="ctx-copy" role="menuitem">Copy</button>
        <button class="context-item" id="ctx-cut" role="menuitem">Cut</button>
        <button class="context-item" id="ctx-paste" role="menuitem">Paste</button>
        <button class="context-item" id="ctx-copy-to-pane" role="menuitem" style="display: none;">Copy to Other Pane</button>
        <button class="context-item" id="ctx-move-to-pane" role="menuitem" style="display: none;">Move to Other Pane</button>
        <button class="context-item" id="ctx-pack" role="menuitem">Pack into Folder...</button>
        <button class="context-item" id="ctx-unpack" role="menuitem" style="display: none;">Unpack Folder Here</button>
        <hr class="context-divider">
        <button class="context-item" id="ctx-compress" role="menuitem">Compress...</button>
        <button class="context-item" id="ctx-extract" role="menuitem" style="display: none;">Extract Here</button>
        <button class="context-item" id="ctx-extract-to" role="menuitem" style="display: none;">Extract To...</button>
        <hr class="context-divider">
        <button class="context-item" id="ctx-delete" role="menuitem">Delete</button>
        <hr class="context-divider">
        <button class="context-item" id="ctx-info" role="menuitem">Properties</button>
    </div>

    <GenericModal />
    <ProgressModal />

    <div class="quicklook-overlay" id="quicklook-overlay">
        <div class="quicklook-modal" id="quicklook-modal">
            <div class="quicklook-header">
                <span class="quicklook-title" id="quicklook-title">Preview</span>
                <button class="quicklook-close" id="quicklook-close">&times;</button>
            </div>
            <div class="quicklook-content" id="quicklook-content">
                </div>
            <div class="quicklook-footer">
                <span class="quicklook-info" id="quicklook-info"></span>
                <button class="btn btn-primary" id="quicklook-open">Open with Default App</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="archive-overlay">
        <div class="modal archive-modal">
            <div class="modal-header">
                <h3 id="archive-title">Archive Contents</h3>
                <button class="modal-close" id="archive-close">&times;</button>
            </div>
            <div class="modal-body archive-body">
                <div class="archive-info" id="archive-info">
                    </div>
                <div class="archive-list" id="archive-list">
                    </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="archive-cancel">Close</button>
                <button class="btn btn-primary" id="archive-extract">Extract All</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="create-archive-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3>Create Archive</h3>
                <button class="modal-close" id="create-archive-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label" for="archive-name">Archive Name:</label>
                    <input type="text" class="form-input" id="archive-name" placeholder="archive.zip">
                </div>
                <div class="form-group">
                    <label class="form-label" for="archive-format">Format:</label>
                    <select class="form-input" id="archive-format">
                        <option value="zip">ZIP (.zip)</option>
                        <option value="tar">TAR (.tar)</option>
                        <option value="tar.gz">TAR.GZ (.tar.gz)</option>
                        <option value="rar">RAR (.rar)</option>
                    </select>
                </div>
                <div class="form-group">
                    <div class="form-label" id="archive-files-list-label">Files to compress:</div>
                    <div id="archive-files-list" class="archive-files-preview" aria-labelledby="archive-files-list-label">
                        </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="create-archive-cancel">Cancel</button>
                <button class="btn btn-primary" id="create-archive-confirm">Create</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="advanced-rename-overlay">
        <div class="modal advanced-rename-modal">
            <div class="modal-header">
                <h3>Advanced Rename</h3>
                <button class="modal-close" id="adv-rename-close">&times;</button>
            </div>
            <div class="modal-body adv-rename-body">
                <div class="adv-rename-options-column">
                    <p class="adv-rename-summary" id="adv-rename-summary"></p>
                    <div class="adv-rename-scope">
                        <label class="adv-inline-check">
                            <input type="checkbox" id="adv-scope-recursive"> Include files inside selected folders
                        </label>
                        <label class="adv-inline-check">
                            <input type="checkbox" id="adv-scope-hidden"> Include dotfiles
                        </label>
                        <label for="adv-apply-part">Apply text ops to:</label>
                        <select class="form-input" id="adv-apply-part">
                            <option value="full">Full name</option>
                            <option value="base">Name without extension</option>
                            <option value="extension">Extension only</option>
                        </select>
                    </div>
                <div class="adv-rename-ops">

                    <div class="adv-rename-op" id="adv-op-filter">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-filter-enabled">
                            <span class="adv-op-label">Filter Targets</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-filter-text">Name:</label>
                                <input type="text" class="form-input" id="adv-filter-text" placeholder="Only names matching">
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-filter-regex"> Regex
                                </label>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-filter-case"> Case sensitive
                                </label>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-filter-invert"> Invert
                                </label>
                            </div>
                            <div class="adv-field-row">
                                <label for="adv-filter-extensions">Extensions:</label>
                                <input type="text" class="form-input" id="adv-filter-extensions" placeholder="jpg, png, md">
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-template">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-template-enabled">
                            <span class="adv-op-label">Template</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-template-pattern">Pattern:</label>
                                <input type="text" class="form-input" id="adv-template-pattern" value={'{base}_{n}'} placeholder={'{base}_{n}'}>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-template-keep-ext" checked> Keep extension
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

                    <div class="adv-rename-op" id="adv-op-remove">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-remove-enabled">
                            <span class="adv-op-label">Remove String</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-remove-string">Remove:</label>
                                <input type="text" class="form-input" id="adv-remove-string" placeholder="Text to remove">
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-remove-regex"> Regex
                                </label>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-remove-case"> Case sensitive
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-replace">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-replace-enabled">
                            <span class="adv-op-label">Replace String</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-replace-find">Find:</label>
                                <input type="text" class="form-input" id="adv-replace-find" placeholder="Find text">
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-replace-regex"> Regex
                                </label>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-replace-case"> Case sensitive
                                </label>
                            </div>
                            <div class="adv-field-row">
                                <label for="adv-replace-with">Replace:</label>
                                <input type="text" class="form-input" id="adv-replace-with" placeholder="Replace with (empty = delete)">
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-trim">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-trim-enabled">
                            <span class="adv-op-label">Trim Whitespace</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-trim-mode">Mode:</label>
                                <select class="form-input" id="adv-trim-mode">
                                    <option value="both">Start and end</option>
                                    <option value="start">Start only</option>
                                    <option value="end">End only</option>
                                </select>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-trim-collapse"> Collapse spaces
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-add">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-add-enabled">
                            <span class="adv-op-label">Add String</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-add-string">Insert:</label>
                                <input type="text" class="form-input" id="adv-add-string" placeholder="Text to add">
                                <label for="adv-add-position">Position:</label>
                                <select class="form-input" id="adv-add-position">
                                    <option value="prefix">Before name</option>
                                    <option value="suffix">After name</option>
                                    <option value="before-ext">Before extension</option>
                                    <option value="index">At character</option>
                                </select>
                                <label for="adv-add-index">Index:</label>
                                <input type="number" class="form-input adv-number-input" id="adv-add-index" value="1" min="0" step="1">
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-capitalize">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-capitalize-enabled">
                            <span class="adv-op-label">Capitalize</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-capitalize-mode">Mode:</label>
                                <select class="form-input" id="adv-capitalize-mode">
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

                    <div class="adv-rename-op" id="adv-op-separator">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-separator-enabled">
                            <span class="adv-op-label">Separators</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-separator-mode">Convert:</label>
                                <select class="form-input" id="adv-separator-mode">
                                    <option value="spaces-to-dashes">Spaces to dashes</option>
                                    <option value="spaces-to-underscores">Spaces to underscores</option>
                                    <option value="underscores-to-spaces">Underscores to spaces</option>
                                    <option value="dashes-to-spaces">Dashes to spaces</option>
                                    <option value="dots-to-spaces">Dots to spaces</option>
                                </select>
                                <label class="adv-inline-check">
                                    <input type="checkbox" id="adv-separator-collapse" checked> Collapse repeats
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-number">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-number-enabled">
                            <span class="adv-op-label">Sequential Numbering</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-number-start">Start:</label>
                                <input type="number" class="form-input adv-number-input" id="adv-number-start" value="1" min="0" step="1">
                                <label for="adv-number-step">Step:</label>
                                <input type="number" class="form-input adv-number-input" id="adv-number-step" value="1" min="1" step="1">
                                <label for="adv-number-pad">Digits:</label>
                                <input type="number" class="form-input adv-number-input" id="adv-number-pad" value="3" min="1" max="10" step="1">
                            </div>
                            <div class="adv-field-row">
                                <label for="adv-number-position">Position:</label>
                                <select class="form-input" id="adv-number-position">
                                    <option value="prefix">Before name</option>
                                    <option value="suffix">After name</option>
                                    <option value="before-ext">Before extension</option>
                                    <option value="replace">Replace name</option>
                                </select>
                                <label for="adv-number-separator">Separator:</label>
                                <input type="text" class="form-input adv-number-input" id="adv-number-separator" value="_" maxlength="8" placeholder="_">
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-extension">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-extension-enabled">
                            <span class="adv-op-label">Extension</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-extension-mode">Mode:</label>
                                <select class="form-input" id="adv-extension-mode">
                                    <option value="lower">lowercase</option>
                                    <option value="upper">UPPERCASE</option>
                                    <option value="set">Set to</option>
                                    <option value="remove">Remove</option>
                                </select>
                                <label for="adv-extension-custom">Value:</label>
                                <input type="text" class="form-input adv-extension-input" id="adv-extension-custom" placeholder="txt">
                            </div>
                        </div>
                    </div>

                    <div class="adv-rename-op" id="adv-op-sanitize">
                        <label class="adv-op-toggle">
                            <input type="checkbox" id="adv-sanitize-enabled" checked>
                            <span class="adv-op-label">Sanitize Invalid Characters</span>
                        </label>
                        <div class="adv-op-body">
                            <div class="adv-field-row">
                                <label for="adv-sanitize-replacement">Replace with:</label>
                                <input type="text" class="form-input adv-number-input" id="adv-sanitize-replacement" value="_" maxlength="8">
                            </div>
                        </div>
                    </div>

                </div>
                </div>
                <div class="adv-rename-preview-column">
                    <div class="adv-rename-preview-section">
                        <h4 class="adv-rename-preview-title">Preview</h4>
                        <div class="adv-rename-preview" id="adv-rename-preview"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="adv-rename-cancel">Cancel</button>
                <button class="btn btn-primary" id="adv-rename-confirm">Rename</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="keyboard-help-overlay">
        <div class="modal keyboard-help-modal">
            <div class="modal-header">
                <h3>Keyboard Shortcuts</h3>
                <button class="modal-close" id="keyboard-help-close">&times;</button>
            </div>
            <div class="modal-body keyboard-help-body">
                <div class="shortcuts-section">
                    <h4>Navigation</h4>
                    <div class="shortcut-row"><kbd>Alt+Up</kbd> or <kbd>Backspace</kbd><span>Go up one folder</span></div>
                    <div class="shortcut-row"><kbd>Enter</kbd><span>Open selected item</span></div>
                    <div class="shortcut-row"><kbd>Arrow Keys</kbd><span>Move selection</span></div>
                    <div class="shortcut-row"><kbd>Home</kbd><span>Select first item</span></div>
                    <div class="shortcut-row"><kbd>End</kbd><span>Select last item</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+L</kbd> or <kbd>Alt+D</kbd><span>Edit path</span></div>
                </div>
                <div class="shortcuts-section">
                    <h4>Selection</h4>
                    <div class="shortcut-row"><kbd>Ctrl+A</kbd><span>Select all</span></div>
                    <div class="shortcut-row"><kbd>Shift+Arrow</kbd><span>Extend selection</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Click</kbd><span>Toggle selection</span></div>
                    <div class="shortcut-row"><kbd>Shift+Click</kbd><span>Range selection</span></div>
                    <div class="shortcut-row"><kbd>Escape</kbd><span>Close surface / clear filter / clear selection</span></div>
                </div>
                <div class="shortcuts-section">
                    <h4>File Operations</h4>
                    <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>Copy</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+X</kbd><span>Cut</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>Paste</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>Undo last create/rename/copy/move</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Y</kbd><span>Redo last create/rename/copy/move</span></div>
                    <div class="shortcut-row"><kbd>Delete</kbd><span>Move selected to trash</span></div>
                    <div class="shortcut-row"><kbd>Shift+Delete</kbd><span>Permanently delete selected</span></div>
                    <div class="shortcut-row"><kbd>F2</kbd><span>Rename</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+N</kbd><span>New file</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Shift+N</kbd><span>New folder</span></div>
                </div>
                <div class="shortcuts-section">
                    <h4>View & Tools</h4>
                    <div class="shortcut-row"><kbd>Space</kbd><span>Quick Look</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+F</kbd><span>Search files</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Shift+C</kbd><span>Copy full path</span></div>
                    <div class="shortcut-row"><kbd>F5</kbd><span>Refresh</span></div>
                </div>
                <div class="shortcuts-section">
                    <h4>Dual Pane</h4>
                    <div class="shortcut-row"><kbd>F6</kbd><span>Toggle dual pane</span></div>
                    <div class="shortcut-row"><kbd>Tab</kbd><span>Switch active pane</span></div>
                    <div class="shortcut-row"><kbd>Alt+1</kbd> / <kbd>Ctrl+Shift+Left</kbd><span>Focus left pane</span></div>
                    <div class="shortcut-row"><kbd>Alt+2</kbd> / <kbd>Ctrl+Shift+Right</kbd><span>Focus right pane</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Alt+C</kbd><span>Copy selection to other pane</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Alt+M</kbd><span>Move selection to other pane</span></div>
                </div>
                <div class="shortcuts-section">
                    <h4>Tabs & Bookmarks</h4>
                    <div class="shortcut-row"><kbd>Ctrl+T</kbd><span>New tab</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+W</kbd><span>Close tab</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Tab</kbd><span>Next tab</span></div>
                    <div class="shortcut-row"><kbd>Ctrl+Shift+Tab</kbd><span>Previous tab</span></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" id="keyboard-help-ok">OK</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="about-overlay">
        <div class="modal about-modal">
            <div class="modal-header">
                <h3>About SimpleFile</h3>
                <button class="modal-close" id="about-close">&times;</button>
            </div>
            <div class="modal-body about-body">
                <div class="about-hero">
                    <div class="about-logo" aria-hidden="true">SF</div>
                    <div class="about-heading">
                        <h2 class="about-title">SimpleFile</h2>
                        <p class="about-version">Version <span id="about-version-value">Checking...</span></p>
                        <p class="about-description">A fast Windows file explorer for local files, archives, dual-pane workflows, search, previews, and metadata.</p>
                    </div>
                </div>

                <div class="about-details" aria-label="Application details">
                    <div class="about-detail-row">
                        <span>Application ID</span>
                        <strong id="about-identifier-value">com.simplefile.desktop</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>Build</span>
                        <strong id="about-build-value">Loading...</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>Platform</span>
                        <strong id="about-platform-value">Loading...</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>Framework</span>
                        <strong id="about-framework-value">Tauri 2</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>Runtime</span>
                        <strong id="about-runtime-value">Rust backend + WebView frontend</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>Maintainer</span>
                        <strong id="about-authors-value">SimpleFile Team</strong>
                    </div>
                    <div class="about-detail-row">
                        <span>License</span>
                        <strong id="about-license-value">Proprietary - All Rights Reserved</strong>
                    </div>
                </div>

                <section class="about-section">
                    <h4>What SimpleFile Includes</h4>
                    <ul class="about-feature-list">
                        <li>Tabbed and dual-pane file management</li>
                        <li>Bookmarks, recent locations, search, and quick filtering</li>
                        <li>Archive creation, extraction, previews, metadata, and checksums</li>
                        <li>Integrated terminal, cleanup tools, Git status, and open-with workflows</li>
                    </ul>
                </section>

                <section class="about-section">
                    <h4>Project</h4>
                    <p id="about-description-value">A simple file explorer built with Tauri.</p>
                    <div class="about-link-row">
                        <button type="button" class="about-link-btn" id="about-repository-link" data-about-url="https://github.com/conniecombs/SimpleFile-Windows">Project repository</button>
                    </div>
                </section>

                <p class="about-copyright">SimpleFile Team and contributors.</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" id="about-ok">OK</button>
            </div>
        </div>
    </div>

    <!-- External drag-and-drop overlay: shown when OS files hover over the window -->
    <div class="external-drop-overlay" id="external-drop-overlay" aria-hidden="true" role="status" aria-live="polite">
        <div class="external-drop-content">
            <div class="external-drop-icon" aria-hidden="true">📂</div>
            <div class="external-drop-text">Drop files to copy here</div>
            <div class="external-drop-path" id="external-drop-path"></div>
        </div>
    </div>

