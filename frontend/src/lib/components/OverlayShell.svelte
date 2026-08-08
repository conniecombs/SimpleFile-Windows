<script lang="ts">
  import AboutModal from './AboutModal.svelte';
  import AdvancedRenameModal from './AdvancedRenameModal.svelte';
  import ArchiveViewerModal from './ArchiveViewerModal.svelte';
  import CreateArchiveModal from './CreateArchiveModal.svelte';
  import DuplicateCheckerModal from './DuplicateCheckerModal.svelte';
  import GenericModal from './GenericModal.svelte';
  import KeyboardHelpModal from './KeyboardHelpModal.svelte';
  import ProgressModal from './ProgressModal.svelte';
  import QuickLookOverlay from './QuickLookOverlay.svelte';
</script>

<!-- Overlay shell: workflow and help overlays are component-owned. -->
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
    <ArchiveViewerModal />
    <CreateArchiveModal />
    <QuickLookOverlay />
    <DuplicateCheckerModal />
    <AdvancedRenameModal />
    <KeyboardHelpModal />
    <AboutModal />

    <!-- External drag-and-drop overlay: shown when OS files hover over the window -->
    <div class="external-drop-overlay" id="external-drop-overlay" aria-hidden="true" role="status" aria-live="polite">
        <div class="external-drop-content">
            <div class="external-drop-icon" aria-hidden="true">📂</div>
            <div class="external-drop-text">Drop files to copy here</div>
            <div class="external-drop-path" id="external-drop-path"></div>
        </div>
    </div>

