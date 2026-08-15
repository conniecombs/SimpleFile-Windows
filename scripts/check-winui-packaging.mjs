import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`WinUI packaging check failed: ${message}`);
  process.exitCode = 1;
}

function readText(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function requireSnippet(source, file, snippet) {
  if (!source.includes(snippet)) {
    fail(`${file} must include ${snippet}.`);
  }
}

const requiredFiles = [
  'packaging/winui/simplefile-winui.nsi',
  'packaging/winui/Product.wxs',
  'scripts/build-winui-release.ps1',
  'scripts/write-latest-winui.mjs',
  'scripts/smoke-winui-startup.ps1',
  'scripts/smoke-winui-msi.ps1',
  'scripts/smoke-winui-nsis.ps1',
  'scripts/check-winui-parity-gate.mjs',
  'docs/winui-migration/parity-gate.md',
  'src-winui/SimpleFile.App/SimpleFile.App.csproj',
  'crates/simplefile-service/Cargo.toml',
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing ${relativePath}`);
  }
}

const nsis = readText('packaging/winui/simplefile-winui.nsi');
const wxs = readText('packaging/winui/Product.wxs');
const buildScript = readText('scripts/build-winui-release.ps1');
const packageJson = readText('package.json');
const releaseYml = readText('.github/workflows/release.yml');
const ciYml = readText('.github/workflows/ci.yml');
const releaseBuildYml = readText('.github/workflows/release-build.yml');
const installerSmokeYml = readText('.github/workflows/installer-smoke.yml');
const appCsproj = readText('src-winui/SimpleFile.App/SimpleFile.App.csproj');
const tauriBuild = readText('scripts/build-release.ps1');

const nsisSnippets = [
  'SimpleFile (WinUI)',
  'simplefile-service.exe',
  'SimpleFile.exe',
  'InstallDir "$LOCALAPPDATA\\Programs\\SimpleFile-WinUI"',
  'RequestExecutionLevel user',
  'QuietUninstallString',
];

for (const snippet of nsisSnippets) {
  requireSnippet(nsis, 'packaging/winui/simplefile-winui.nsi', snippet);
}

const wxsSnippets = [
  'SimpleFile (WinUI)',
  'InstallScope="perUser"',
  'SimpleFileWinUIFiles',
  'SimpleFile.exe',
];

for (const snippet of wxsSnippets) {
  requireSnippet(wxs, 'packaging/winui/Product.wxs', snippet);
}

const buildSnippets = [
  'simplefile-service',
  'dotnet publish',
  'SimpleFile.exe',
  'x64-winui-portable.zip',
  'x64-winui-setup.exe',
  'x64-winui.msi',
  'latest-winui.json',
  'resources.pri',
  'MainWindow.xbf',
];

for (const snippet of buildSnippets) {
  requireSnippet(buildScript, 'scripts/build-winui-release.ps1', snippet);
}

const npmSnippets = [
  '"build:winui:release"',
  '"smoke:winui"',
  '"smoke:winui-msi"',
  '"smoke:winui-installer"',
  '"release:build"',
  '"build:tauri:local"',
];

for (const snippet of npmSnippets) {
  requireSnippet(packageJson, 'package.json', snippet);
}

if (!tauriBuild.includes('"tauri"') || !tauriBuild.includes('tauri.local.conf.json')) {
  fail('scripts/build-release.ps1 must keep the Tauri release path until retirement.');
}

requireSnippet(appCsproj, 'SimpleFile.App.csproj', 'CopyWindowsAppSdkMergedPri');
requireSnippet(appCsproj, 'SimpleFile.App.csproj', 'PublishUnpackagedXamlPayload');

const workflowSnippets = [
  ['ci.yml', ciYml, 'setup-dotnet'],
  ['ci.yml', ciYml, 'check:winui'],
  ['ci.yml', ciYml, 'simplefile-service'],
  ['release.yml', releaseYml, 'build-winui-release.ps1'],
  ['release.yml', releaseYml, 'latest-winui.json'],
  ['release.yml', releaseYml, 'x64-winui-portable.zip'],
  ['release.yml', releaseYml, 'cargo tauri build --ci --target $env:TARGET_TRIPLE --bundles nsis,msi'],
  ['release-build.yml', releaseBuildYml, 'dist/winui'],
  ['installer-smoke.yml', installerSmokeYml, 'smoke:winui'],
];

for (const [file, source, snippet] of workflowSnippets) {
  requireSnippet(source, file, snippet);
}

if (!process.exitCode) {
  console.log('WinUI packaging surface is wired; Tauri release scripts remain.');
}
