import { createCommandChannel, invokeCommand, listenToEvent } from './tauri';
import type { EventCallback, UnlistenFn } from './tauri';
import type {
  AppAboutInfo,
  ArchiveFormat,
  ArchiveInfo,
  Checksums,
  CleanupResult,
  ColorLabelTag,
  ConflictAction,
  DirectoryListing,
  DirectoryListingChunk,
  DriveInfo,
  DuplicateCheckResult,
  DuplicateGroup,
  FileChangeEvent,
  FileComparison,
  FileEntry,
  FileMetadata,
  FilePreview,
  GitStatus,
  ImageMetadata,
  NativeFileDropEventPayload,
  Nullable,
  OperationId,
  PathString,
  ProgressUpdate,
  RarInstallPlan,
  RenameRequest,
  SearchOptions,
  SearchResult,
  TauriEventMap,
  ThumbnailResult,
  TreeNode,
  TransferResult,
  UpdateChunkPayload,
  UpdateInfo,
  SmartFolder,
  TauriCommandMap
} from './types';

export function getHomeDir(): Promise<string> {
  return invokeCommand('get_home_dir');
}

export function selectDirectory(defaultPath: Nullable<PathString> = null): Promise<Nullable<PathString>> {
  return invokeCommand('select_directory', { defaultPath });
}

export function listDrives(): Promise<DriveInfo[]> {
  return invokeCommand('list_drives');
}

export type ListDirectoryOptions = {
  /** Called as soon as each enumeration chunk is ready (first page first). */
  onChunk?: (chunk: DirectoryListingChunk) => void;
};

export function listDirectory(
  path: PathString,
  options?: ListDirectoryOptions,
): Promise<DirectoryListing> {
  const onChunk = createCommandChannel<DirectoryListingChunk>();
  onChunk.onmessage = (chunk) => {
    options?.onChunk?.(chunk);
  };
  return invokeCommand('list_directory', { path, onChunk });
}

export function listSubdirectories(path: PathString): Promise<TreeNode[]> {
  return invokeCommand('list_subdirectories', { path });
}

export function createDirectory(path: PathString, name: string): Promise<string> {
  return invokeCommand('create_directory', { path, name });
}

export function createFile(path: PathString, name: string): Promise<string> {
  return invokeCommand('create_file', { path, name });
}

export function deleteEntry(path: PathString): Promise<void> {
  return invokeCommand('delete_entry', { path });
}

export function moveToTrash(paths: PathString[]): Promise<void> {
  return invokeCommand('move_to_trash', { paths });
}

export function renameEntry(path: PathString, newName: string): Promise<string> {
  return invokeCommand('rename_entry', { path, newName });
}

export function batchRename(entries: RenameRequest[]): Promise<string[]> {
  return invokeCommand('batch_rename', { entries });
}

export function copyEntry(source: PathString, destination: PathString): Promise<string> {
  return invokeCommand('copy_entry', { source, destination });
}

export function moveEntry(source: PathString, destination: PathString): Promise<string> {
  return invokeCommand('move_entry', { source, destination });
}

export function copyEntryResolved(
  source: PathString,
  destination: PathString,
  conflictAction: ConflictAction = 'error'
): Promise<string> {
  return invokeCommand('copy_entry_resolved', { source, destination, conflictAction });
}

export function moveEntryResolved(
  source: PathString,
  destination: PathString,
  conflictAction: ConflictAction = 'error'
): Promise<string> {
  return invokeCommand('move_entry_resolved', { source, destination, conflictAction });
}

export function getEntryInfo(path: PathString): Promise<FileEntry> {
  return invokeCommand('get_entry_info', { path });
}

export function copyWithProgress(
  sources: PathString[],
  destination: PathString,
  operationId: Nullable<OperationId> = null,
  conflictAction: ConflictAction = 'error'
): Promise<TransferResult[]> {
  return invokeCommand('copy_with_progress', { sources, destination, operationId, conflictAction });
}

export function moveWithProgress(
  sources: PathString[],
  destination: PathString,
  operationId: Nullable<OperationId> = null,
  conflictAction: ConflictAction = 'error'
): Promise<TransferResult[]> {
  return invokeCommand('move_with_progress', { sources, destination, operationId, conflictAction });
}

export function cancelOperation(operationId: OperationId): Promise<void> {
  return invokeCommand('cancel_operation', { operationId });
}

