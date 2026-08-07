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
import { state as appState } from '../../../vanilla-js/runtime/state.svelte';
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

  function driveStatus(drive: DriveInfo) {
    const status = String(drive.drive_status || 'available').toLowerCase();
    return ['available', 'offline', 'stale', 'unknown'].includes(status) ? status : 'unknown';
  }

  function driveBadge(drive: DriveInfo) {
    const status = driveStatus(drive);
    if (status === 'offline') return 'Offline';
    if (status === 'stale') return 'Stale';
    if (status === 'unknown') return 'Unknown';
    return '';
  }

  function driveDescription(drive: DriveInfo) {
    const status = driveStatus(drive);
    const type = String(drive.drive_type || '').toLowerCase();
    if (status === 'offline') {
      const detail = String(drive.status_detail || '').trim();
      if (detail.toLowerCase().includes('timed out')) return 'Timed out · Retry to reconnect';
      if (detail.toLowerCase().includes('access was denied')) return 'Access denied · Check credentials';
      if (detail.toLowerCase().includes('not ready')) return 'Not ready · Open to reconnect';
      return drive.remote_path ? `Offline · ${drive.remote_path}` : 'Offline · Retry to reconnect';
    }
    if (status === 'stale') return 'Stale mapping · Remap or remove';
    if (type === 'network') return drive.remote_path || drive.status_detail || 'Network share';
    return '';
  }

  function driveTitle(drive: DriveInfo) {
    return [
      drive.name || drive.path,
      drive.remote_path ? `Share: ${drive.remote_path}` : '',
      drive.status_detail,
      driveStatus(drive) !== 'available' ? 'Click to retry reconnecting this drive.' : '',
    ].filter(Boolean).join('\n');
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
      badge: driveBadge(drive),
      children: (appState.treeData?.get(drive.path) || []).map(toTreeNode),
      description: driveDescription(drive),
      hasChildren: driveStatus(drive) === 'available',
      icon: driveIcon(drive),
      isActive: appState.currentPath === drive.path || appState.currentPath?.startsWith(drive.path),
      isExpanded: appState.treeExpanded?.has(drive.path) || false,
      isLoaded: appState.treeData?.has(drive.path) || false,
      name: drive.name || drive.path,
      path: drive.path,
      status: driveStatus(drive),
      title: driveTitle(drive)
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
          <div class="quick-access-group-actions">
            <button
              type="button"
              class="sidebar-collapse-btn"
              id="btn-refresh-drives"
              aria-label="Refresh drives"
              title="Refresh drives and mapped network status"
              onclick={() => {
                document.dispatchEvent(new CustomEvent('simplefile:refresh-drives', { bubbles: true }));
              }}
            >
              <span class="sidebar-action-icon" aria-hidden="true">↻</span>
            </button>
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
        </div>
        <div class="tree-view-container" id="my-pc-tree-container" hidden={myPcCollapsed}>
          <TreeView roots={treeRoots} />
        </div>
      </div>

    </div>
  </div>
</aside>
