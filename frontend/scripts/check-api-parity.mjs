import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..');
const repoRoot = resolve(workspaceRoot, '..');
const typedApi = readFileSync(join(workspaceRoot, 'src', 'lib', 'api.ts'), 'utf8');
const typedContracts = readFileSync(join(workspaceRoot, 'src', 'lib', 'types.ts'), 'utf8');
const rustLib = readFileSync(join(repoRoot, 'src-tauri', 'src', 'lib.rs'), 'utf8');

function exportedFunctionNames(source) {
  return new Set(
    [...source.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g)]
      .map((match) => match[1])
  );
}

function typedInvokeCommands(source) {
  return new Set(
    [...source.matchAll(/invokeCommand\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)]
      .map((match) => match[1])
  );
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

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

const typedExports = exportedFunctionNames(typedApi);
const typedCommands = typedInvokeCommands(typedApi);
const contractCommands = typedCommandMapCommands(typedContracts);
const commands = backendCommands(rustLib);

const missingTypedWrappers = setDifference(commands, typedCommands);
const extraTypedInvokes = setDifference(typedCommands, commands);
const missingContracts = setDifference(commands, contractCommands);
const extraContracts = setDifference(contractCommands, commands);

let failed = false;

if (missingTypedWrappers.length > 0) {
  failed = true;
  console.error('Svelte API boundary is missing typed wrappers for backend Tauri handlers:');
  for (const command of missingTypedWrappers) console.error(`- ${command}`);
}

if (extraTypedInvokes.length > 0) {
  failed = true;
  console.error('Typed API invokes without matching backend Tauri handlers:');
  for (const command of extraTypedInvokes) console.error(`- ${command}`);
}

if (missingContracts.length > 0) {
  failed = true;
  console.error('TauriCommandMap is missing backend Tauri handlers:');
  for (const command of missingContracts) console.error(`- ${command}`);
}

if (extraContracts.length > 0) {
  failed = true;
  console.error('TauriCommandMap entries without matching backend Tauri handlers:');
  for (const command of extraContracts) console.error(`- ${command}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `Checked ${typedExports.size} typed API exports, ${typedCommands.size} typed invokes, and ${contractCommands.size} command contracts against ${commands.size} Tauri handlers.`
);
