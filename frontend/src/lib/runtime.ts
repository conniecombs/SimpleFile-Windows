import { get, writable } from 'svelte/store';

import { createInitialAppState, type SimpleFileAppState } from './appState';

export type RuntimeActionHandler = (...args: unknown[]) => unknown;
export type RuntimeActionRegistry = Record<string, RuntimeActionHandler | undefined>;
export type RuntimeStateChangeListener = (
  property: string | symbol,
  value: unknown,
  oldValue: unknown,
) => void;
export type RuntimeStateSubscribe = (listener: RuntimeStateChangeListener) => () => void;

const defaultAppState = createInitialAppState();
const appStateKeys = new Set(Object.keys(defaultAppState));

let runtimeStateRef: SimpleFileAppState | null = null;
let runtimeStateUnsubscribe: (() => void) | null = null;
let runtimeActions: RuntimeActionRegistry = {};

export const appState = writable<SimpleFileAppState>(defaultAppState);
export const appActions = writable<RuntimeActionRegistry>(runtimeActions);

function snapshotState(state: SimpleFileAppState): SimpleFileAppState {
  return {
    ...createInitialAppState(),
    ...state,
  };
}

function isAppStateKey(property: string | symbol): property is keyof SimpleFileAppState {
  return typeof property === 'string' && appStateKeys.has(property);
}

export function registerRuntimeState(
  state: SimpleFileAppState,
  subscribe?: RuntimeStateSubscribe,
) {
  runtimeStateUnsubscribe?.();
  runtimeStateRef = state;
  appState.set(snapshotState(state));

  runtimeStateUnsubscribe = subscribe?.((property, value) => {
    if (!isAppStateKey(property)) {
      return;
    }

    appState.update((current) => ({
      ...current,
      [property]: value,
    }));
  }) ?? null;

  return () => {
    runtimeStateUnsubscribe?.();
    runtimeStateUnsubscribe = null;
    if (runtimeStateRef === state) {
      runtimeStateRef = null;
    }
  };
}

export function getRuntimeState() {
  return runtimeStateRef;
}

export function readRuntimeState() {
  return runtimeStateRef ?? get(appState);
}

export function setRuntimeStateValue<Key extends keyof SimpleFileAppState>(
  key: Key,
  value: SimpleFileAppState[Key],
) {
  if (runtimeStateRef) {
    runtimeStateRef[key] = value;
    return;
  }

  appState.update((current) => ({
    ...current,
    [key]: value,
  }));
}

export function patchRuntimeState(patch: Partial<SimpleFileAppState>) {
  if (runtimeStateRef) {
    Object.assign(runtimeStateRef, patch);
    return;
  }

  appState.update((current) => ({
    ...current,
    ...patch,
  }));
}

export function registerRuntimeActions(actions: RuntimeActionRegistry) {
  runtimeActions = actions;
  appActions.set(runtimeActions);
  return runtimeActions;
}

export function getRuntimeActions() {
  return runtimeActions;
}

export function hasRuntimeAction(name: string) {
  return typeof runtimeActions[name] === 'function';
}

export function runRuntimeAction(name: string, ...args: unknown[]) {
  return runtimeActions[name]?.(...args);
}
