<script lang="ts">
  import { onDestroy } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { marked } from 'marked';
  import hljs from 'highlight.js/lib/core';
  import bash from 'highlight.js/lib/languages/bash';
  import css from 'highlight.js/lib/languages/css';
  import javascript from 'highlight.js/lib/languages/javascript';
  import json from 'highlight.js/lib/languages/json';
  import markdown from 'highlight.js/lib/languages/markdown';
  import powershell from 'highlight.js/lib/languages/powershell';
  import python from 'highlight.js/lib/languages/python';
  import rust from 'highlight.js/lib/languages/rust';
  import typescript from 'highlight.js/lib/languages/typescript';
  import xml from 'highlight.js/lib/languages/xml';
  import 'highlight.js/styles/github-dark.css';

  import type { FileEntry, FilePreview } from '../../types';

  export type PreviewPaneMode = 'empty' | 'loading' | 'folder' | 'preview' | 'error';

  let {
    entry = null,
    error = '',
    mode = 'empty',
    preview = null,
  }: {
    entry?: FileEntry | null;
    error?: string;
    mode?: PreviewPaneMode;
    preview?: FilePreview | null;
  } = $props();

  let pdfUrl: string | null = $state(null);
  let activePdfUrl: string | null = null;
  let renderedMarkdown: string = $state("");
  let codeHtml: string = $state("");

  const extensionLanguages: Record<string, string> = {
    bash: 'bash',
    cjs: 'javascript',
    css: 'css',
    htm: 'xml',
    html: 'xml',
    js: 'javascript',
    json: 'json',
    jsx: 'javascript',
    md: 'markdown',
    mjs: 'javascript',
    ps1: 'powershell',
    py: 'python',
    rs: 'rust',
    svelte: 'xml',
    ts: 'typescript',
    tsx: 'typescript',
    xml: 'xml',
  };

  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('powershell', powershell);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('xml', xml);

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function revokePdfUrl() {
    if (activePdfUrl) {
      URL.revokeObjectURL(activePdfUrl);
      activePdfUrl = null;
    }

    pdfUrl = null;
  }

  function pdfBlobUrl(base64Content: string) {
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }

  $effect(() => {
    revokePdfUrl();
    renderedMarkdown = "";
    codeHtml = "";

    if (mode === 'preview') {
      if (preview?.file_type === 'pdf' && preview.content) {
        activePdfUrl = pdfBlobUrl(preview.content);
        pdfUrl = activePdfUrl;
      } else if (preview?.file_type === 'text' && preview.content) {
        const ext = entry?.name.split('.').pop()?.toLowerCase();
        if (ext === 'md' || ext === 'markdown') {
          renderedMarkdown = marked.parse(preview.content) as string;
        } else {
          try {
            const language = extensionLanguages[ext || ''];
            codeHtml = language
              ? hljs.highlight(preview.content, { language }).value
              : escapeHtml(preview.content);
          } catch (e) {
            codeHtml = escapeHtml(preview.content);
          }
        }
      }
    }

    return revokePdfUrl;
  });

  onDestroy(revokePdfUrl);
</script>

{#if mode === 'empty'}
  <div class="preview-placeholder">
    <span class="icon" aria-hidden="true">&#128065;</span>
    <span>Select a file to preview</span>
  </div>
{:else if mode === 'loading'}
  <div class="preview-placeholder">
    <span class="icon" aria-hidden="true">&#9203;</span>
    <span>Loading...</span>
  </div>
{:else if mode === 'folder'}
  <div class="preview-placeholder">
    <span class="preview-icon-large" aria-hidden="true">&#128193;</span>
  </div>
{:else if mode === 'error'}
  <div class="preview-placeholder">
    <span class="icon" aria-hidden="true">&#9888;</span>
    <span>{error}</span>
  </div>
{:else if preview?.file_type === 'image' && preview.content}
  <img class="preview-image" src={`data:${preview.mime_type};base64,${preview.content}`} alt={entry?.name || 'Preview'} />
{:else if preview?.file_type === 'video' && entry}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="preview-media" controls src={convertFileSrc(entry.path)}></video>
{:else if preview?.file_type === 'audio' && entry}
  <audio class="preview-media" controls src={convertFileSrc(entry.path)}></audio>
{:else if preview?.file_type === 'text'}
  {#if renderedMarkdown}
    <div class="preview-markdown markdown-body">{@html renderedMarkdown}</div>
  {:else if codeHtml}
    <pre class="preview-code hljs"><code>{@html codeHtml}</code></pre>
  {:else}
    <div class="preview-text">{preview.content || ''}</div>
  {/if}
{:else if preview?.file_type === 'pdf'}
  {#if pdfUrl}
    <embed class="preview-pdf" type="application/pdf" src={pdfUrl} />
  {:else}
    <div class="preview-placeholder">
      <span class="preview-icon-large" aria-hidden="true">&#128213;</span>
      <span>PDF too large to preview</span>
    </div>
  {/if}
{:else if preview}
  <div class="preview-placeholder">
    <span class="preview-icon-large" aria-hidden="true">&#128196;</span>
    <span>{preview.mime_type}</span>
  </div>
{:else}
  <div class="preview-placeholder">
    <span class="icon" aria-hidden="true">&#128065;</span>
    <span>Select a file to preview</span>
  </div>
{/if}

<style>
  .preview-media {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    outline: none;
    border-radius: 4px;
    background: #000;
  }
  .preview-markdown {
    padding: 1rem;
    overflow-y: auto;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .preview-code {
    margin: 0;
    padding: 1rem;
    overflow: auto;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    font-size: 13px;
    font-family: 'Consolas', 'Courier New', monospace;
  }
</style>

