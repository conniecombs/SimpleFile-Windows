import type { LocalCommandWorkflowHost } from './localCommandWorkflow';

export async function setColorLabel(host: LocalCommandWorkflowHost): Promise<void> {
  const { state, api, ui } = host;

  if (state.selectedEntries.size === 0) {
    ui.showError('No files selected.');
    return;
  }

  // Convert selected entries from Set to Array to get the paths
  const paths = Array.from(state.selectedEntries);

  if (!state.tags || state.tags.length === 0) {
    ui.showError('No tags available. Create tags in Settings first.');
    return;
  }

  // Create UI for selecting a tag
  let html = '<div class="tags-selector" style="display:flex;flex-wrap:wrap;gap:8px;">';
  for (const tag of state.tags) {
    html += `
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="radio" name="selected_tag" value="${tag.id}" />
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background-color:${tag.color}"></span>
        <span>${tag.name}</span>
      </label>
    `;
  }
  html += `
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
        <input type="radio" name="selected_tag" value="none" checked />
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid #ccc"></span>
        <span>None (Remove Label)</span>
      </label>
  `;
  html += '</div>';

  const confirmed = await ui.showModal('Set Color Label', html, 'Apply', true);
  if (!confirmed) {
    return;
  }

  const selectedOption = document.querySelector('input[name="selected_tag"]:checked') as HTMLInputElement | null;
  if (!selectedOption) return;

  const tagId = selectedOption.value;

  try {
    for (const path of paths) {
      if (tagId === 'none') {
        await api.setTagsForPath(path, []);
        delete state.fileTags[path];
      } else {
        await api.setTagsForPath(path, [parseInt(tagId, 10)]);
        const tag = state.tags.find(t => t.id == tagId);
        if (tag) {
          state.fileTags[path] = tag;
        }
      }
    }
    
    // Dispatch event to force UI update
    document.dispatchEvent(new CustomEvent('simplefile:tags-updated'));
    ui.showSuccess('Labels updated successfully');
  } catch (err) {
    ui.showError('Failed to set labels: ' + err);
  }
}
