<script lang="ts">
  type SettingsSection =
    | 'appearance'
    | 'file-list'
    | 'navigation'
    | 'behavior'
    | 'tools'
    | 'updates'
    | 'about';

  type SettingsTab = SettingsSection | 'general';
  type SettingsSectionDefinition = {
    id: SettingsSection;
    label: string;
    searchText: string;
  };

  let { activeTab: initialActiveTab = 'appearance' }: { activeTab?: SettingsTab } = $props();
  let activeSettingsSection: SettingsSection = $state('appearance');
  let settingsSearchQuery = $state('');
  let tabsOrientation: 'vertical' | 'horizontal' = $state('vertical');

  const sections: SettingsSectionDefinition[] = [
    {
      id: 'appearance',
      label: 'Appearance',
      searchText: 'appearance theme dark light default view list grid default icon size icons display',
    },
    {
      id: 'file-list',
      label: 'File List',
      searchText:
        'file list files folders visible columns size items modified date type hidden folder sizes directory sizes git integration repository source control',
    },
    {
      id: 'navigation',
      label: 'Navigation',
      searchText:
        'navigation startup start location home directory last used custom path folder browse open folders new tab auto collapse tree sidebar recent locations history',
    },
    {
      id: 'behavior',
      label: 'Behavior',
      searchText: 'behavior delete deletion confirm before delete move deleted items trash recycle bin remove',
    },
    {
      id: 'tools',
      label: 'Tools',
      searchText:
        'tools git repository status branch staged modified untracked source control rar tools install rar archive extract compress',
    },
    {
      id: 'updates',
      label: 'Updates',
      searchText: 'updates app update current version check for updates download install',
    },
    {
      id: 'about',
      label: 'About',
      searchText: 'about simplefile app application info version',
    },
  ];

  let normalizedSearchQuery = $derived(normalizeSearchText(settingsSearchQuery));
  let matchingSections = $derived(sections.filter((section) => sectionMatches(section.id)));

  function normalizeSection(section: SettingsTab): SettingsSection {
    return section === 'general' ? 'appearance' : section;
  }

  function normalizeSearchText(value: string) {
    return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }

  function sectionFor(sectionId: SettingsSection) {
    return sections.find((section) => section.id === sectionId);
  }

  function textMatchesQuery(searchText: string, query: string) {
    return !query || normalizeSearchText(searchText).includes(query);
  }

  function textMatches(searchText: string) {
    return textMatchesQuery(searchText, normalizedSearchQuery);
  }

  function sectionMatchesQuery(section: SettingsSectionDefinition, query: string) {
    return textMatchesQuery(`${section.label} ${section.searchText}`, query);
  }

  function sectionMatches(sectionId: SettingsSection) {
    const section = sectionFor(sectionId);
    return Boolean(section && sectionMatchesQuery(section, normalizedSearchQuery));
  }

  function sectionLabelMatches(sectionId: SettingsSection) {
    const section = sectionFor(sectionId);
    return Boolean(section && textMatches(section.label));
  }

  function hideSettingRow(sectionId: SettingsSection, searchText: string) {
    return Boolean(normalizedSearchQuery) && !sectionLabelMatches(sectionId) && !textMatches(searchText);
  }

  function isPanelHidden(sectionId: SettingsSection) {
    return activeSettingsSection !== sectionId || !sectionMatches(sectionId);
  }

  function handleSettingsSearchInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    settingsSearchQuery = input.value;

    const query = normalizeSearchText(input.value);
    const firstMatch = query ? sections.find((section) => sectionMatchesQuery(section, query)) : null;
    if (firstMatch) {
      activeSettingsSection = firstMatch.id;
    }
  }

  $effect(() => {
    activeSettingsSection = normalizeSection(initialActiveTab);
  });

  $effect(() => {
    if (!normalizedSearchQuery || matchingSections.length === 0) {
      return;
    }

    if (!matchingSections.some((section) => section.id === activeSettingsSection)) {
      activeSettingsSection = matchingSections[0].id;
    }
  });

  $effect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const syncOrientation = () => {
      tabsOrientation = media.matches ? 'horizontal' : 'vertical';
    };

    syncOrientation();
    media.addEventListener('change', syncOrientation);

    return () => {
      media.removeEventListener('change', syncOrientation);
    };
  });

  function activateSection(sectionId: SettingsSection, { focus = false } = {}) {
    activeSettingsSection = sectionId;

    requestAnimationFrame(() => {
      const tab = document.getElementById(`settings-tab-${sectionId}`);
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focus) tab?.focus();
    });
  }

  function handleSectionKeydown(event: KeyboardEvent, sectionId: SettingsSection) {
    const navigationSections = matchingSections.length > 0 ? matchingSections : sections;
    const currentIndex = navigationSections.findIndex((section) => section.id === sectionId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % navigationSections.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + navigationSections.length) % navigationSections.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = navigationSections.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    activateSection(navigationSections[nextIndex].id, { focus: true });
  }
