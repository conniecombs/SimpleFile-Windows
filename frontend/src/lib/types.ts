export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Nullable<T> = T | null;

export type PathString = string;
export type OperationId = string;
export type ConflictAction = 'error' | 'skip' | 'replace' | 'rename' | 'keep-both' | 'keep_both';
export type ClipboardAction = 'copy' | 'cut';
export type ViewMode = 'list' | 'grid';
export type ThemeName = 'dark' | 'light' | string;
export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz' | 'tgz' | 'rar';
export type TransferStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type ProgressStatus = 'running' | 'completed' | 'error' | 'cancelled' | (string & {});

export type ColumnId = 'size' | 'items' | 'date' | 'type';

export interface FileEntry {
  name: string;
  path: PathString;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified: string;
  extension: string;
  git_status?: string | null;
  itemCount?: string | number;
  permissions?: string;
  symlink_target?: string;
}

export interface DirectoryListing {
  path: PathString;
  parent: Nullable<PathString>;
  entries: FileEntry[];
}

export interface ProgressUpdate {
  operation_id: OperationId;
  operation_type: string;
  current: number;
  total: number;
  current_item: string;
  status: ProgressStatus;
  error: Nullable<string>;
}

export interface FileChangeEvent {
  path: PathString;
  kind: string;
}

export interface DriveInfo {
  name: string;
  path: PathString;
  drive_type: string;
  total_space: number;
  free_space: number;
  remote_path?: string | null;
  drive_status?: 'available' | 'offline' | 'stale' | 'unknown' | string;
  status_detail?: string | null;
}

export interface TreeNode {
  name: string;
  path: PathString;
  has_children: boolean;
  children: TreeNode[];
}

export interface SearchResult {
  name: string;
  path: PathString;
  is_dir: boolean;
  size: number;
  modified: string;
  extension: string;
  match_type: string;
}

export interface SearchOptions {
  query: string;
  search_path: PathString;
  case_sensitive: boolean;
  include_hidden: boolean;
  file_types: Nullable<string[]>;
  max_results: Nullable<number>;
  max_depth: Nullable<number>;
  search_id?: string;
  content_search: boolean;
  min_size?: Nullable<number>;
  max_size?: Nullable<number>;
  date_after?: Nullable<string>;
  date_before?: Nullable<string>;
}

export interface SmartFolder {
  id: string;
  name: string;
  icon: Nullable<string>;
  search_options: SearchOptions;
}

export interface DuplicateGroup {
  hash: string;
  files: PathString[];
}

export interface CleanupResult {
  large_files: Array<[PathString, number]>;
  duplicates: DuplicateGroup[];
}

