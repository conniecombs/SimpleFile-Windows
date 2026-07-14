import { mount, unmount } from 'svelte';

import SettingsBody from './settings-body/SettingsBody.svelte';

export type SettingsTab = 'general' | 'tools' | 'updates';

export type RenderSettingsBodyProps = {
  activeTab?: SettingsTab;
};

const mountedSettingsBodies = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearSettingsBody(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedSettingsBodies.get(target);
  if (component) {
    unmount(component);
    mountedSettingsBodies.delete(target);
  }

  delete (target as HTMLElement).dataset.svelteSettingsBody;
  target.replaceChildren();
}

export function renderSettingsBody(
  target: Element | null | undefined,
  props: RenderSettingsBodyProps = {},
) {
  if (!target) {
    return;
  }

  clearSettingsBody(target);
  const component = mount(SettingsBody, {
    target,
    props: {
      activeTab: props.activeTab ?? 'general',
    },
  });

  (target as HTMLElement).dataset.svelteSettingsBody = 'true';
  mountedSettingsBodies.set(target, component);
}
