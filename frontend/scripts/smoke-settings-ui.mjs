import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';

import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
const sectionIds = ['appearance', 'file-list', 'navigation', 'behavior', 'tools', 'updates', 'about'];
const sectionLabels = ['Appearance', 'File List', 'Navigation', 'Behavior', 'Tools', 'Updates', 'About'];

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function waitForProcessExit(childProcess, { timeoutMs = 5000 } = {}) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      resolveExit(false);
    }, timeoutMs);

    childProcess.once('exit', () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

async function removeDirectoryWithRetries(path, { attempts = 8 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(path, { force: true, recursive: true });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await delay(150 * attempt);
    }
  }
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => rejectPort(new Error('Could not allocate a local port.')));
        return;
      }

      server.close(() => resolvePort(address.port));
    });
  });
}

function browserCandidates() {
  const envCandidates = [
    process.env.SIMPLEFILE_UI_BROWSER,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
  ].filter(Boolean);

  if (process.platform === 'win32') {
    return [
      ...envCandidates,
      `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
  }

  if (process.platform === 'darwin') {
    return [
      ...envCandidates,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  return [
    ...envCandidates,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}

function findBrowserExecutable() {
  return browserCandidates().find((candidate) => candidate && existsSync(candidate));
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const expiresAt = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < expiresAt) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw lastError || new Error(`Timed out fetching ${url}`);
}

async function fetchPageTarget(debugPort, { timeoutMs = 8000 } = {}) {
  const expiresAt = Date.now() + timeoutMs;

  while (Date.now() < expiresAt) {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`, { timeoutMs: 1000 });
    const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    if (pageTarget) return pageTarget;
    await delay(100);
  }

  throw new Error('Could not find a debuggable browser page target.');
}

function connectCdp(webSocketUrl) {
  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  const socket = new WebSocket(webSocketUrl);

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id) {
      const deferred = pending.get(payload.id);
      if (!deferred) return;
      pending.delete(payload.id);

      if (payload.error) {
        deferred.reject(new Error(`${payload.error.message}: ${payload.error.data || ''}`));
      } else {
        deferred.resolve(payload.result);
      }
      return;
    }

    const waiters = events.get(payload.method);
    if (!waiters || waiters.length === 0) return;
    const waiter = waiters.shift();
    waiter.resolve(payload.params);
  });

  socket.addEventListener('error', (event) => {
    for (const deferred of pending.values()) {
      deferred.reject(new Error(`CDP socket error: ${event.message || 'unknown error'}`));
    }
    pending.clear();
  });

  const opened = new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  return {
    async open() {
      await opened;
    },
    close() {
      socket.close();
    },
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
      });
    },
    waitForEvent(method, { timeoutMs = 8000 } = {}) {
      return new Promise((resolveEvent, rejectEvent) => {
        const timer = setTimeout(() => {
          rejectEvent(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);

        const waiter = {
          resolve(value) {
            clearTimeout(timer);
            resolveEvent(value);
          },
        };

        const waiters = events.get(method) || [];
        waiters.push(waiter);
        events.set(method, waiters);
      });
    },
  };
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }

  return result.result.value;
}

