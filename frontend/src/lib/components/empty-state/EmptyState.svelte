<script lang="ts">
  let {
    className = 'empty-state',
    message = 'This folder is empty',
  }: {
    className?: string;
    message?: string;
  } = $props();
</script>

<div class={className}>{message}</div>