export interface GitStatus {
  is_repo: boolean;
  branch: Nullable<string>;
  modified: number;
  staged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

export interface FilePreview {
  file_type: string;
  content: Nullable<string>;
  mime_type: string;
  size: number;
  encoding: Nullable<string>;
}

export interface ThumbnailResult {
  path: PathString;
  data: Nullable<string>;
  error: Nullable<string>;
}

export interface ImageMetadata {
  width: number;
  height: number;
  exif: Array<[string, string]>;
}

export interface ArchiveEntry {
  name: string;
  path: PathString;
  is_dir: boolean;
  size: number;
  compressed_size: number;
}

export interface ArchiveInfo {
  path: PathString;
  format: string;
  entries: ArchiveEntry[];
  unsafe_entries: string[];
  total_size: number;
  compressed_size: number;
}

export interface TransferResult {
  source: PathString;
  destination: PathString;
}

export interface RenameRequest {
  path: PathString;
  new_name: string;
}

export interface Checksums {
  md5: string;
  sha1: string;
  sha256: string;
}

export interface RarInstallPlan {
  confirmation_token: string;
  download_url: string;
  file_name: string;
  installer_path: string;
  publisher: Nullable<string>;
  sha256: string;
}

export interface DiffRow {
  kind: string;
  left_line: Nullable<number>;
  right_line: Nullable<number>;
  left_text: Nullable<string>;
  right_text: Nullable<string>;
}

export interface FileComparison {
  left_path: PathString;
  right_path: PathString;
  left_name: string;
  right_name: string;
  left_size: number;
  right_size: number;
  identical: boolean;
  added: number;
  removed: number;
  changed: number;
  rows: DiffRow[];
}

export interface UpdateInfo {
  version: string;
  notes: Nullable<string>;
}

export interface AppAboutInfo {
  product_name: string;
  version: string;
  identifier: string;
  description: string;
  authors: string;
  repository: string;
  framework: string;
  runtime: string;
  platform: string;
  architecture: string;
  build_profile: string;
}

export interface NativeFileDropPayload {
  paths?: PathString[];
  files?: PathString[];
  position?: {
    x: number;
    y: number;
  };
}

export type NativeFileDropEventPayload = PathString[] | NativeFileDropPayload;
export type UpdateChunkPayload = [bytesDownloaded: number, totalBytes: Nullable<number>];

export interface TauriEventMap {
  'file-change': FileChangeEvent;
  'operation-progress': ProgressUpdate;
  'operation-complete': unknown;
  'operation-error': { error?: string } | unknown;
  'search-results-batch': SearchResult[];
  'search-complete': number;
  'update-chunk': UpdateChunkPayload;
  'tauri://drag-enter': NativeFileDropEventPayload;
  'tauri://drag-drop': NativeFileDropEventPayload;
  'tauri://drag-leave': NativeFileDropEventPayload;
}

export type CommandContract<Args, Result> = {
  args: Args;
  result: Result;
};

export type NoArgs = undefined;

export interface TauriCommandMap {
  get_home_dir: CommandContract<NoArgs, string>;
  select_directory: CommandContract<{ defaultPath: Nullable<PathString> }, Nullable<PathString>>;
  list_drives: CommandContract<NoArgs, DriveInfo[]>;
  list_directory: CommandContract<{ path: PathString }, DirectoryListing>;
  list_subdirectories: CommandContract<{ path: PathString }, TreeNode[]>;
  create_directory: CommandContract<{ path: PathString; name: string }, string>;
  create_file: CommandContract<{ path: PathString; name: string }, string>;
  delete_entry: CommandContract<{ path: PathString }, void>;
  move_to_trash: CommandContract<{ paths: PathString[] }, void>;
  rename_entry: CommandContract<{ path: PathString; newName: string }, string>;
  batch_rename: CommandContract<{ entries: RenameRequest[] }, string[]>;
  copy_entry: CommandContract<{ source: PathString; destination: PathString }, string>;
  move_entry: CommandContract<{ source: PathString; destination: PathString }, string>;
  copy_entry_resolved: CommandContract<{ source: PathString; destination: PathString; conflictAction: ConflictAction }, string>;
  move_entry_resolved: CommandContract<{ source: PathString; destination: PathString; conflictAction: ConflictAction }, string>;
  get_entry_info: CommandContract<{ path: PathString }, FileEntry>;
  copy_with_progress: CommandContract<{ sources: PathString[]; destination: PathString; operationId: Nullable<OperationId>; conflictAction: ConflictAction }, TransferResult[]>;
  move_with_progress: CommandContract<{ sources: PathString[]; destination: PathString; operationId: Nullable<OperationId>; conflictAction: ConflictAction }, TransferResult[]>;
  cancel_operation: CommandContract<{ operationId: OperationId }, void>;
  watch_directory: CommandContract<{ path: PathString }, void>;
  unwatch_directory: CommandContract<NoArgs, void>;
  read_file_preview: CommandContract<{ path: PathString; maxSize?: number }, FilePreview>;
  generate_thumbnail: CommandContract<{ path: PathString; size: number }, string>;
  generate_thumbnails: CommandContract<{ paths: PathString[]; size: number }, ThumbnailResult[]>;
  calculate_folder_size: CommandContract<{ path: PathString }, number>;
  count_folder_items: CommandContract<{ path: PathString }, number>;
  cancel_folder_size: CommandContract<NoArgs, void>;
  cancel_folder_item_count: CommandContract<NoArgs, void>;
  cancel_count_items: CommandContract<NoArgs, void>;
  open_file: CommandContract<{ path: PathString }, void>;
  reveal_in_folder: CommandContract<{ path: PathString }, void>;
  open_external_url: CommandContract<{ url: string }, void>;
  list_archive: CommandContract<{ path: PathString }, ArchiveInfo>;
  extract_archive: CommandContract<{ archivePath: PathString; destination: PathString }, void>;
  create_archive: CommandContract<{ paths: PathString[]; archivePath: PathString; format: ArchiveFormat }, void>;
  check_rar_installed: CommandContract<NoArgs, boolean>;
  prepare_rar_install: CommandContract<NoArgs, RarInstallPlan>;
  discard_rar_install: CommandContract<{ confirmationToken: string }, void>;
  install_rar: CommandContract<{ confirmationToken: string }, string>;
  get_db_setting: CommandContract<{ key: string }, string | null>;
  set_db_setting: CommandContract<{ key: string; value: string }, void>;
  git_pull: CommandContract<{ path: PathString }, string | void>;
  git_push: CommandContract<{ path: PathString }, string | void>;
  open_terminal: CommandContract<{ path: PathString }, void>;
  open_powershell_admin: CommandContract<{ path: PathString }, void>;
  search_files: CommandContract<{ options: SearchOptions }, SearchResult[]>;
  cancel_search: CommandContract<{ searchId: string }, void>;
  