export function watchDirectory(path: PathString): Promise<void> {
  return invokeCommand('watch_directory', { path });
}

export function unwatchDirectory(): Promise<void> {
  return invokeCommand('unwatch_directory');
}

export function readFilePreview(path: PathString, maxSize?: number): Promise<FilePreview> {
  return invokeCommand('read_file_preview', { path, maxSize });
}

export function generateThumbnail(path: PathString, size = 128): Promise<string> {
  return invokeCommand('generate_thumbnail', { path, size });
}

export function generateThumbnails(paths: PathString[], size = 128): Promise<ThumbnailResult[]> {
  return invokeCommand('generate_thumbnails', { paths, size });
}

export function calculateFolderSize(path: PathString): Promise<number> {
  return invokeCommand('calculate_folder_size', { path });
}

export function countFolderItems(path: PathString): Promise<number> {
  return invokeCommand('count_folder_items', { path });
}

export function cancelFolderSize(): Promise<void> {
  return invokeCommand('cancel_folder_size');
}

export function cancelFolderItemCount(): Promise<void> {
  return invokeCommand('cancel_folder_item_count');
}

export function cancelCountItems(): Promise<void> {
  return invokeCommand('cancel_count_items');
}

export function openFile(path: PathString): Promise<void> {
  return invokeCommand('open_file', { path });
}

export function revealInFolder(path: PathString): Promise<void> {
  return invokeCommand('reveal_in_folder', { path });
}

export function openExternalUrl(url: string): Promise<void> {
  return invokeCommand('open_external_url', { url });
}

export function getGitFileStatuses(path: string): Promise<Record<string, string>> {
  return invokeCommand('get_git_file_statuses', { path });
}

export function getAllTags(): Promise<ColorLabelTag[]> {
  return invokeCommand('get_all_tags');
}

export function createTag(name: string, color: string): Promise<ColorLabelTag> {
  return invokeCommand('create_tag', { name, color });
}

export function updateTag(id: number, name: string, color: string): Promise<void> {
  return invokeCommand('update_tag', { id, name, color });
}

export function deleteTag(id: number): Promise<void> {
  return invokeCommand('delete_tag', { id });
}

export function setTagsForPath(path: string, tagIds: number[]): Promise<void> {
  return invokeCommand('set_tags_for_path', { path, tagIds });
}

export function getTagsForPath(path: string): Promise<ColorLabelTag[]> {
  return invokeCommand('get_tags_for_path', { path });
}

export function getAllFileTags(): Promise<Record<string, ColorLabelTag>> {
  return invokeCommand('get_all_file_tags');
}

export function getFilesWithTag(tagId: number): Promise<string[]> {
  return invokeCommand('get_files_with_tag', { tagId });
}

export function listArchive(path: PathString): Promise<ArchiveInfo> {
  return invokeCommand('list_archive', { path });
}

export function extractArchive(archivePath: PathString, destination: PathString): Promise<void> {
  return invokeCommand('extract_archive', { archivePath, destination });
}

export function createArchive(
  sourcePaths: PathString[],
  archivePath: PathString,
  format: ArchiveFormat
): Promise<void> {
  return invokeCommand('create_archive', { paths: sourcePaths, archivePath, format });
}

export function checkRarInstalled(): Promise<boolean> {
  return invokeCommand('check_rar_installed');
}

export function prepareRarInstall(): Promise<RarInstallPlan> {
  return invokeCommand('prepare_rar_install');
}

export function discardRarInstall(confirmationToken: string): Promise<void> {
  return invokeCommand('discard_rar_install', { confirmationToken });
}

export function installRar(confirmationToken: string): Promise<string> {
  return invokeCommand('install_rar', { confirmationToken });
}





// ============================================================================

export async function getDbSetting(key: string): Promise<string | null> {
  return invokeCommand('get_db_setting', { key });
}

export async function setDbSetting(key: string, value: string): Promise<void> {
  return invokeCommand('set_db_setting', { key, value });
}


export function gitPull(path: string): Promise<string | void> {
  return invokeCommand('git_pull', { path });
}

export function gitPush(path: string): Promise<string | void> {
  return invokeCommand('git_push', { path });
}

// ============================================================================
// ============================================================================












export function openTerminal(path: PathString): Promise<void> {
  return invokeCommand('open_terminal', { path });
}

export function openPowerShellAdmin(path: PathString): Promise<void> {
  return invokeCommand('open_powershell_admin', { path });
}

