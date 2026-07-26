<script lang="ts">
import { state as globalState } from '../../../vanilla-js/runtime/state.svelte';
  import { gitPull, gitPush } from '../../api';


  let inputEl = $state<HTMLInputElement>();
  let query = $state('');
  let selectedIndex = $state(0);

  type Command = {
    id: string;
    label: string;
    action: () => void;
  };

  function dispatchToolbarCommand(command: string) {
    document.dispatchEvent(new CustomEvent('simplefile:toolbar-command', {
      detail: { command },
    }));
  }

  const allCommands: Command[] = [
    { id: 'go-home', label: 'Go Home', action: () => dispatchToolbarCommand('navigateHome') },
    { id: 'copy', label: 'Copy', action: () => dispatchToolbarCommand('copy') },
    { id: 'cut', label: 'Cut', action: () => dispatchToolbarCommand('cut') },
    { id: 'paste', label: 'Paste', action: () => dispatchToolbarCommand('paste') },
    { id: 'clipboard-history', label: 'Clipboard History', action: () => dispatchToolbarCommand('clipboard-history') },
    { id: 'undo', label: 'Undo', action: () => dispatchToolbarCommand('undo') },
    { id: 'redo', label: 'Redo', action: () => dispatchToolbarCommand('redo') },
    { id: 'delete', label: 'Delete', action: () => dispatchToolbarCommand('delete') },
    { id: 'rename', label: 'Rename', action: () => dispatchToolbarCommand('rename') },
    { id: 'advanced-rename', label: 'Advanced Rename', action: () => document.dispatchEvent(new CustomEvent('simplefile:advanced-rename')) },
    { id: 'new-folder', label: 'New Folder', action: () => dispatchToolbarCommand('new-folder') },
    { id: 'new-file', label: 'New File', action: () => dispatchToolbarCommand('new-file') },
    { id: 'create-archive', label: 'Create Archive', action: () => document.dispatchEvent(new CustomEvent('simplefile:create-archive')) },
    { id: 'terminal', label: 'Open Terminal', action: () => dispatchToolbarCommand('terminal') },
    { id: 'preview', label: 'Toggle Preview Pane', action: () => dispatchToolbarCommand('preview-toggle') },
    { id: 'dual-pane', label: 'Toggle Dual Pane', action: () => dispatchToolbarCommand('dual-pane') },
    { id: 'refresh', label: 'Refresh', action: () => dispatchToolbarCommand('refresh') },
    { id: 'search', label: 'Focus Search', action: () => document.dispatchEvent(new CustomEvent('simplefile:focus-search')) },
    { id: 'quick-look', label: 'Quick Look', action: () => document.dispatchEvent(new CustomEvent('simplefile:quick-look')) },
    { id: 'properties', label: 'Properties', action: () => document.dispatchEvent(new CustomEvent('simplefile:properties')) },
    { id: 'color-label', label: 'Set Color Label', action: () => document.dispatchEvent(new CustomEvent('simplefile:set-color-label')) },
    { id: 'folder-metrics', label: 'Calculate Folder Metrics', action: () => document.dispatchEvent(new CustomEvent('simplefile:folder-metrics')) },
    { id: 'disk-cleanup', label: 'Analyze Cleanup', action: () => document.dispatchEvent(new CustomEvent('simplefile:disk-cleanup')) },
    { id: 'settings', label: 'Settings', action: () => document.dispatchEvent(new CustomEvent('simplefile:open-settings')) },
    { id: 'keyboard-help', label: 'Keyboard Shortcuts', action: () => document.dispatchEvent(new CustomEvent('simplefile:keyboard-help')) },
    { 
      id: 'git-pull', 
      label: 'Git: Pull (Current Directory)', 
      action: async () => {
        try {
          const currentDir = globalState.tabs.find((t: any) => t.id === globalState.activeTabId)?.path || '.';
          const out = await gitPull(currentDir);
          const toast = new CustomEvent('simplefile:toast', { detail: { message: `Git Pull Success:\n${out}`, type: 'success' }});
          document.dispatchEvent(toast);
        } catch(e) {
          const toast = new CustomEvent('simplefile:toast', { detail: { message: `Git Pull Error: ${e}`, type: 'error' }});
          document.dispatchEvent(toast);
        }
      } 
    },
    { 
      id: 'git-push', 
      label: 'Git: Push (Current Directory)', 
      action: async () => {
        try {
          const currentDir = globalState.tabs.find((t: any) => t.id === globalState.activeTabId)?.path || '.';
          const out = await gitPush(currentDir);
          const toast = new CustomEvent('simplefile:toast', { detail: { message: `Git Push Success:\n${out}`, type: 'success' }});
          document.dispatchEvent(toast);
        } catch(e) {
          const toast = new CustomEvent('simplefile:toast', { detail: { message: `Git Push Error: ${e}`, type: 'error' }});
          document.dispatchEvent(toast);
        }
      } 
    }
  ];

  let filteredCommands = $derived(
    query
      ? allCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
      : allCommands
  );

  function closePalette() {
    globalState.commandPaletteVisible = false;
    query = '';
    selectedIndex = 0;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        closePalette();
        cmd.action();
      }
    }
  }

  $effect(() => {
    if (globalState.commandPaletteVisible) {
      setTimeout(() => {
        if (inputEl) inputEl.focus();
      }, 50);
    }
  });
</script>

{#if globalState.commandPaletteVisible}
  <div class="command-palette-overlay" role="presentation" onmousedown={closePalette}>
    <div class="command-palette" role="presentation" onmousedown={(e) => e.stopPropagation()}>
      <input
        type="text"
        bind:this={inputEl}
        bind:value={query}
        onkeydown={handleKeydown}
        placeholder="Type a command..."
      />
      <ul class="command-list">
        {#each filteredCommands as cmd, i}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="command-item"
            class:selected={i === selectedIndex}
            onmousedown={() => {
              closePalette();
              cmd.action();
            }}
          >
            {cmd.label}
          </li>
        {/each}
        {#if filteredCommands.length === 0}
          <li class="command-item no-results">No commands found</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}
