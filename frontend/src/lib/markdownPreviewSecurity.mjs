import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const markdownPreviewSanitizeOptions = {
  allowedTags: [
    'a',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
};

export function renderSafeMarkdown(markdown) {
  const rendered = marked.parse(markdown, { async: false });
  return sanitizeHtml(String(rendered), markdownPreviewSanitizeOptions);
}
