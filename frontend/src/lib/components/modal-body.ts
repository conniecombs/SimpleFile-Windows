import { mount, unmount } from 'svelte';

import ModalBody from './modal-body/ModalBody.svelte';

export type RenderModalBodyProps = {
  bodyHtml?: string;
};

const mountedModalBodies = new WeakMap<Element, ReturnType<typeof mount>>();

export function clearModalBody(target: Element | null | undefined) {
  if (!target) {
    return;
  }

  const component = mountedModalBodies.get(target);
  if (component) {
    unmount(component);
    mountedModalBodies.delete(target);
  }

  target.replaceChildren();
}

export function renderModalBody(
  target: Element | null | undefined,
  props: RenderModalBodyProps = {},
) {
  if (!target) {
    return;
  }

  clearModalBody(target);
  const component = mount(ModalBody, {
    target,
    props: {
      bodyHtml: props.bodyHtml ?? '',
    },
  });

  mountedModalBodies.set(target, component);
}
