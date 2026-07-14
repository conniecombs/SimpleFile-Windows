import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tauriConfigPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const releaseWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');

function fail(message) {
    console.error(`Updater config check failed: ${message}`);
    process.exitCode = 1;
}

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

const tauriConfig = JSON.parse(readText(tauriConfigPath));
const releaseWorkflow = readText(releaseWorkflowPath);

const updater = tauriConfig.plugins?.updater ?? {};
const endpoints = updater.endpoints ?? [];
const expectedEndpoint = 'https://github.com/conniecombs/SimpleFile-Svelte/releases/latest/download/latest.json';

if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
    fail('src-tauri/tauri.conf.json must set bundle.createUpdaterArtifacts to true.');
}

if (typeof updater.pubkey !== 'string' || updater.pubkey.trim().length < 40) {
    fail('src-tauri/tauri.conf.json must contain the Tauri updater public key.');
}

if (!endpoints.includes(expectedEndpoint)) {
    fail(`src-tauri/tauri.conf.json must include updater endpoint ${expectedEndpoint}.`);
}

if (updater.windows?.installMode !== 'passive') {
    fail('src-tauri/tauri.conf.json should set plugins.updater.windows.installMode to passive.');
}

const requiredWorkflowSnippets = [
    'TAURI_SIGNING_PRIVATE_KEY',
    'uploadUpdaterJson: true',
    'uploadUpdaterSignatures: true',
    'updaterJsonPreferNsis: true',
];

for (const snippet of requiredWorkflowSnippets) {
    if (!releaseWorkflow.includes(snippet)) {
        fail(`.github/workflows/release.yml must include ${snippet}.`);
    }
}

if (!process.exitCode) {
    console.log('Updater release configuration is enabled.');
}
