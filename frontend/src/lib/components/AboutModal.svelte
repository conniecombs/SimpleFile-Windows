<script lang="ts">
  import { openExternalUrl } from '../api';
  import {
    aboutUi,
    closeAboutUi,
  } from '../app/aboutUi.svelte';
  import { showError } from './toasts';

  const info = $derived(aboutUi.info);
  const productName = $derived(info?.product_name || 'SimpleFile');
  const version = $derived(info?.version || (aboutUi.loading ? 'Checking…' : '—'));
  const description = $derived(
    info?.description
      || 'A fast Windows file explorer for local files, archives, dual-pane workflows, search, previews, and metadata.',
  );
  const identifier = $derived(info?.identifier || 'com.simplefile.desktop');
  const buildProfile = $derived(info?.build_profile || (aboutUi.loading ? 'Loading…' : '—'));
  const platform = $derived(
    info
      ? `${info.platform} ${info.architecture}`.trim()
      : (aboutUi.loading ? 'Loading…' : '—'),
  );
  const framework = $derived(info?.framework || 'Tauri 2');
  const runtime = $derived(info?.runtime || 'Rust backend + WebView frontend');
  const authors = $derived(info?.authors || 'SimpleFile Team');
  const repository = $derived(
    info?.repository || 'https://github.com/conniecombs/SimpleFile-Windows',
  );

  function handleClose(event?: Event) {
    event?.preventDefault();
    closeAboutUi();
  }

  async function handleRepositoryClick(event: MouseEvent) {
    event.preventDefault();
    try {
      await openExternalUrl(repository);
    } catch (error) {
      showError(error);
    }
  }

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose(event);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!aboutUi.visible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(event);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="modal-overlay"
  class:visible={aboutUi.visible}
  id="about-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="about-heading"
  aria-hidden={!aboutUi.visible}
  onmousedown={handleOverlayMouseDown}
>
  <div class="modal about-modal">
    <div class="modal-header">
      <h3 id="about-heading">About SimpleFile</h3>
      <button
        type="button"
        class="modal-close"
        id="about-close"
        aria-label="Close about dialog"
        onclick={handleClose}
      >&times;</button>
    </div>
    <div class="modal-body about-body">
      <div class="about-hero">
        <div class="about-logo" aria-hidden="true">SF</div>
        <div class="about-heading">
          <h2 class="about-title">{productName}</h2>
          <p class="about-version">Version <span id="about-version-value">{version}</span></p>
          <p class="about-description">{description}</p>
        </div>
      </div>

      <div class="about-details" aria-label="Application details">
        <div class="about-detail-row">
          <span>Application ID</span>
          <strong id="about-identifier-value">{identifier}</strong>
        </div>
        <div class="about-detail-row">
          <span>Build</span>
          <strong id="about-build-value">{buildProfile}</strong>
        </div>
        <div class="about-detail-row">
          <span>Platform</span>
          <strong id="about-platform-value">{platform}</strong>
        </div>
        <div class="about-detail-row">
          <span>Framework</span>
          <strong id="about-framework-value">{framework}</strong>
        </div>
        <div class="about-detail-row">
          <span>Runtime</span>
          <strong id="about-runtime-value">{runtime}</strong>
        </div>
        <div class="about-detail-row">
          <span>Maintainer</span>
          <strong id="about-authors-value">{authors}</strong>
        </div>
        <div class="about-detail-row">
          <span>License</span>
          <strong id="about-license-value">Proprietary - All Rights Reserved</strong>
        </div>
      </div>

      <section class="about-section">
        <h4>What SimpleFile Includes</h4>
        <ul class="about-feature-list">
          <li>Tabbed and dual-pane file management</li>
          <li>Bookmarks, recent locations, search, and quick filtering</li>
          <li>Archive creation, extraction, previews, metadata, and checksums</li>
          <li>Integrated terminal, cleanup tools, Git status, and open-with workflows</li>
        </ul>
      </section>

      <section class="about-section">
        <h4>Project</h4>
        <p id="about-description-value">{description}</p>
        <div class="about-link-row">
          <button
            type="button"
            class="about-link-btn"
            id="about-repository-link"
            data-about-url={repository}
            onclick={handleRepositoryClick}
          >Project repository</button>
        </div>
      </section>

      <p class="about-copyright">SimpleFile Team and contributors.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-primary" id="about-ok" onclick={handleClose}>OK</button>
    </div>
  </div>
</div>
