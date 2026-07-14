import legacyIndexHtml from './legacy-shell-template.html?raw';

const legacyBodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(legacyIndexHtml);

if (!legacyBodyMatch) {
  throw new Error('Could not find legacy SimpleFile body markup');
}

const template = document.createElement('template');
template.innerHTML = legacyBodyMatch[1];
template.content.querySelectorAll('script, .app-container, #settings-overlay').forEach((element) => {
  element.remove();
});

export const legacyOverlayMarkup = template.innerHTML.trim();
