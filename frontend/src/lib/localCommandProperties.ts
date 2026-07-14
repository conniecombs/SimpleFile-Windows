import type { LocalCommandWorkflowHost } from './localCommandWorkflow';
import { firstSelectedPath } from './localCommandSelection';

function setText(documentRef: Document, id: string, text: string) {
  const element = documentRef.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

export async function showProperties(host: LocalCommandWorkflowHost, documentRef: Document) {
  const { state, api, ui, t } = host;

  if (state.selectedEntries.size !== 1) return;

  const path = firstSelectedPath(state);
  if (!path) return;

  try {
    const info = await api.getEntryInfo(path);
    const symlinkRow = info.is_symlink
      ? `<div class="prop-label">Symlink target</div><div class="prop-value">${host.escapeHtml(info.symlink_target || '(unknown)')}</div>`
      : '';
    const permissionsRow = info.permissions
      ? `<div class="prop-label">Permissions</div><div class="prop-value prop-permissions">${host.escapeHtml(info.permissions)}</div>`
      : '';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    const isImage = !info.is_dir && imageExts.includes(info.extension.toLowerCase());
    const imageMetadataPlaceholder = isImage ? `
                <div class="prop-label">Dimensions</div><div class="prop-value" id="prop-dimensions">Computing\u2026</div>
                <div class="prop-label">EXIF</div><div class="prop-value" id="prop-exif">Computing\u2026</div>
            ` : '';
    const checksumPlaceholder = info.is_dir ? '' : `
                <div class="prop-label">MD5</div><div class="prop-value" id="prop-md5">Computing\u2026</div>
                <div class="prop-label">SHA-1</div><div class="prop-value" id="prop-sha1">Computing\u2026</div>
                <div class="prop-label">SHA-256</div><div class="prop-value prop-hash" id="prop-sha256">Computing\u2026</div>
            `;

    const content = `
                <div class="properties-grid">
                    <div class="prop-label">${t('prop_name')}</div>
                    <div class="prop-value">${host.escapeHtml(info.name)}</div>
                    <div class="prop-label">${t('prop_path')}</div>
                    <div class="prop-value">${host.escapeHtml(info.path)}</div>
                    <div class="prop-label">${t('prop_size')}</div>
                    <div class="prop-value">${host.formatSize(info.size)}</div>
                    <div class="prop-label">${t('prop_modified')}</div>
                    <div class="prop-value">${info.modified}</div>
                    <div class="prop-label">${t('prop_type')}</div>
                    <div class="prop-value">${info.is_dir ? t('folder') : t('file_type', { ext: info.extension.toUpperCase() })}</div>
                    ${permissionsRow}
                    ${symlinkRow}
                    ${imageMetadataPlaceholder}
                    ${checksumPlaceholder}
                </div>
            `;
    void ui.showModal(t('properties_title'), content, t('ok'), false);

    if (!info.is_dir) {
      api.computeChecksum(path).then((hashes) => {
        setText(documentRef, 'prop-md5', hashes.md5);
        setText(documentRef, 'prop-sha1', hashes.sha1);
        setText(documentRef, 'prop-sha256', hashes.sha256);
      }).catch(() => {
        setText(documentRef, 'prop-md5', 'Unavailable');
      });
    }

    if (isImage) {
      api.getImageMetadata(path).then((meta) => {
        setText(documentRef, 'prop-dimensions', `${meta.width} \u00d7 ${meta.height}`);
        const exifEl = documentRef.getElementById('prop-exif');
        if (!exifEl) return;

        if (Array.isArray(meta.exif) && meta.exif.length > 0) {
          const container = documentRef.createElement('div');
          container.className = 'exif-grid';
          meta.exif.forEach(([tag, value]) => {
            const tagDiv = documentRef.createElement('div');
            tagDiv.className = 'exif-tag';
            tagDiv.textContent = tag;
            const valDiv = documentRef.createElement('div');
            valDiv.className = 'exif-value';
            valDiv.textContent = value;
            container.appendChild(tagDiv);
            container.appendChild(valDiv);
          });
          exifEl.textContent = '';
          exifEl.appendChild(container);
        } else {
          exifEl.textContent = 'None';
        }
      }).catch(() => {
        setText(documentRef, 'prop-dimensions', 'Unavailable');
        setText(documentRef, 'prop-exif', 'Unavailable');
      });
    }
  } catch (error) {
    ui.showError(error);
  }
}
