<script lang="ts">
  export type BreadcrumbSegment = {
    current: boolean;
    label: string;
    path: string;
  };

  let {
    segments = [],
  }: {
    segments?: BreadcrumbSegment[];
  } = $props();

  const BREADCRUMB_FOCUS_EVENT = 'simplefile:breadcrumb-focus';
  const BREADCRUMB_NAVIGATE_EVENT = 'simplefile:breadcrumb-navigate';

  function emitBreadcrumbEvent(
    type: string,
    event: MouseEvent | KeyboardEvent,
    segment: BreadcrumbSegment,
    index: number,
    detail = {},
  ) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail: {
        index,
        isDir: true,
        path: segment.path,
        ...detail,
      },
    }));
  }

  function handleSegmentClick(event: MouseEvent, segment: BreadcrumbSegment, index: number) {
    emitBreadcrumbEvent(BREADCRUMB_NAVIGATE_EVENT, event, segment, index);
  }

  function handleSegmentKeydown(event: KeyboardEvent, segment: BreadcrumbSegment, index: number) {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        emitBreadcrumbEvent(BREADCRUMB_FOCUS_EVENT, event, segment, index, { direction: -1 });
        break;

      case 'ArrowRight':
        event.preventDefault();
        emitBreadcrumbEvent(BREADCRUMB_FOCUS_EVENT, event, segment, index, { direction: 1 });
        break;

      case 'Home':
        event.preventDefault();
        emitBreadcrumbEvent(BREADCRUMB_FOCUS_EVENT, event, segment, index, { targetIndex: 0 });
        break;

      case 'End':
        event.preventDefault();
        emitBreadcrumbEvent(BREADCRUMB_FOCUS_EVENT, event, segment, index, {
          targetIndex: segments.length - 1,
        });
        break;
    }
  }
</script>

{#each segments as segment, index (`${segment.path}-${index}`)}
  <button
    type="button"
    class={`breadcrumb-segment${segment.current ? ' current' : ''}`}
    data-path={segment.path}
    aria-current={segment.current ? 'page' : 'false'}
    onclick={(event) => handleSegmentClick(event, segment, index)}
    onkeydown={(event) => handleSegmentKeydown(event, segment, index)}
  >
    {segment.label}
  </button>
  {#if !segment.current}
    <span class="breadcrumb-separator" aria-hidden="true">/</span>
  {/if}
{/each}
