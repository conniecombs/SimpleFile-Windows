<script lang="ts">
  export type TabView = {
    id: string;
    path: string;
    title: string;
  };

  let {
    activeTabId = null,
    tabs = [],
  }: {
    activeTabId?: string | null;
    tabs?: TabView[];
  } = $props();

  const TAB_CLOSE_EVENT = 'simplefile:tab-close';
  const TAB_FOCUS_MOVE_EVENT = 'simplefile:tab-focus-move';
  const TAB_NEW_EVENT = 'simplefile:tab-new';
  const TAB_SWITCH_EVENT = 'simplefile:tab-switch';

  function isActive(tab: TabView) {
    return tab.id === activeTabId;
  }

  function hasActiveTab() {
    return tabs.some((tab) => tab.id === activeTabId);
  }

  function emitTabEvent(type: string, event: MouseEvent | KeyboardEvent, detail = {}) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail,
    }));
  }

  function handleTabClick(event: MouseEvent, tab: TabView) {
    emitTabEvent(TAB_SWITCH_EVENT, event, { tabId: tab.id });
  }

  function handleTabAuxClick(event: MouseEvent, tab: TabView) {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    emitTabEvent(TAB_CLOSE_EVENT, event, { tabId: tab.id });
  }

  function handleTabKeydown(event: KeyboardEvent, tab: TabView) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        emitTabEvent(TAB_SWITCH_EVENT, event, { tabId: tab.id });
        break;

      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        emitTabEvent(TAB_CLOSE_EVENT, event, { tabId: tab.id });
        break;

      case 'ArrowLeft':
        event.preventDefault();
        emitTabEvent(TAB_FOCUS_MOVE_EVENT, event, { direction: -1, tabId: tab.id });
        break;

      case 'ArrowRight':
        event.preventDefault();
        emitTabEvent(TAB_FOCUS_MOVE_EVENT, event, { direction: 1, tabId: tab.id });
        break;
    }
  }

  function handleCloseClick(event: MouseEvent, tab: TabView) {
    event.preventDefault();
    event.stopPropagation();
    emitTabEvent(TAB_CLOSE_EVENT, event, { tabId: tab.id });
  }

  function handleNewClick(event: MouseEvent) {
    emitTabEvent(TAB_NEW_EVENT, event);
  }
</script>

{#each tabs as tab (tab.id)}
  <div
    class={`tab${isActive(tab) ? ' active' : ''}`}
    data-tab-id={tab.id}
    role="tab"
    aria-selected={isActive(tab)}
    tabindex={isActive(tab) ? 0 : -1}
    onclick={(event) => handleTabClick(event, tab)}
    onauxclick={(event) => handleTabAuxClick(event, tab)}
    onkeydown={(event) => handleTabKeydown(event, tab)}
  >
    <span class="tab-icon" aria-hidden="true">&#128193;</span>
    <span class="tab-title" title={tab.path}>{tab.title}</span>
    <button
      type="button"
      class="tab-close"
      data-tab-id={tab.id}
      title="Close Tab"
      aria-label="Close tab"
      onclick={(event) => handleCloseClick(event, tab)}
    >
      &times;
    </button>
  </div>

  {#if isActive(tab)}
    <button type="button" class="tab-new-btn" title="New Tab" aria-label="Open new tab" onclick={handleNewClick}>+</button>
  {/if}
{/each}

{#if !hasActiveTab()}
  <button type="button" class="tab-new-btn" title="New Tab" aria-label="Open new tab" onclick={handleNewClick}>+</button>
{/if}
