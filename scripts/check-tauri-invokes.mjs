import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const frontendSrc = join(repoRoot, 'frontend', 'src');

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated-svelte') {
          return [];
        }
        return collectSourceFiles(path);
      }

      return entry.isFile() && /\.(?:svelte|ts|js|mjs)$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

function backendCommands(source) {
  const handlerStart = source.indexOf('tauri::generate_handler![');
  if (handlerStart === -1) {
    throw new Error('Could not find tauri::generate_handler! block in src-tauri/src/lib.rs');
  }

  const handlerEnd = source.indexOf('])', handlerStart);
  if (handlerEnd === -1) {
    throw new Error('Could not find the end of the tauri::generate_handler! block');
  }

  const handlerBlock = source.slice(handlerStart, handlerEnd);
  return new Set(
    [...handlerBlock.matchAll(/(?:[a-zA-Z0-9_]+::)?([a-zA-Z0-9_]+)\s*,/g)]
      .map((match) => match[1])
  );
}

function typedCommandMapCommands(source) {
  const mapStart = source.indexOf('export interface TauriCommandMap');
  if (mapStart === -1) {
    throw new Error('Could not find TauriCommandMap in frontend/src/lib/types.ts');
  }

  const mapEnd = source.indexOf('export type TauriCommandName', mapStart);
  if (mapEnd === -1) {
    throw new Error('Could not find the end of TauriCommandMap in frontend/src/lib/types.ts');
  }

  const mapBlock = source.slice(mapStart, mapEnd);
  return new Set(
    [...mapBlock.matchAll(/^\s*([a-zA-Z0-9_]+):\s*CommandContract/gm)]
      .map((match) => match[1])
  );
}

function frontendLiteralInvokes(files) {
  const commands = new Map();
  const patterns = [
    /\binvokeCommand(?:<[^>]+>)?\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g,
    /\binvoke(?:<[^>]+>)?\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g,
  ];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const command = match[1];
        if (!commands.has(command)) commands.set(command, new Set());
        commands.get(command).add(relative(repoRoot, file));
      }
    }
  }

  return commands;
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

const libSource = readFileSync(join(repoRoot, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const typesSource = readFileSync(join(repoRoot, 'frontend', 'src', 'lib', 'types.ts'), 'utf8');
const frontendFiles = collectSourceFiles(frontendSrc);

const backend = backendCommands(libSource);
const typedMap = typedCommandMapCommands(typesSource);
const literalInvokes = frontendLiteralInvokes(frontendFiles);
const literalInvokeCommands = new Set(literalInvokes.keys());

const literalMissingBackend = setDifference(literalInvokeCommands, backend);
const mapMissingBackend = setDifference(typedMap, backend);
const backendMissingMap = setDifference(backend, typedMap);

let failed = false;

if (literalMissingBackend.length > 0) {
  failed = true;
  console.error('Frontend invokes without a matching Tauri handler:');
  for (const command of literalMissingBackend) {
    const locations = [...literalInvokes.get(command)].join(', ');
    console.error(`- ${command} (${locations})`);
  }
}

if (mapMissingBackend.length > 0) {
  failed = true;
  console.error('Typed TauriCommandMap entries without a matching Tauri handler:');
  for (const command of mapMissingBackend) {
    console.error(`- ${command}`);
  }
}

if (backendMissingMap.length > 0) {
  failed = true;
  console.error('Tauri handlers missing from TauriCommandMap:');
  for (const command of backendMissingMap) {
    console.error(`- ${command}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `Checked ${literalInvokeCommands.size} frontend literal invokes and ${typedMap.size} typed commands against ${backend.size} Tauri handlers.`
);
