import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readText(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message) {
    console.error(`GitHub workflow check failed: ${message}`);
    process.exitCode = 1;
}

function requireSnippet(source, file, snippet) {
    if (!source.includes(snippet)) {
        fail(`${file} must include ${snippet}.`);
    }
}

function requireRegex(source, file, pattern, label) {
    if (!pattern.test(source)) {
        fail(`${file} must include ${label}.`);
    }
}

const ciPath = '.github/workflows/ci.yml';
const releasePath = '.github/workflows/release.yml';
const dependabotPath = '.github/dependabot.yml';

const ciWorkflow = readText(ciPath);
const releaseWorkflow = readText(releasePath);
const dependabot = readText(dependabotPath);

const ciSnippets = [
    'pull_request:',
    'workflow_dispatch:',
    'permissions:',
    'contents: read',
    'pull-requests: read',
    'uses: actions/checkout@v6',
    'uses: dtolnay/rust-toolchain@stable',
    'components: rustfmt, clippy',
    'uses: actions/setup-node@v6',
    'node-version: 24',
    'npm ci --prefix frontend',
    'npm run check',
    'cargo fmt --all -- --check',
    'cargo clippy --locked --all-targets --all-features -- -D warnings',
    'cargo test --locked --all-features',
    'cargo audit --deny warnings',
    'x86_64-pc-windows-msvc',
    'cargo build --locked --release --all-features --target ${{ matrix.target }}',
];

for (const snippet of ciSnippets) {
    requireSnippet(ciWorkflow, ciPath, snippet);
}

const releaseSnippets = [
    'tags:',
    "'v*'",
    'workflow_dispatch:',
    'contents: write',
    'Validate release version',
    'Version must look like v1.0.0 or v1.0.0-beta.1',
    'tauri.conf.json',
    'Cargo.toml',
    'components: rustfmt, clippy',
    'uses: actions/setup-node@v6',
    'node-version: 24',
    'npm ci --prefix frontend',
    'npm run check',
    'cargo fmt --all -- --check',
    'cargo clippy --locked --all-targets --all-features -- -D warnings',
    'cargo test --locked --all-features',
    'cargo audit --deny warnings',
    'TAURI_SIGNING_PRIVATE_KEY',
    'tauri-apps/tauri-action@action-v0.6.2',
    'uploadUpdaterJson: true',
    'uploadUpdaterSignatures: true',
    'updaterJsonPreferNsis: true',
    'args: --target ${{ matrix.target }}',
    'softprops/action-gh-release@v3',
    'Windows NSIS and MSI installers are attached below.',
];

for (const snippet of releaseSnippets) {
    requireSnippet(releaseWorkflow, releasePath, snippet);
}

requireRegex(
    releaseWorkflow,
    releasePath,
    /if:\s*needs\.validate\.outputs\.draft\s*==\s*'false'/,
    'a publish gate that respects manual draft=false releases',
);

const retiredArtifactTargets = [
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu',
];

for (const target of retiredArtifactTargets) {
    if (ciWorkflow.includes(target)) {
        fail(`${ciPath} should not build ${target} on the Windows-focused branch.`);
    }
    if (releaseWorkflow.includes(target)) {
        fail(`${releasePath} should not build ${target} on the Windows-focused branch.`);
    }
}

const dependabotSnippets = [
    'package-ecosystem: "cargo"',
    'directory: "/src-tauri"',
    'package-ecosystem: "github-actions"',
    'directory: "/"',
    'interval: "weekly"',
];

for (const snippet of dependabotSnippets) {
    requireSnippet(dependabot, dependabotPath, snippet);
}

if (!process.exitCode) {
    console.log('GitHub workflow configuration is wired.');
}
