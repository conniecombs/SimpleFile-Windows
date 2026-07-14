<script lang="ts">
  let {
    defaultName = 'archive.zip',
    format = 'zip',
    selectedNames = [],
  }: {
    defaultName?: string;
    format?: string;
    selectedNames?: string[];
  } = $props();

  const formats = [
    { label: 'ZIP (.zip)', value: 'zip' },
    { label: 'TAR (.tar)', value: 'tar' },
    { label: 'TAR.GZ (.tar.gz)', value: 'tar.gz' },
    { label: 'RAR (.rar)', value: 'rar' },
  ];
</script>

<div class="form-group">
  <label class="form-label" for="archive-name">Archive Name:</label>
  <input type="text" class="form-input" id="archive-name" placeholder="archive.zip" value={defaultName} />
</div>
<div class="form-group">
  <label class="form-label" for="archive-format">Format:</label>
  <select class="form-input" id="archive-format" value={format}>
    {#each formats as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>
<div class="form-group">
  <label class="form-label" for="archive-files-list">Files to compress:</label>
  <div id="archive-files-list" class="archive-files-preview">
    {#if selectedNames.length === 0}
      <div class="archive-file-item">
        <span class="icon" aria-hidden="true">📄</span>
        <span>No files selected</span>
      </div>
    {:else}
      {#each selectedNames as name, index (`${name}-${index}`)}
        <div class="archive-file-item">
          <span class="icon" aria-hidden="true">📄</span>
          <span>{name}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>
