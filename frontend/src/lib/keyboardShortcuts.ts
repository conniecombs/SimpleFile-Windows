export type ShortcutHandler = (event: KeyboardEvent) => void | Promise<void>;

export type ShortcutOptions = {
  allowInEditable?: boolean;
  allowInControls?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  when?: (event: KeyboardEvent) => boolean;
};

export type ShortcutRegistration = {
  combo: string;
  defaultCombo: string;
  handler: ShortcutHandler;
  id: string;
  normalizedCombo: string;
  normalizedDefaultCombo: string;
  options: Required<Omit<ShortcutOptions, 'when'>> & Pick<ShortcutOptions, 'when'>;
};

export type ShortcutDefinition = {
  combo: string;
  defaultCombo: string;
  id: string;
};

export const ShortcutRegistry = new Map<string, ShortcutRegistration>();

const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const modifierAliases = new Map([
  ['control', 'Ctrl'],
  ['ctrl', 'Ctrl'],
  ['cmd', 'Meta'],
  ['command', 'Meta'],
  ['meta', 'Meta'],
  ['option', 'Alt'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
]);

const keyAliases = new Map([
  [' ', 'Space'],
  ['spacebar', 'Space'],
  ['esc', 'Escape'],
  ['escape', 'Escape'],
  ['del', 'Delete'],
  ['delete', 'Delete'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['arrowup', 'Up'],
  ['up', 'Up'],
  ['arrowdown', 'Down'],
  ['down', 'Down'],
  ['arrowleft', 'Left'],
  ['left', 'Left'],
  ['arrowright', 'Right'],
  ['right', 'Right'],
  ['tab', 'Tab'],
]);

function normalizeKeyName(key: string) {
  const trimmedKey = key.trim();
  const alias = keyAliases.get(trimmedKey.toLowerCase());
  if (alias) return alias;
  if (/^f\d{1,2}$/i.test(trimmedKey)) return trimmedKey.toUpperCase();
  if (trimmedKey.length === 1) return trimmedKey.toUpperCase();
  return trimmedKey.slice(0, 1).toUpperCase() + trimmedKey.slice(1);
}

export function normalizeShortcutCombo(combo: string) {
  const parts = combo
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const modifiers = new Set<string>();
  let key = '';

  for (const part of parts) {
    const modifier = modifierAliases.get(part.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    key = normalizeKeyName(part);
  }

  if (!key) {
    throw new Error(`Shortcut combo "${combo}" must include a key.`);
  }

  if (key === '?' && !modifiers.has('Shift')) {
    modifiers.add('Shift');
  }

  return [
    ...modifierOrder.filter((modifier) => modifiers.has(modifier)),
    key,
  ].join('+');
}

export function validateShortcutCombo(combo: string) {
  return normalizeShortcutCombo(combo);
}

export function comboFromKeyboardEvent(event: KeyboardEvent) {
  const modifiers = new Set<string>();
  if (event.ctrlKey) modifiers.add('Ctrl');
  if (event.altKey) modifiers.add('Alt');
  if (event.shiftKey) modifiers.add('Shift');
  if (event.metaKey) modifiers.add('Meta');

  const key = normalizeKeyName(event.key === ' ' ? 'Space' : event.key);
  return [
    ...modifierOrder.filter((modifier) => modifiers.has(modifier)),
    key,
  ].join('+');
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  const editable = target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]');
  if (!editable) return false;

  if (editable instanceof HTMLInputElement) {
    return ![
      'button',
      'checkbox',
      'color',
      'file',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(editable.type);
  }

  return true;
}

function isControlTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest('button, a[href], summary, [role="button"], [role="menuitem"], [role="tab"]'));
}

function isDevToolsShortcut(event: KeyboardEvent) {
  if (!import.meta.env.DEV) return false;

  const key = normalizeKeyName(event.key);
  if (key === 'F12') return true;
  if (!event.ctrlKey || !event.shiftKey) return false;
  return ['C', 'I', 'J', 'K'].includes(key);
}

export function registerShortcut(
  id: string,
  defaultCombo: string,
  handler: ShortcutHandler,
  options: ShortcutOptions = {},
) {
  const normalizedCombo = normalizeShortcutCombo(defaultCombo);
  ShortcutRegistry.set(id, {
    combo: defaultCombo,
    defaultCombo,
    handler,
    id,
    normalizedCombo,
    normalizedDefaultCombo: normalizedCombo,
    options: {
      allowInControls: options.allowInControls ?? false,
      allowInEditable: options.allowInEditable ?? false,
      preventDefault: options.preventDefault ?? true,
      stopPropagation: options.stopPropagation ?? false,
      when: options.when,
    },
  });
}

export function unregisterShortcut(id: string) {
  ShortcutRegistry.delete(id);
}

export function updateShortcutCombo(id: string, combo: string) {
  const shortcut = ShortcutRegistry.get(id);
  if (!shortcut) {
    throw new Error(`Shortcut "${id}" is not registered.`);
  }

  const normalizedCombo = normalizeShortcutCombo(combo);
  shortcut.combo = normalizedCombo;
  shortcut.normalizedCombo = normalizedCombo;
}

export function resetShortcutCombo(id: string) {
  const shortcut = ShortcutRegistry.get(id);
  if (!shortcut) {
    throw new Error(`Shortcut "${id}" is not registered.`);
  }

  shortcut.combo = shortcut.defaultCombo;
  shortcut.normalizedCombo = shortcut.normalizedDefaultCombo;
}

export function findShortcutConflict(id: string, combo: string) {
  const normalizedCombo = normalizeShortcutCombo(combo);
  const currentShortcut = ShortcutRegistry.get(id);
  for (const shortcut of ShortcutRegistry.values()) {
    if (currentShortcut?.options.when || shortcut.options.when) continue;
    if (shortcut.id !== id && shortcut.normalizedCombo === normalizedCombo) {
      return shortcut;
    }
  }

  return null;
}

export function getShortcutMap() {
  const shortcutMap: Record<string, string> = {};
  for (const shortcut of ShortcutRegistry.values()) {
    shortcutMap[shortcut.id] = shortcut.combo;
  }
  return shortcutMap;
}

export function getShortcutDefinitions() {
  return [...ShortcutRegistry.values()].map((shortcut): ShortcutDefinition => ({
    combo: shortcut.combo,
    defaultCombo: shortcut.defaultCombo,
    id: shortcut.id,
  }));
}

export function handleKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || isDevToolsShortcut(event)) {
    return;
  }

  const combo = comboFromKeyboardEvent(event);
  const editableTarget = isEditableTarget(event.target);
  const controlTarget = isControlTarget(event.target);

  for (const shortcut of ShortcutRegistry.values()) {
    if (shortcut.normalizedCombo !== combo) continue;
    if (editableTarget && !shortcut.options.allowInEditable) continue;
    if (controlTarget && !shortcut.options.allowInControls) continue;
    if (shortcut.options.when && !shortcut.options.when(event)) continue;

    if (shortcut.options.preventDefault) {
      event.preventDefault();
    }
    if (shortcut.options.stopPropagation) {
      event.stopPropagation();
    }

    void Promise.resolve(shortcut.handler(event)).catch((error) => {
      console.error(`Shortcut "${shortcut.id}" failed:`, error);
    });
    return;
  }
}
