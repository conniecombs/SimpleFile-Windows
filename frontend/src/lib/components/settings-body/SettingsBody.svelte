<script lang="ts">
  import { invokeCommand } from '../../tauri';
  import { onDestroy, onMount } from 'svelte';
  type SettingsTab = 'general' | 'tools' | 'updates';

  let { activeTab: initialActiveTab = 'general' }: { activeTab?: SettingsTab } = $props();
  let activeSettingsTab: SettingsTab = $state('general');
  function dispatchSettingsToast(message: string, type: 'success' | 'error' = 'success') {
    document.dispatchEvent(new CustomEvent('simplefile:toast', {
      detail: { message, type },
    }));
  }


  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },

    { id: 'tools', label: 'Tools' },
    { id: 'updates', label: 'Updates' },
  ];

  $effect(() => {
    activeSettingsTab = initialActiveTab;
  });

  function activateTab(tabId: SettingsTab, { focus = false } = {}) {
    activeSettingsTab = tabId;

    if (focus) {
      requestAnimationFrame(() => {
        document.getElementById(`settings-tab-${tabId}`)?.focus();
      });
    }
  }

  function handleTabKeydown(event: KeyboardEvent, tabId: SettingsTab) {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    activateTab(tabs[nextIndex].id, { focus: true });
  }
</script>