export function searchFiles(options: SearchOptions): Promise<SearchResult[]> {
  return invokeCommand('search_files', { options });
}

export function cancelSearch(searchId: string): Promise<void> {
  return invokeCommand('cancel_search', { searchId });
}

// ============================================================================
// Smart Folders API
// ============================================================================

export function loadSmartFolders(): Promise<SmartFolder[]> {
  return invokeCommand('load_smart_folders');
}

export function saveSmartFolder(folder: SmartFolder): Promise<SmartFolder[]> {
  return invokeCommand('save_smart_folder', { folder });
}

export function deleteSmartFolder(id: string): Promise<SmartFolder[]> {
  return invokeCommand('delete_smart_folder', { id });
}

export function openFileWith(path: PathString, application: string): Promise<void> {
  return invokeCommand('open_file_with', { path, application });
}

export function compareFiles(pathA: PathString, pathB: PathString): Promise<FileComparison> {
  return invokeCommand('compare_files', { pathA, pathB });
}

export function diskCleanup(directory: PathString, sizeThreshold?: number): Promise<CleanupResult> {
  return invokeCommand('disk_cleanup', { directory, sizeThreshold });
}

export function cancelDiskCleanup(): Promise<void> {
  return invokeCommand('cancel_disk_cleanup');
}

export function duplicateCheck(
  directory: PathString,
  minSize?: number,
  partialHashBytes?: number,
): Promise<DuplicateCheckResult> {
  return invokeCommand('duplicate_check', { directory, minSize, partialHashBytes });
}

export function cancelDuplicateCheck(): Promise<void> {
  return invokeCommand('cancel_duplicate_check');
}

export function getGitStatus(path: PathString): Promise<GitStatus> {
  return invokeCommand('get_git_status', { path });
}











































export function computeChecksum(path: PathString): Promise<Checksums> {
  return invokeCommand('compute_checksum', { path });
}

export function getImageMetadata(path: PathString): Promise<ImageMetadata> {
  return invokeCommand('get_image_metadata', { path });
}

export function getFileMetadata(path: PathString): Promise<FileMetadata> {
  return invokeCommand('get_file_metadata', { path });
}

export function onFileChange(callback: EventCallback<FileChangeEvent>): Promise<UnlistenFn> {
  return listenToEvent('file-change', callback);
}

export function onOperationProgress(callback: EventCallback<ProgressUpdate>): Promise<UnlistenFn> {
  return listenToEvent('operation-progress', callback);
}

export function onOperationComplete(callback: EventCallback<TauriEventMap['operation-complete']>): Promise<UnlistenFn> {
  return listenToEvent('operation-complete', callback);
}

export function onOperationError(callback: EventCallback<TauriEventMap['operation-error']>): Promise<UnlistenFn> {
  return listenToEvent('operation-error', callback);
}

export function onSearchResultsBatch(callback: EventCallback<SearchResult[]>): Promise<UnlistenFn> {
  return listenToEvent('search-results-batch', callback);
}

export function onSearchComplete(callback: EventCallback<number>): Promise<UnlistenFn> {
  return listenToEvent('search-complete', callback);
}

export function showMainWindow(): Promise<void> {
  return invokeCommand('show_main_window');
}

export function onExternalFileDropHover(
  callback: EventCallback<NativeFileDropEventPayload>
): Promise<UnlistenFn> {
  return listenToEvent('tauri://drag-enter', callback);
}

export function onExternalFileDrop(callback: EventCallback<NativeFileDropEventPayload>): Promise<UnlistenFn> {
  return listenToEvent('tauri://drag-drop', callback);
}

export function onExternalFileDropLeave(
  callback: EventCallback<NativeFileDropEventPayload>
): Promise<UnlistenFn> {
  return listenToEvent('tauri://drag-leave', callback);
}

export function getAppVersion(): Promise<string> {
  return invokeCommand('get_app_version');
}

export function getAppAboutInfo(): Promise<AppAboutInfo> {
  return invokeCommand('get_app_about_info');
}

export function checkForUpdate(): Promise<Nullable<UpdateInfo>> {
  return invokeCommand('check_for_update');
}

export function installUpdate(): Promise<void> {
  return invokeCommand('install_update');
}

export function onUpdateChunk(callback: EventCallback<UpdateChunkPayload>): Promise<UnlistenFn> {
  return listenToEvent('update-chunk', callback);
}
