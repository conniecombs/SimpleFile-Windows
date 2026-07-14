import assert from 'node:assert/strict';

globalThis.$state ??= (value) => value;

const {
  loadSettings,
  loadTabs,
  resetState,
  saveSettings,
  saveTabs,
  state,
} = await import('../frontend/src/vanilla-js/runtime/state.svelte.js');
const { resolveStartupLocation } = await import('../frontend/src/vanilla-js/runtime/startup-location.js');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

global.localStorage = createMemoryStorage();

function tab(id, path, history = [], historyIndex = -1) {
  return { id, path, title: path, history, historyIndex };
}

const homePath = 'C:\\Users\\Tester';
const customPath = 'R:\\Smoke\\Custom Start';
const oldPath = 'C:\\Old\\Last Used';
const activePath = 'D:\\Active\\Last Used';

resetState();
state.theme = 'light';
state.settings = {
  ...state.settings,
  startLocation: 'custom',
  customPath,
};
saveSettings();

resetState();
loadSettings();
assert.equal(state.theme, 'light');
assert.equal(state.settings.startLocation, 'custom');
assert.equal(state.settings.customPath, customPath);

state.tabs = [
  tab('tab-old', oldPath),
  tab('tab-active', activePath, [homePath, activePath], 1),
];
state.activeTabId = 'tab-active';
saveTabs();

resetState();
assert.equal(loadTabs(), true);
assert.equal(state.activeTabId, 'tab-active');
assert.equal(state.tabs.length, 2);

assert.deepEqual(
  resolveStartupLocation({
    settings: { startLocation: 'custom', customPath },
    homePath,
    tabsLoaded: true,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  }),
  {
    mode: 'custom',
    startPath: customPath,
    tabs: [],
    activeTabId: null,
    history: [],
    historyIndex: -1,
    shouldRenderTabs: false,
  }
);

assert.equal(
  resolveStartupLocation({
    settings: { startLocation: 'custom', customPath: '   ' },
    homePath,
    tabsLoaded: true,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
  }).startPath,
  homePath
);

const lastStartup = resolveStartupLocation({
  settings: { startLocation: 'last', customPath },
  homePath,
  tabsLoaded: true,
  tabs: state.tabs,
  activeTabId: state.activeTabId,
});

assert.equal(lastStartup.mode, 'last');
assert.equal(lastStartup.startPath, activePath);
assert.equal(lastStartup.activeTabId, 'tab-active');
assert.deepEqual(lastStartup.history, [homePath, activePath]);
assert.equal(lastStartup.historyIndex, 1);
assert.equal(lastStartup.shouldRenderTabs, true);

const staleLastStartup = resolveStartupLocation({
  settings: { startLocation: 'last' },
  homePath,
  tabsLoaded: true,
  tabs: state.tabs,
  activeTabId: 'missing-tab',
});

assert.equal(staleLastStartup.startPath, oldPath);
assert.equal(staleLastStartup.activeTabId, 'tab-old');
assert.equal(staleLastStartup.shouldRenderTabs, true);

const homeStartup = resolveStartupLocation({
  settings: { startLocation: 'home', customPath },
  homePath,
  tabsLoaded: true,
  tabs: state.tabs,
  activeTabId: state.activeTabId,
});

assert.equal(homeStartup.mode, 'home');
assert.equal(homeStartup.startPath, homePath);
assert.equal(homeStartup.shouldRenderTabs, false);

console.log('Settings and startup-location smoke passed.');
