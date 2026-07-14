import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const newVersion = args[0];

if (!newVersion) {
    console.error('Usage: node scripts/release.mjs <version>');
    console.error('Example: node scripts/release.mjs 1.2.0');
    process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-.+)?$/.test(newVersion)) {
    console.error('Error: Version must be in format x.y.z or x.y.z-beta.1');
    process.exit(1);
}

async function updateJsonFile(filePath, updater) {
    const fullPath = path.join(ROOT, filePath);
    const content = await fs.readFile(fullPath, 'utf8');
    const data = JSON.parse(content);
    updater(data);
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${filePath}`);
}

async function updateTomlFile(filePath, version) {
    const fullPath = path.join(ROOT, filePath);
    let content = await fs.readFile(fullPath, 'utf8');
    content = content.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
    await fs.writeFile(fullPath, content, 'utf8');
    console.log(`✅ Updated ${filePath}`);
}

async function run() {
    console.log(`Bumping version to ${newVersion}...`);

    await updateJsonFile('package.json', data => { data.version = newVersion; });
    await updateJsonFile('frontend/package.json', data => { data.version = newVersion; });
    await updateJsonFile('src-tauri/tauri.conf.json', data => { data.version = newVersion; });
    await updateTomlFile('src-tauri/Cargo.toml', newVersion);

    console.log(`\nCommitting changes...`);
    execSync('git add package.json frontend/package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml', { cwd: ROOT, stdio: 'inherit' });
    execSync(`git commit -m "chore(release): v${newVersion}"`, { cwd: ROOT, stdio: 'inherit' });

    console.log(`\nCreating git tag v${newVersion}...`);
    execSync(`git tag "v${newVersion}"`, { cwd: ROOT, stdio: 'inherit' });

    console.log(`\n🎉 Release v${newVersion} prepped!`);
    console.log(`Run the following command to push and trigger the GitHub Actions release workflow:`);
    console.log(`\n    git push origin main --tags\n`);
}

run().catch(console.error);
