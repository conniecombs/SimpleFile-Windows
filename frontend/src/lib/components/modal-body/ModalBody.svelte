<script lang="ts">
  let { bodyHtml = '' }: { bodyHtml?: string } = $props();
</script>

{@html bodyHtml}
