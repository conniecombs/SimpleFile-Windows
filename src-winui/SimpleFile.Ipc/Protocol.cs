namespace SimpleFile.Ipc;

public static class Protocol
{
    public const int Version = 1;
    public const string JsonRpc = "2.0";
    public const uint MaxFrameBytes = 80 * 1024 * 1024;
    public const int DomainMethodCount = 74;

    public const string HandshakeMethod = "ipc.handshake";
    public const string HealthMethod = "ipc.health";
    public const string ShutdownMethod = "ipc.shutdown";
    public const string GetAppVersionMethod = "get_app_version";
    public const string GetHomeDirMethod = "get_home_dir";
    public const string ListDrivesMethod = "list_drives";
    public const string ListDirectoryMethod = "list_directory";
    public const string SelectDirectoryMethod = "select_directory";
    public const string ShowMainWindowMethod = "show_main_window";

    public const string CreateDirectoryMethod = "create_directory";
    public const string CreateFileMethod = "create_file";
    public const string DeleteEntryMethod = "delete_entry";
    public const string MoveToTrashMethod = "move_to_trash";
    public const string RenameEntryMethod = "rename_entry";
    public const string BatchRenameMethod = "batch_rename";
    public const string CopyEntryMethod = "copy_entry";
    public const string MoveEntryMethod = "move_entry";
    public const string CopyEntryResolvedMethod = "copy_entry_resolved";
    public const string MoveEntryResolvedMethod = "move_entry_resolved";
    public const string GetEntryInfoMethod = "get_entry_info";
    public const string OpenFileMethod = "open_file";
    public const string RevealInFolderMethod = "reveal_in_folder";
    public const string ListSubdirectoriesMethod = "list_subdirectories";
    public const string CalculateFolderSizeMethod = "calculate_folder_size";
    public const string CountFolderItemsMethod = "count_folder_items";
    public const string CopyWithProgressMethod = "copy_with_progress";
    public const string MoveWithProgressMethod = "move_with_progress";
    public const string CancelOperationMethod = "cancel_operation";
    public const string SearchFilesMethod = "search_files";
    public const string CancelSearchMethod = "cancel_search";
    public const string WatchDirectoryMethod = "watch_directory";
    public const string UnwatchDirectoryMethod = "unwatch_directory";
    public const string ListDirectoryChunkEvent = "list_directory.chunk";
    public const string OperationProgressEvent = "operation-progress";
    public const string FileChangeEvent = "file-change";
    public const string SearchResultsBatchEvent = "search-results-batch";
    public const string SearchCompleteEvent = "search-complete";
    public const string UpdateChunkEvent = "update-chunk";

    public const int ErrParse = -32700;
    public const int ErrInvalidRequest = -32600;
    public const int ErrMethodNotFound = -32601;
    public const int ErrInvalidParams = -32602;
    public const int ErrInternal = -32603;
    public const int ErrApplication = -32000;
    public const int ErrHostOwned = -32001;
    public const int ErrHandshake = -32002;

    public const string PrefixConflict = "CONFLICT:";
    public const string PrefixTrashUnavailable = "TRASH_UNAVAILABLE:";
    public const string PrefixResultTooLarge = "RESULT_TOO_LARGE:";
    public const string PrefixHostOwned = "HOST_OWNED:";

    public const string ClientName = "SimpleFile.App";
    public const string Identifier = "com.simplefile.desktop";

    public static TimeSpan ConnectTimeout { get; } =
#if DEBUG
        TimeSpan.FromSeconds(5);
#else
        TimeSpan.FromSeconds(2);
#endif
}
