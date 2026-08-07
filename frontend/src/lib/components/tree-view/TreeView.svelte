<script lang="ts">
  export type TreeViewNode = {
    badge?: string;
    children: TreeViewNode[];
    description?: string;
    hasChildren: boolean;
    icon: string;
    isActive: boolean;
    isExpanded: boolean;
    isLoaded: boolean;
    name: string;
    path: string;
    status?: string;
    title?: string;
  };

  let {
    roots = [],
  }: {
    roots?: TreeViewNode[];
  } = $props();

  const TREE_NODE_FOCUS_MOVE_EVENT = 'simplefile:tree-node-focus-move';
  const TREE_NODE_FOCUS_PARENT_EVENT = 'simplefile:tree-node-focus-parent';
  const TREE_NODE_OPEN_EVENT = 'simplefile:tree-node-open';
  const TREE_NODE_TOGGLE_EVENT = 'simplefile:tree-node-toggle';

  function expandClass(node: TreeViewNode) {
    if (!node.hasChildren) {
      return 'tree-expand empty';
    }

    return `tree-expand${node.isExpanded ? ' expanded' : ''}`;
  }

  function itemClass(node: TreeViewNode) {
    const statusClass = node.status ? ` status-${node.status}` : '';
    return `tree-item${node.isActive ? ' active' : ''}${statusClass}`;
  }

  function emitTreeEvent(type: string, event: MouseEvent | KeyboardEvent, node: TreeViewNode, detail = {}) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: {
        hasChildren: node.hasChildren,
        isDir: true,
        isExpanded: node.isExpanded,
        path: node.path,
        ...detail,
      },
    }));
  }

  function handleExpandClick(event: MouseEvent, node: TreeViewNode) {
    event.preventDefault();
    event.stopPropagation();
    emitTreeEvent(TREE_NODE_TOGGLE_EVENT, event, node);
  }

  function handleItemClick(event: MouseEvent, node: TreeViewNode) {
    emitTreeEvent(TREE_NODE_OPEN_EVENT, event, node);
  }

  function handleItemKeydown(event: KeyboardEvent, node: TreeViewNode) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        emitTreeEvent(TREE_NODE_FOCUS_MOVE_EVENT, event, node, { direction: 1 });
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        emitTreeEvent(TREE_NODE_FOCUS_MOVE_EVENT, event, node, { direction: -1 });
        break;

      case 'ArrowRight':
        if (node.hasChildren && !node.isExpanded) {
          event.preventDefault();
          event.stopPropagation();
          emitTreeEvent(TREE_NODE_TOGGLE_EVENT, event, node);
        }
        break;

      case 'ArrowLeft':
        event.preventDefault();
        event.stopPropagation();
        if (node.hasChildren && node.isExpanded) {
          emitTreeEvent(TREE_NODE_TOGGLE_EVENT, event, node);
        } else {
          emitTreeEvent(TREE_NODE_FOCUS_PARENT_EVENT, event, node);
        }
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        emitTreeEvent(TREE_NODE_OPEN_EVENT, event, node);
        break;
    }
  }
</script>

{#snippet treeSkeleton(depth: number)}
  <div class="tree-children" role="group">
    {#each [0, 1, 2] as index (index)}
      <div class="skeleton-tree-item" data-depth={depth + 1}>
        <div class="skeleton skeleton-expand"></div>
        <div class="skeleton skeleton-folder"></div>
        <div class="skeleton skeleton-tree-name"></div>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet treeNode(node: TreeViewNode, depth: number)}
  <div class="tree-node" data-path={node.path}>
    <div
      class={itemClass(node)}
      data-path={node.path}
      data-depth={depth}
      role="treeitem"
      aria-expanded={node.isExpanded}
      aria-selected={node.isActive}
      tabindex={0}
      title={node.title || node.path}
      onclick={(event) => handleItemClick(event, node)}
      onkeydown={(event) => handleItemKeydown(event, node)}
    >
      {#if node.hasChildren}
        <button
          type="button"
          class={expandClass(node)}
          data-path={node.path}
          aria-label={node.isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          tabindex="-1"
          onclick={(event) => handleExpandClick(event, node)}
        >&#9654;</button>
      {:else}
        <span class="tree-expand empty" data-path={node.path} aria-hidden="true">&#9654;</span>
      {/if}
      <span class="tree-icon" aria-hidden="true">{node.icon}</span>
      <span class="tree-label">
        <span class="tree-name-row">
          <span class="tree-name">{node.name}</span>
          {#if node.badge}
            <span
              class={`tree-status-badge tree-status-badge--${node.status || 'unknown'}`}
              title={node.title || node.description || node.badge}
            >{node.badge}</span>
          {/if}
        </span>
        {#if node.description}
          <span class="tree-description">{node.description}</span>
        {/if}
      </span>
    </div>

    {#if node.hasChildren}
      {#if node.isExpanded && !node.isLoaded}
        {@render treeSkeleton(depth)}
      {:else if node.children.length > 0}
        <div class={`tree-children${node.isExpanded ? '' : ' collapsed'}`} role="group">
          {#each node.children as child (child.path)}
            {@render treeNode(child, depth + 1)}
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#each roots as root (root.path)}
  {@render treeNode(root, 0)}
{/each}