<div class="settings-tabs" role="tablist" aria-label="Settings sections">
  {#each tabs as tab}
    <button
      type="button"
      class:active={activeSettingsTab === tab.id}
      class="settings-tab"
      id={`settings-tab-${tab.id}`}
      data-settings-tab={tab.id}
      role="tab"
      aria-selected={activeSettingsTab === tab.id}
      aria-controls={`settings-panel-${tab.id}`}
      tabindex={activeSettingsTab === tab.id ? 0 : -1}
      onclick={() => activateTab(tab.id)}
      onkeydown={(event) => handleTabKeydown(event, tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<div class="settings-tab-content">
  <div
    class="settings-tab-panel"
    id="settings-panel-general"
    data-settings-panel="general"
    role="tabpanel"
    aria-labelledby="settings-tab-general"
    hidden={activeSettingsTab !== 'general'}
  >
    <div class="settings-section">
      <h4>Appearance</h4>
      <div class="settings-row">
        <label for="settings-theme">Theme</label>
        <select id="settings-theme">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div class="settings-row">
        <label for="settings-default-view">Default View</label>
        <select id="settings-default-view">
          <option value="list">List</option>
          <option value="grid">Grid</option>
        </select>
      </div>
      <div class="settings-row">
        <label for="settings-icon-size">Default Icon Size</label>
        <div class="settings-inline-control">
          <input type="range" id="settings-icon-size" min="48" max="128" value="64" />
          <span id="settings-icon-size-value">64px</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4>Behavior</h4>
      <div class="settings-row">
        <label for="settings-show-hidden">Show Hidden Files</label>
        <input type="checkbox" id="settings-show-hidden" />
      </div>
      <div class="settings-row">
        <label for="settings-confirm-delete">Confirm Before Delete</label>
        <input type="checkbox" id="settings-confirm-delete" checked />
      </div>
      <div class="settings-row">
        <label for="settings-new-tab">Open Folders in New Tab</label>
        <input type="checkbox" id="settings-new-tab" />
      </div>
      <div class="settings-row">
        <label for="settings-auto-collapse">Auto-Collapse Tree</label>
        <input
          type="checkbox"
          id="settings-auto-collapse"
          title="Collapse sibling folders when expanding a node or navigating to a new directory"
        />
      </div>
      <div class="settings-row">
        <label for="settings-recent-locations">Show Recent Locations</label>
        <input
          type="checkbox"
          id="settings-recent-locations"
          title="Show recently visited folders in sidebar"
        />
      </div>
      <div class="settings-row">
        <label for="settings-folder-sizes">Calculate Folder Sizes</label>
        <input
          type="checkbox"
          id="settings-folder-sizes"
          title="Show directory sizes in the Size column when possible"
        />
      </div>
      <div class="settings-row">
        <label for="settings-git-integration">Enable Git Integration</label>
        <input
          type="checkbox"
          id="settings-git-integration"
          title="Show git status for files when inside a git repository"
        />
      </div>

      <div class="settings-row">
        <span class="settings-row-label">Visible Columns</span>
        <div class="settings-col-options">
          <label><input type="checkbox" id="settings-col-size" /> Size</label>
          <label><input type="checkbox" id="settings-col-items" /> Items</label>
          <label><input type="checkbox" id="settings-col-date" /> Modified</label>
          <label><input type="checkbox" id="settings-col-type" /> Type</label>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4>Startup</h4>
      <div class="settings-row">
        <label for="settings-start-location">Start Location</label>
        <select id="settings-start-location">
          <option value="home">Home Directory</option>
          <option value="last">Last Used Location</option>
          <option value="custom">Custom Path</option>
        </select>
      </div>
      <div class="settings-row" id="settings-custom-path-row" style="display: none;">
        <label for="settings-custom-path">Custom Path</label>
        <div class="settings-path-control">
          <input type="text" id="settings-custom-path" placeholder="Select a folder" />
          <button
            type="button"
            class="btn btn-secondary"
            id="settings-custom-path-browse"
            title="Select custom start folder"
          >
            Browse
          </button>
        </div>
      </div>
    </div>
  </div>


  <div
    class="settings-tab-panel"
    id="settings-panel-tools"
    data-settings-panel="tools"
    role="tabpanel"
    aria-labelledby="settings-tab-tools"
    hidden={activeSettingsTab !== 'tools'}
  >

    <div class="settings-section" id="settings-git-section" style="display:none;">
      <h4>Git Repository</h4>
      <div id="settings-git-status"></div>
    </div>


    <div class="settings-section">
      <h4>RAR Tools</h4>
      <div class="settings-row">
        <span class="settings-row-label">RAR Status</span>
        <span id="rar-status-text" class="rar-status-badge">Checking...</span>
      </div>
      <div class="settings-row" id="rar-install-row">
        <span class="settings-row-label" aria-hidden="true"></span>
        <div class="rar-install-controls">
          <button class="btn btn-secondary" id="rar-install-btn">Install RAR</button>
          <span id="rar-install-msg" class="rar-install-msg" style="display:none;"></span>
        </div>
      </div>
    </div>
  </div>


  <div
    class="settings-tab-panel"
    id="settings-panel-updates"
    data-settings-panel="updates"
    role="tabpanel"
    aria-labelledby="settings-tab-updates"
    hidden={activeSettingsTab !== 'updates'}
  >
    <div class="settings-section">
      <h4>App Updates</h4>
      <div class="settings-row">
        <span class="settings-row-label">Current Version</span>
        <span id="update-current-version" class="rar-status-badge">-</span>
      </div>
      <div class="settings-row" id="update-check-row">
        <span class="settings-row-label" aria-hidden="true"></span>
        <div class="rar-install-controls">
          <button class="btn btn-secondary" id="update-check-btn">Check for Updates</button>
          <span id="update-status-msg" class="rar-install-msg" style="display:none;"></span>
        </div>
      </div>
      <div class="settings-row" id="update-install-row" style="display:none;">
        <span class="settings-row-label" aria-hidden="true"></span>
        <div class="rar-install-controls">
          <button class="btn btn-primary" id="update-install-btn">Download &amp; Install</button>
          <span id="update-install-msg" class="rar-install-msg" style="display:none;"></span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4>About</h4>
      <div class="settings-action-grid">
        <button
          type="button"
          class="settings-action-button"
          id="btn-about"
          title="About SimpleFile"
          aria-label="About SimpleFile"
          data-settings-dismiss=""
        >
          <span class="settings-action-icon" aria-hidden="true">i</span>
          <span>About SimpleFile</span>
        </button>
      </div>
    </div>
  </div>
</div>
