<script lang="ts">
  import { sanitizeModalHtml } from '../../modalHtmlSecurity.mjs';

  let { bodyHtml = '' }: { bodyHtml?: string } = $props();
  const sanitizedBodyHtml = $derived(sanitizeModalHtml(bodyHtml));
</script>

{@html sanitizedBodyHtml}