</script>

<div class="settings-layout">
  <aside class="settings-sidebar" aria-label="Settings categories">
    <div class="settings-sidebar-title">Preferences</div>
    <label class="settings-search" for="settings-search">
      <input
        type="search"
        id="settings-search"
        placeholder="Search settings"
        aria-label="Search settings"
        autocomplete="off"
        value={settingsSearchQuery}
        oninput={handleSettingsSearchInput}
      />
    </label>
    <div class="settings-tabs-shell">
      <div
        class="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
        aria-orientation={tabsOrientation}
      >
        {#each matchingSections as section}
          <button
            type="button"
            class:active={activeSettingsSection === section.id}
            class="settings-tab"
            id={`settings-tab-${section.id}`}
            data-settings-tab={section.id}
            role="tab"
            aria-selected={activeSettingsSection === section.id}
            aria-controls={`settings-panel-${section.id}`}
            tabindex={activeSettingsSection === section.id ? 0 : -1}
            onclick={() => activateSection(section.id)}
            onkeydown={(event) => handleSectionKeydown(event, section.id)}
          >
            {section.label}
          </button>
        {/each}
      </div>
    </div>
  </aside>

  <div class="settings-tab-content">
    {#if matchingSections.length === 0}
      <div class="settings-empty-state" role="status">No settings found.</div>
    {/if}

    <div
      class="settings-tab-panel"
      id="settings-panel-appearance"
      data-settings-panel="appearance"
      role="tabpanel"
      aria-labelledby="settings-tab-appearance"
      hidden={isPanelHidden('appearance')}
    >
      <div class="settings-panel-heading">
        <h4>Appearance</h4>
      </div>
      <div class="settings-section-grid">
        <div class="settings-row" hidden={hideSettingRow('appearance', 'theme dark light appearance')}>
          <label for="settings-theme">Theme</label>
          <select id="settings-theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div class="settings-row" hidden={hideSettingRow('appearance', 'default view list grid appearance')}>
          <label for="settings-default-view">Default View</label>
          <select id="settings-default-view">
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
        <div
          class="settings-row settings-row--wide"
          hidden={hideSettingRow('appearance', 'default icon size icons display appearance')}
        >
          <label for="settings-icon-size">Default Icon Size</label>
          <div class="settings-inline-control">
            <input type="range" id="settings-icon-size" min="48" max="128" value="64" />
            <span id="settings-icon-size-value">64px</span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-file-list"
      data-settings-panel="file-list"
      role="tabpanel"
      aria-labelledby="settings-tab-file-list"
      hidden={isPanelHidden('file-list')}
    >
      <div class="settings-panel-heading">
        <h4>File List</h4>
      </div>
      <div class="settings-section-grid">
        <div
          class="settings-row settings-row--wide"
          hidden={hideSettingRow('file-list', 'visible columns size items modified date type file list')}
        >
          <span class="settings-row-label">Visible Columns</span>
          <div class="settings-col-options">
            <label><input type="checkbox" id="settings-col-size" /> <span>Size</span></label>
            <label><input type="checkbox" id="settings-col-items" /> <span>Items</span></label>
            <label><input type="checkbox" id="settings-col-date" /> <span>Modified</span></label>
            <label><input type="checkbox" id="settings-col-type" /> <span>Type</span></label>
          </div>
        </div>
        <div class="settings-row" hidden={hideSettingRow('file-list', 'show hidden files hidden file list')}>
          <label for="settings-show-hidden">Show Hidden Files</label>
          <label class="settings-switch" aria-label="Show Hidden Files">
            <input type="checkbox" id="settings-show-hidden" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
        <div
          class="settings-row"
          hidden={hideSettingRow('file-list', 'calculate folder sizes directory sizes size file list')}
        >
          <label for="settings-folder-sizes">Calculate Folder Sizes</label>
          <label class="settings-switch" aria-label="Calculate Folder Sizes">
            <input type="checkbox" id="settings-folder-sizes" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
        <div
          class="settings-row"
          hidden={hideSettingRow('file-list', 'enable git integration repository source control file list')}
        >
          <label for="settings-git-integration">Enable Git Integration</label>
          <label class="settings-switch" aria-label="Enable Git Integration">
            <input type="checkbox" id="settings-git-integration" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-navigation"
      data-settings-panel="navigation"
      role="tabpanel"
      aria-labelledby="settings-tab-navigation"
      hidden={isPanelHidden('navigation')}
    >
      <div class="settings-panel-heading">
        <h4>Navigation</h4>
      </div>
      <div class="settings-section-grid">
        <div
          class="settings-row"
          hidden={hideSettingRow('navigation', 'start location startup home directory last used custom path navigation')}
        >
          <label for="settings-start-location">Start Location</label>
          <select id="settings-start-location">
            <option value="home">Home Directory</option>
            <option value="last">Last Used Location</option>
            <option value="custom">Custom Path</option>
          </select>
        </div>
        <div
          class="settings-row settings-row--wide"
          id="settings-custom-path-row"
          style="display: none;"
          hidden={hideSettingRow('navigation', 'custom path select folder browse start location navigation')}
        >
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
        <div class="settings-row" hidden={hideSettingRow('navigation', 'open folders in new tab tabs navigation')}>
          <label for="settings-new-tab">Open Folders in New Tab</label>
          <label class="settings-switch" aria-label="Open Folders in New Tab">
            <input type="checkbox" id="settings-new-tab" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
        <div class="settings-row" hidden={hideSettingRow('navigation', 'auto collapse tree sidebar folders navigation')}>
          <label for="settings-auto-collapse">Auto-Collapse Tree</label>
          <label class="settings-switch" aria-label="Auto-Collapse Tree">
            <input type="checkbox" id="settings-auto-collapse" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
        <div class="settings-row" hidden={hideSettingRow('navigation', 'show recent locations history navigation')}>
          <label for="settings-recent-locations">Show Recent Locations</label>
          <label class="settings-switch" aria-label="Show Recent Locations">
            <input type="checkbox" id="settings-recent-locations" />
            <span class="settings-switch-track"></span>
          </label>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-behavior"
      data-settings-panel="behavior"
      role="tabpanel"
      aria-labelledby="settings-tab-behavior"
      hidden={isPanelHidden('behavior')}
    >
      <div class="settings-panel-heading">
        <h4>Behavior</h4>
      </div>
      <div class="settings-section-grid">
        <div class="settings-row" hidden={hideSettingRow('behavior', 'confirm before delete deletion prompt remove behavior')}>
          <label for="settings-confirm-delete">Confirm Before Delete</label>
          <label class="settings-switch" aria-label="Confirm Before Delete">
            <input type="checkbox" id="settings-confirm-delete" checked />
            <span class="settings-switch-track"></span>
          </label>
        </div>
        <div
          class="settings-row"
          hidden={hideSettingRow('behavior', 'move deleted items to trash recycle bin delete deletion behavior')}
        >
          <label for="settings-use-trash">Move Deleted Items to Trash</label>
          <label class="settings-switch" aria-label="Move Deleted Items to Trash">
            <input type="checkbox" id="settings-use-trash" checked />
            <span class="settings-switch-track"></span>
          </label>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-tools"
      data-settings-panel="tools"
      role="tabpanel"
      aria-labelledby="settings-tab-tools"
      hidden={isPanelHidden('tools')}
    >
      <div class="settings-panel-heading">
        <h4>Tools</h4>
      </div>
      <div
        class="settings-section"
        id="settings-git-section"
        style="display:none;"
        hidden={hideSettingRow('tools', 'git repository status branch staged modified untracked source control tools')}
      >
        <div class="settings-section-title-row">
          <h4>Git Repository</h4>
        </div>
        <div id="settings-git-status"></div>
      </div>

      <div class="settings-section" hidden={hideSettingRow('tools', 'rar tools rar status install archive extract compress tools')}>
        <div class="settings-section-title-row">
          <h4>RAR Tools</h4>
        </div>
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
      hidden={isPanelHidden('updates')}
    >
      <div class="settings-panel-heading">
        <h4>Updates</h4>
      </div>
      <div class="settings-section">
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
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-about"
      data-settings-panel="about"
      role="tabpanel"
      aria-labelledby="settings-tab-about"
      hidden={isPanelHidden('about')}
    >
      <div class="settings-panel-heading">
        <h4>About</h4>
      </div>
      <div class="settings-section">
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
</div>
