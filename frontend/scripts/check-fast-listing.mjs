import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function read(path) {
  const resolved = resolve(root, path);
  if (!existsSync(resolved)) {
    fail(`${path} is missing`);
    return '';
  }
  return readFileSync(resolved, 'utf8');
}

function assertContains(file, values, label = 'value') {
  const source = read(file);
  for (const value of values) {
    if (!source.includes(value)) {
      fail(`${file} is missing ${label}: ${value}`);
    }
  }
}

assertContains('crates/simplefile-core/src/dir_list.rs', [
  'FIND_FIRST_EX_LARGE_FETCH',
  'FindFirstFileExW',
  'pub fn list_directory',
  'FIRST_CHUNK_SIZE',
  'is_network',
  'get_file_entry_from_dir_entry',
], 'fast directory enumeration');

assertContains('crates/simplefile-core/src/utils.rs', [
  'get_file_entry_from_dir_entry',
  'is_network_path',
  'read_link',
  'build_file_entry',
], 'DirEntry-based metadata helpers');

assertContains('src-tauri/src/dir_list.rs', [
  'Tauri adapter around `simplefile_core::dir_list`',
  'list_directory_blocking',
  'simplefile_core::dir_list::list_directory',
], 'Tauri fast-listing adapter');

assertContains('src-tauri/src/fs_ops.rs', [
  'on_chunk: tauri::ipc::Channel',
  'list_directory_blocking',
], 'chunked list_directory command');

assertContains('crates/simplefile-core/src/models.rs', [
  'DirectoryListingChunk',
  'is_network',
], 'listing chunk models');

assertContains('frontend/src/lib/api.ts', [
  'Channel',
  'onChunk',
  'DirectoryListingChunk',
], 'frontend progressive listDirectory');

assertContains('frontend/src/lib/app/core.ts', [
  'primaryListingInProgress',
  'onChunk:',
  'primaryPathIsNetwork',
  'progressive.concat',
], 'progressive loadDirectory');

assertContains('frontend/src/lib/components/file-list/FileList.svelte', [
  'networkHeavyWorkReady',
  'paneIsNetwork',
  'requestIdleCallback',
  'lightDateFormat',
], 'deferred network heavy work');

assertContains('frontend/src/lib/coreFileManager.ts', [
  'isNetworkFsPath',
], 'network path helper');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('check-fast-listing: ok');
