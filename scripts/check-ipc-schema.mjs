import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = join(repoRoot, 'ipc', 'schema', 'v1');

function fail(message) {
  console.error(`IPC schema check failed: ${message}`);
  process.exitCode = 1;
}

function readJson(relativePath) {
  const path = join(schemaDir, relativePath);
  if (!existsSync(path)) {
    fail(`missing ${relativePath}`);
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readRepo(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function backendCommands(source) {
  const handlerStart = source.indexOf('tauri::generate_handler![');
  const handlerEnd = source.indexOf('])', handlerStart);
  if (handlerStart === -1 || handlerEnd === -1) {
    throw new Error('Could not find tauri::generate_handler! in src-tauri/src/lib.rs');
  }
  return new Set(
    [...source.slice(handlerStart, handlerEnd).matchAll(/(?:[a-zA-Z0-9_]+::)?([a-zA-Z0-9_]+)\s*,/g)].map(
      (match) => match[1],
    ),
  );
}

function typedCommandMap(source) {
  const mapStart = source.indexOf('export interface TauriCommandMap');
  const mapEnd = source.indexOf('export type TauriCommandName', mapStart);
  if (mapStart === -1 || mapEnd === -1) {
    throw new Error('Could not find TauriCommandMap in frontend/src/lib/types.ts');
  }
  const mapBlock = source.slice(mapStart, mapEnd);
  const commands = new Map();
  const pattern =
    /^\s*([a-zA-Z0-9_]+):\s*CommandContract<((?:[^<>]|<[^<>]*>)+),\s*([^>]+)>/gm;
  for (const match of mapBlock.matchAll(pattern)) {
    commands.set(match[1], { args: match[2].trim(), result: match[3].trim() });
  }
  return commands;
}

function typedEventNames(source) {
  const mapStart = source.indexOf('export interface TauriEventMap');
  const mapEnd = source.indexOf('export type CommandContract', mapStart);
  if (mapStart === -1 || mapEnd === -1) {
    throw new Error('Could not find TauriEventMap in frontend/src/lib/types.ts');
  }
  return new Set(
    [...source.slice(mapStart, mapEnd).matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
  );
}

function topLevelArgKeys(argsText) {
  if (argsText === 'NoArgs') return [];
  const objectMatch = argsText.match(/^\{([\s\S]*)\}$/);
  if (!objectMatch) return [];
  return [...objectMatch[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*[?:]/g)].map((match) => match[1]);
}

function rustStructFields(source, structName) {
  const start = source.indexOf(`pub struct ${structName}`);
  if (start === -1) return null;
  const brace = source.indexOf('{', start);
  const end = source.indexOf('\n}', brace);
  if (brace === -1 || end === -1) return null;
  return [...source.slice(brace, end).matchAll(/pub\s+([a-zA-Z0-9_]+)\s*:/g)].map((match) => match[1]);
}

function tsInterfaceFields(source, interfaceName) {
  const start = source.indexOf(`export interface ${interfaceName}`);
  if (start === -1) return null;
  const brace = source.indexOf('{', start);
  const end = source.indexOf('\n}', brace);
  if (brace === -1 || end === -1) return null;
  return [...source.slice(brace, end).matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map(
    (match) => match[1],
  );
}

const protocol = readJson('protocol.json');
const types = readJson('types.json');
const commands = readJson('commands.json');
const events = readJson('events.json');
if (!protocol || !types || !commands || !events) {
  process.exit(1);
}

const rustLib = readRepo('src-tauri/src/lib.rs');
const typedContracts = readRepo('frontend/src/lib/types.ts');
const models = readRepo('crates/simplefile-core/src/models.rs');

const handlers = backendCommands(rustLib);
const typed = typedCommandMap(typedContracts);
const schemaMethods = new Set(
  Object.keys(commands.methods || {}).filter((name) => !name.startsWith('ipc.')),
);

if (handlers.size !== 74) {
  fail(`expected 74 Tauri handlers, found ${handlers.size}`);
}
if (commands.domainMethodCount !== 74) {
  fail(`commands.json domainMethodCount must be 74, found ${commands.domainMethodCount}`);
}
if (protocol.protocolVersion !== 1 || commands.protocolVersion !== 1) {
  fail('schema protocolVersion must be 1');
}

for (const name of setDifference(handlers, schemaMethods)) {
  fail(`schema missing Tauri handler: ${name}`);
}
for (const name of setDifference(schemaMethods, handlers)) {
  fail(`schema has extra domain method: ${name}`);
}
for (const name of setDifference(new Set(typed.keys()), schemaMethods)) {
  fail(`TauriCommandMap command missing from schema: ${name}`);
}
for (const name of setDifference(schemaMethods, new Set(typed.keys()))) {
  fail(`schema method missing from TauriCommandMap: ${name}`);
}

if (!commands.methods['ipc.handshake']) {
  fail('commands.json must include ipc.handshake');
}
if (protocol.handshake.method !== 'ipc.handshake') {
  fail('protocol handshake method must be ipc.handshake');
}

for (const [name, spec] of typed) {
  const schema = commands.methods[name];
  if (!schema) continue;
  const expectedKeys = topLevelArgKeys(spec.args).filter((key) => {
    const omitted = schema.omittedFromParams || [];
    return !omitted.includes(key);
  });
  const actualKeys = schema.params ? Object.keys(schema.params) : [];
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    fail(
      `${name} top-level params mismatch: types.ts [${expectedKeys.join(', ')}] vs schema [${actualKeys.join(', ')}]`,
    );
  }
}

const requiredEmitted = [
  'file-change',
  'operation-progress',
  'search-results-batch',
  'search-complete',
  'update-chunk',
  'list_directory.chunk',
];
for (const name of requiredEmitted) {
  if (!events.emitted?.[name]) {
    fail(`events.json missing emitted event: ${name}`);
  }
}
for (const name of ['operation-complete', 'operation-error']) {
  if (!events.typedNotEmitted?.[name]) {
    fail(`events.json must list ${name} under typedNotEmitted`);
  }
}
const typedEvents = typedEventNames(typedContracts);
for (const name of ['tauri://drag-enter', 'tauri://drag-drop', 'tauri://drag-leave']) {
  if (!typedEvents.has(name)) {
    fail(`TauriEventMap missing host event ${name}`);
  }
  if (!events.hostOnly?.[name]) {
    fail(`events.json must list ${name} under hostOnly`);
  }
}

const rustCheckedTypes = [
  'FileEntry',
  'DirectoryListing',
  'DirectoryListingChunk',
  'ProgressUpdate',
  'SearchOptions',
  'SearchResult',
  'SmartFolder',
  'ArchiveInfo',
];
for (const typeName of rustCheckedTypes) {
  const schemaFields = types.types?.[typeName]?.fields;
  const rustFields = rustStructFields(models, typeName);
  if (!schemaFields || !rustFields) {
    fail(`could not compare fields for ${typeName}`);
    continue;
  }
  if (JSON.stringify(schemaFields) !== JSON.stringify(rustFields)) {
    fail(`${typeName} fields mismatch models.rs: schema [${schemaFields}] rust [${rustFields}]`);
  }
}

const extras = types.frontendOnlyFields || {};
for (const [typeName, extraFields] of Object.entries(extras)) {
  const tsFields = tsInterfaceFields(typedContracts, typeName);
  if (!tsFields) {
    fail(`could not read TypeScript interface ${typeName}`);
    continue;
  }
  for (const field of extraFields) {
    if (!tsFields.includes(field)) {
      fail(`${typeName}.${field} marked frontend-only but missing from types.ts`);
    }
  }
}

const requiredGoldens = [
  'ipc.handshake.request.json',
  'ipc.handshake.result.json',
  'search_files.request.json',
  'batch_rename.request.json',
  'save_smart_folder.request.json',
  'conflict.error.json',
  'trash_unavailable.error.json',
  'host_owned.error.json',
  'operation-progress.event.json',
  'list_directory.chunk.event.json',
  'update-chunk.event.json',
  'file-entry.result.json',
];
for (const file of requiredGoldens) {
  if (!existsSync(join(schemaDir, 'goldens', file))) {
    fail(`missing golden ${file}`);
  }
}

const searchRequest = readJson('goldens/search_files.request.json');
const searchOptions = searchRequest?.params?.options || {};
for (const key of ['search_path', 'case_sensitive', 'include_hidden', 'search_id', 'content_search']) {
  if (!(key in searchOptions)) {
    fail(`search_files golden missing nested snake_case key ${key}`);
  }
}
if ('searchPath' in searchOptions) {
  fail('search_files golden must not camelCase nested SearchOptions');
}

const batchRequest = readJson('goldens/batch_rename.request.json');
const rename = batchRequest?.params?.entries?.[0] || {};
if (!('new_name' in rename) || 'newName' in rename) {
  fail('batch_rename golden must use nested new_name, not newName');
}

const fileEntry = readJson('goldens/file-entry.result.json');
if (fileEntry && 'itemCount' in fileEntry) {
  fail('file-entry golden must not include frontend-only itemCount');
}

const conflict = readJson('goldens/conflict.error.json');
if (conflict?.error?.code !== -32000 || !String(conflict?.error?.message || '').startsWith('CONFLICT:')) {
  fail('conflict golden must be JSON-RPC -32000 with CONFLICT: message');
}

const progress = readJson('goldens/operation-progress.event.json');
if (!progress || 'id' in progress || progress.method !== 'operation-progress') {
  fail('operation-progress golden must be a notification (no id)');
}
if (!progress?.params?.operation_id) {
  fail('operation-progress golden must include operation_id');
}

const updateChunk = readJson('goldens/update-chunk.event.json');
if (!Array.isArray(updateChunk?.params) || updateChunk.params.length !== 2) {
  fail('update-chunk golden params must be a two-element array');
}

const cancelCommands = new Set(protocol.cancellation?.commands || []);
for (const name of [
  'cancel_operation',
  'cancel_search',
  'cancel_folder_size',
  'cancel_folder_item_count',
  'cancel_count_items',
  'cancel_disk_cleanup',
  'cancel_duplicate_check',
]) {
  if (!cancelCommands.has(name) || !commands.methods[name]) {
    fail(`cancellation command missing from protocol/schema: ${name}`);
  }
}

if (protocol.transport?.maxFrameBytes !== 80 * 1024 * 1024) {
  fail('maxFrameBytes must be 80 MiB');
}

const goldenFiles = existsSync(join(schemaDir, 'goldens'))
  ? readdirSync(join(schemaDir, 'goldens')).filter((name) => name.endsWith('.json'))
  : [];
if (goldenFiles.length < requiredGoldens.length) {
  fail('golden directory is incomplete');
}

if (!process.exitCode) {
  console.log(
    `Checked IPC v1 schema: ${schemaMethods.size} domain methods, ${requiredEmitted.length} emitted events, ${requiredGoldens.length} goldens.`,
  );
}
