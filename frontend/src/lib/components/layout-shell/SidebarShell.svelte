<script lang="ts">
  const SIDEBAR_COLLAPSE_KEY = 'simplefile-sidebar-collapse-state';

  type SidebarCollapseState = {
    myPc: boolean;
    quickAccess: boolean;
  };

  function readCollapseState(): SidebarCollapseState {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        myPc: Boolean(parsed?.myPc),
        quickAccess: Boolean(parsed?.quickAccess),
      };
    } catch {
      return { myPc: false, quickAccess: false };
    }
  }

  function writeCollapseState(state: SidebarCollapseState) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(state));
    } catch {
      /* Ignore storage failures; collapsing should still work for this session. */
    }
  }

  const initialCollapseState = readCollapseState();
  let quickAccessCollapsed = $state(initialCollapseState.quickAccess);
  let myPcCollapsed = $state(initialCollapseState.myPc);

  $effect(() => {
    writeCollapseState({
      myPc: myPcCollapsed,
      quickAccess: quickAccessCollapsed,
    });
  });

  // @ts-ignore
  import { state as appState } from '../../../vanilla-js/runtime/state.svelte.js';
  import type { DriveInfo } from '../../types';
  import TreeView from '../tree-view/TreeView.svelte';
  import type { TreeViewNode } from '../tree-view/TreeView.svelte';
  import QuickAccessList from '../places/QuickAccessList.svelte';
  import SmartFoldersList from '../places/SmartFoldersList.svelte';


  function driveIcon(drive: Pick<DriveInfo, 'drive_type'>) {
    switch ((drive.drive_type || '').toLowerCase()) {
      case 'network':
        return '🌐';
      case 'removable':
        return '💾';
      case 'cd-rom':
      case 'optical':
        return '💿';
      case 'ram disk':
        return '⚡';
      default:
        return '🖴';
    }
  }

  function toTreeNode(node: any): TreeViewNode {
    const path = node.path;
    const children = appState.treeData?.get(path) || [];
    const isExpanded = appState.treeExpanded?.has(path) || false;

    return {
      children: children.map(toTreeNode),
      hasChildren: Boolean(node.has_children ?? node.hasChildren),
      icon: node.icon || '\u{1f4c1}',
      isActive: appState.currentPath === path,
      isExpanded,
      isLoaded: appState.treeData?.has(path) || false,
      name: node.name || path,
      path,
    };
  }

  let treeRoots = $derived.by(() => {
    return (appState.drives || []).map((drive: DriveInfo) => ({
      children: (appState.treeData?.get(drive.path) || []).map(toTreeNode),
      hasChildren: true,
      icon: driveIcon(drive),
      isActive: appState.currentPath === drive.path,
      isExpanded: appState.treeExpanded?.has(drive.path) || false,
      isLoaded: appState.treeData?.has(drive.path) || false,
      name: drive.name || drive.path,
      path: drive.path
    })) as TreeViewNode[];
  });

  const quickAccessLocations = [
    { name: 'Home', icon: '🏠', action: 'navigateHome' },
    { name: 'Desktop', icon: '💻', action: 'navigateDesktop' },
    { name: 'Downloads', icon: '📥', action: 'navigateDownloads' },
    { name: 'Documents', icon: '📄', action: 'navigateDocuments' },
    { name: 'Pictures', icon: '🖼️', action: 'navigatePictures' }
  ];
</script>

<aside class="sidebar" role="navigation" aria-label="Folder navigation">
  <div class="sidebar-header">
    <h1 class="app-title">SimpleFile</h1>
    <button class="toolbar-btn" id="btn-settings" title="Settings" aria-label="Open settings" onclick={(e) => e.currentTarget?.dispatchEvent(new CustomEvent('simplefile:open-settings', { bubbles: true }))}>
      <span class="icon" aria-hidden="true">⚙️</span>
    </button>
  </div>

  <div class="sidebar-section smart-folders-section">
    <SmartFoldersList 
      smartFolders={appState.smartFolders || []} 
      onNavigate={(folder) => {
        document.dispatchEvent(new CustomEvent('simplefile:smart-folder-open', {
          bubbles: true,
          detail: { folder }
        }));
      }}
      onRemove={(id) => {
        document.dispatchEvent(new CustomEvent('simplefile:smart-folder-delete', {
          bubbles: true,
          detail: { id }
        }));
      }}
    />
  </div>


  <div class="sidebar-section quick-access-section">
    <div class="sidebar-section-header sidebar-section-header--collapsible">
      <span>Quick Access</span>
      <button
        type="button"
        class="sidebar-collapse-btn"
        aria-label={quickAccessCollapsed ? 'Expand Quick Access' : 'Collapse Quick Access'}
        aria-controls="quick-access-list"
        aria-expanded={!quickAccessCollapsed}
        title={quickAccessCollapsed ? 'Expand Quick Access' : 'Collapse Quick Access'}
        onclick={() => {
          quickAccessCollapsed = !quickAccessCollapsed;
        }}
      >
        <span class:collapsed={quickAccessCollapsed} class="sidebar-collapse-icon" aria-hidden="true">▾</span>
      </button>
    </div>
    <div class="quick-access-scroll">
      <div
        class="quick-access-list"
        id="quick-access-list"
        role="list"
        aria-label="Quick access locations"
        hidden={quickAccessCollapsed}
      >
        <QuickAccessList locations={quickAccessLocations} />
      </div>

      <div class="quick-access-group" id="my-pc-section">
        <div class="quick-access-group-header quick-access-group-header--collapsible">
          <span>My PC</span>
          <button
            type="button"
            class="sidebar-collapse-btn"
            aria-label={myPcCollapsed ? 'Expand My PC' : 'Collapse My PC'}
            aria-controls="my-pc-tree-container"
            aria-expanded={!myPcCollapsed}
            title={myPcCollapsed ? 'Expand My PC' : 'Collapse My PC'}
            onclick={() => {
              myPcCollapsed = !myPcCollapsed;
            }}
          >
            <span class:collapsed={myPcCollapsed} class="sidebar-collapse-icon" aria-hidden="true">▾</span>
          </button>
        </div>
        <div class="tree-view-container" id="my-pc-tree-container" hidden={myPcCollapsed}>
          <TreeView roots={treeRoots} />
        </div>
      </div>

    </div>
  </div>
</aside>