  // Smart Folders
  load_smart_folders: CommandContract<NoArgs, SmartFolder[]>;
  save_smart_folder: CommandContract<{ folder: SmartFolder }, SmartFolder[]>;
  delete_smart_folder: CommandContract<{ id: string }, SmartFolder[]>;
  open_file_with: CommandContract<{ path: PathString; application: string }, void>;
  compare_files: CommandContract<{ pathA: PathString; pathB: PathString }, FileComparison>;
  disk_cleanup: CommandContract<{ directory: PathString; sizeThreshold?: number }, CleanupResult>;
  cancel_disk_cleanup: CommandContract<NoArgs, void>;
  get_git_status: CommandContract<{ path: PathString }, GitStatus>;
  compute_checksum: CommandContract<{ path: PathString }, Checksums>;
  get_image_metadata: CommandContract<{ path: PathString }, ImageMetadata>;
  get_app_version: CommandContract<NoArgs, string>;
  get_app_about_info: CommandContract<NoArgs, AppAboutInfo>;
  check_for_update: CommandContract<NoArgs, Nullable<UpdateInfo>>;
  install_update: CommandContract<NoArgs, void>;
  show_main_window: CommandContract<NoArgs, void>;
  get_git_file_statuses: CommandContract<{ path: PathString }, Record<string, string>>;
  get_all_tags: CommandContract<NoArgs, any[]>;
  create_tag: CommandContract<{ name: string; color: string }, any>;
  update_tag: CommandContract<{ id: number; name: string; color: string }, void>;
  delete_tag: CommandContract<{ id: number }, void>;
  set_tags_for_path: CommandContract<{ path: string; tagIds: number[] }, void>;
  get_tags_for_path: CommandContract<{ path: string }, any[]>;
  get_all_file_tags: CommandContract<NoArgs, Record<string, any>>;
  get_files_with_tag: CommandContract<{ tagId: number }, string[]>;
}

export type TauriCommandName = keyof TauriCommandMap;
export type CommandArgs<Name extends TauriCommandName> = TauriCommandMap[Name]['args'];
export type CommandResult<Name extends TauriCommandName> = TauriCommandMap[Name]['result'];
