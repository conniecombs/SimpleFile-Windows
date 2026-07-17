import type sanitizeHtml from 'sanitize-html';

export const markdownPreviewSanitizeOptions: sanitizeHtml.IOptions;

export function renderSafeMarkdown(markdown: string): string;