async function waitForExpression(page, expression, { timeoutMs = 8000 } = {}) {
  const expiresAt = Date.now() + timeoutMs;

  while (Date.now() < expiresAt) {
    if (await evaluate(page, expression)) {
      return;
    }
    await delay(100);
  }

  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function runSettingsUiSmoke() {
  const browserExecutable = findBrowserExecutable();
  assert.ok(
    browserExecutable,
    'Could not find Edge/Chrome/Chromium. Set SIMPLEFILE_UI_BROWSER to a Chromium-family browser executable.'
  );

  const viteServer = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.ts'),
    logLevel: 'error',
    root: frontendRoot,
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  });

  const debugPort = await getFreePort();
  const userDataDir = mkdtempSync(join(tmpdir(), 'simplefile-settings-ui-'));
  let shuttingDown = false;
  let browserCdp;
  let browserProcess;
  let page;

  try {
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    assert.ok(address && typeof address !== 'string', 'Vite did not expose a local HTTP port.');
    const appUrl = `http://127.0.0.1:${address.port}/`;

    browserProcess = spawn(browserExecutable, [
      '--headless=new',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-gpu',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ], {
      stdio: 'ignore',
    });

    browserProcess.once('exit', (code, signal) => {
      if (shuttingDown) return;
      if (code !== null && code !== 0) {
        console.warn(`Browser exited early with code ${code}.`);
      } else if (signal) {
        console.warn(`Browser exited early from signal ${signal}.`);
      }
    });

    const browserVersion = await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
    assert.ok(browserVersion.webSocketDebuggerUrl, 'Could not find the browser DevTools endpoint.');
    browserCdp = connectCdp(browserVersion.webSocketDebuggerUrl);
    await browserCdp.open();

    const pageTarget = await fetchPageTarget(debugPort);
    page = connectCdp(pageTarget.webSocketDebuggerUrl);
    await page.open();
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1,
      height: 720,
      mobile: false,
      width: 1280,
    });

    const loaded = page.waitForEvent('Page.loadEventFired');
    await page.send('Page.navigate', { url: appUrl });
    await loaded;
    await waitForExpression(page, "Boolean(document.querySelector('#btn-settings'))");

    await evaluate(page, "document.querySelector('#btn-settings').click()");
    await waitForExpression(page, "Boolean(document.querySelector('.settings-modal'))");

    const desktopStructure = await evaluate(page, `(() => {
      const modal = document.querySelector('.settings-modal');
      const panel = document.querySelector('.settings-tab-panel:not([hidden])');
      const tabs = Array.from(document.querySelectorAll('.settings-tab'));
      const row = document.querySelector('.settings-row');
      const rowRect = row?.getBoundingClientRect();
      const modalRect = modal?.getBoundingClientRect();
      return {
        hasSearch: Boolean(document.querySelector('#settings-search')),
        labels: tabs.map((tab) => tab.textContent.trim()),
        modalOverflowsViewport: modal
          ? modalRect.left < 0 || modalRect.right > window.innerWidth || modalRect.top < 0 || modalRect.bottom > window.innerHeight
          : true,
        orientation: document.querySelector('.settings-tabs')?.getAttribute('aria-orientation'),
        panelMaxWidth: Math.round(panel?.getBoundingClientRect().width || 0),
        selectedPanel: panel?.getAttribute('data-settings-panel'),
        rowWidth: Math.round(rowRect?.width || 0),
      };
    })()`);

    assert.equal(desktopStructure.hasSearch, true);
    assert.deepEqual(desktopStructure.labels, sectionLabels);
    assert.equal(desktopStructure.orientation, 'vertical');
    assert.equal(desktopStructure.selectedPanel, 'appearance');
    assert.equal(desktopStructure.modalOverflowsViewport, false);
    assert.ok(desktopStructure.panelMaxWidth <= 722, 'Desktop settings panel should stay visually compact.');
    assert.ok(desktopStructure.rowWidth <= 680, 'Desktop setting rows should not stretch across the full modal.');

    const sectionSwitches = await evaluate(page, `(async () => {
      const ids = ${JSON.stringify(sectionIds)};
      const results = [];
      for (const id of ids) {
        document.querySelector(\`[data-settings-tab="\${id}"]\`).click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        results.push({
          expected: id,
          panel: document.querySelector('.settings-tab-panel:not([hidden])')?.getAttribute('data-settings-panel'),
          selected: document.querySelector('.settings-tab[aria-selected="true"]')?.getAttribute('data-settings-tab'),
        });
      }
      return results;
    })()`);

    for (const result of sectionSwitches) {
      assert.equal(result.selected, result.expected);
      assert.equal(result.panel, result.expected);
    }

    const searchResults = await evaluate(page, `(async () => {
      const cases = [
        { query: 'Trash', expectedTabs: ['Behavior'], expectedPanel: 'behavior', expectedText: 'Move Deleted Items to Trash' },
        { query: 'RAR', expectedTabs: ['Tools'], expectedPanel: 'tools', expectedText: 'RAR Tools' },
        { query: 'Git', expectedTabs: ['File List', 'Tools'], expectedPanel: 'file-list', expectedText: 'Enable Git Integration' },
        { query: 'Icon size', expectedTabs: ['Appearance'], expectedPanel: 'appearance', expectedText: 'Default Icon Size' },
        { query: 'not-a-setting', expectedTabs: [], expectedPanel: null, expectedText: 'No settings found.' },
      ];
      const input = document.querySelector('#settings-search');
      const results = [];
      for (const testCase of cases) {
        input.value = testCase.query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const visiblePanel = document.querySelector('.settings-tab-panel:not([hidden])');
        results.push({
          query: testCase.query,
          expectedPanel: testCase.expectedPanel,
          expectedTabs: testCase.expectedTabs,
          expectedText: testCase.expectedText,
          panel: visiblePanel?.getAttribute('data-settings-panel') || null,
          tabs: Array.from(document.querySelectorAll('.settings-tab')).map((tab) => tab.textContent.trim()),
          text: document.querySelector('.settings-tab-content')?.textContent || '',
        });
      }
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return results;
    })()`);

    for (const result of searchResults) {
      assert.deepEqual(result.tabs, result.expectedTabs, `Unexpected matching tabs for ${result.query}`);
      assert.equal(result.panel, result.expectedPanel, `Unexpected active panel for ${result.query}`);
      assert.ok(result.text.includes(result.expectedText), `Missing expected text for ${result.query}`);
    }

    const toggleResult = await evaluate(page, `(async () => {
      document.querySelector('[data-settings-tab="behavior"]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const input = document.querySelector('#settings-use-trash');
      const before = input.checked;
      input.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const saved = JSON.parse(localStorage.getItem('simplefile-settings') || '{}');
      input.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { before, after: input.checked, savedUseTrash: saved.useTrash };
    })()`);

    assert.notEqual(toggleResult.before, toggleResult.savedUseTrash);
    assert.equal(toggleResult.after, toggleResult.before);

    const customPathResult = await evaluate(page, `(async () => {
      document.querySelector('[data-settings-tab="navigation"]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const select = document.querySelector('#settings-start-location');
      const originalValue = select.value;
      select.value = 'custom';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const row = document.querySelector('#settings-custom-path-row');
      const visibleDisplay = getComputedStyle(row).display;
      select.value = originalValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { originalValue, visibleDisplay };
    })()`);

    assert.equal(customPathResult.visibleDisplay, 'grid');

    await page.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1,
      height: 844,
      mobile: true,
      width: 390,
    });

    await waitForExpression(page, "document.querySelector('.settings-tabs')?.getAttribute('aria-orientation') === 'horizontal'");

    const mobileStructure = await evaluate(page, `(() => {
      const modal = document.querySelector('.settings-modal');
      const modalRect = modal?.getBoundingClientRect();
      const tabs = document.querySelector('.settings-tabs');
      const tabShell = document.querySelector('.settings-tabs-shell');
      const overflowing = Array.from(document.querySelectorAll('.settings-modal *')).filter((element) => {
        if (element === tabs) return false;
        if (element.tagName.toLowerCase() === 'input' && element.getAttribute('type') === 'range') return false;
        return element.scrollWidth > element.clientWidth + 1;
      }).map((element) => element.id || element.className || element.tagName);

      return {
        modalOverflowsViewport: modal
          ? modalRect.left < 0 || modalRect.right > window.innerWidth || modalRect.top < 0 || modalRect.bottom > window.innerHeight
          : true,
        orientation: tabs?.getAttribute('aria-orientation'),
        scrollSnapType: getComputedStyle(tabs).scrollSnapType,
        tabsOverflowHorizontally: tabs.scrollWidth > tabs.clientWidth + 1,
        tabShellAfterContent: getComputedStyle(tabShell, '::after').content,
        overflowing,
      };
    })()`);

    assert.equal(mobileStructure.orientation, 'horizontal');
    assert.equal(mobileStructure.modalOverflowsViewport, false);
    assert.ok(mobileStructure.scrollSnapType.includes('x'), 'Mobile settings tabs should use horizontal scroll snapping.');
    assert.equal(mobileStructure.tabsOverflowHorizontally, true);
    assert.notEqual(mobileStructure.tabShellAfterContent, 'none');
    assert.deepEqual(mobileStructure.overflowing, []);

    console.log('Settings UI smoke passed.');
  } finally {
    shuttingDown = true;
    try {
      await browserCdp?.send('Browser.close');
    } catch {
      // Fall back to process termination below.
    }

    page?.close();
    browserCdp?.close();

    if (browserProcess && !browserProcess.killed) {
      const exited = await waitForProcessExit(browserProcess, { timeoutMs: 3000 });
      if (!exited && !browserProcess.killed) {
        browserProcess.kill();
        await waitForProcessExit(browserProcess, { timeoutMs: 3000 });
      }
    }
    await viteServer.close();
    await removeDirectoryWithRetries(userDataDir);
  }
}

await runSettingsUiSmoke();
