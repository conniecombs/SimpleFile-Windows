using SimpleFile.Ipc;

namespace SimpleFile.Core;

public sealed class FileOperationService
{
    private readonly ISimpleFileIpc _ipc;

    public FileOperationService(ISimpleFileIpc ipc)
    {
        _ipc = ipc;
    }

    // Create folder in the given parent directory.
    // Returns the full path of the created folder.
    public async Task<string> CreateFolderAsync(string parentPath, string name, CancellationToken ct = default)
    {
        return await _ipc.CreateDirectoryAsync(parentPath, name, ct).ConfigureAwait(false);
    }

    // Create file in the given parent directory.
    // Returns the full path of the created file.
    public async Task<string> CreateFileAsync(string parentPath, string name, CancellationToken ct = default)
    {
        return await _ipc.CreateFileAsync(parentPath, name, ct).ConfigureAwait(false);
    }

    // Permanently delete a file or directory.
    public async Task DeleteAsync(string path, CancellationToken ct = default)
    {
        await _ipc.DeleteEntryAsync(path, ct).ConfigureAwait(false);
    }

    // Move files to the system trash. Throws FileOperationException with
    // IsTrashUnavailable = true if the trash service is unavailable.
    public async Task TrashAsync(string[] paths, CancellationToken ct = default)
    {
        await _ipc.MoveToTrashAsync(paths, ct).ConfigureAwait(false);
    }

    // Rename a file or directory. Returns the new full path.
    public async Task<string> RenameAsync(string path, string newName, CancellationToken ct = default)
    {
        return await _ipc.RenameEntryAsync(path, newName, ct).ConfigureAwait(false);
    }

    // Batch rename. Returns the new full paths.
    public async Task<string[]> BatchRenameAsync(RenameRequest[] entries, CancellationToken ct = default)
    {
        return await _ipc.BatchRenameAsync(entries, ct).ConfigureAwait(false);
    }

    // Copy items to a destination with conflict resolution.
    // conflictAction: "error", "skip", "replace", "rename", "keep-both"
    // Returns transfer results.
    public async Task<TransferResult[]> CopyAsync(
        string[] sources,
        string destination,
        string conflictAction,
        IProgress<ProgressUpdate>? progress = null,
        Action<string>? operationStarted = null,
        CancellationToken ct = default)
    {
        var operationId = GenerateOperationId();
        operationStarted?.Invoke(operationId);
        IDisposable? subscription = null;
        if (progress != null)
        {
            subscription = _ipc.On<ProgressUpdate>(Protocol.OperationProgressEvent, update =>
            {
                if (update.OperationId == operationId)
                    progress.Report(update);
            });
        }
        try
        {
            return await _ipc.CopyWithProgressAsync(
                sources, destination, operationId, conflictAction, ct).ConfigureAwait(false);
        }
        finally
        {
            subscription?.Dispose();
        }
    }

    // Move items to a destination with conflict resolution.
    public async Task<TransferResult[]> MoveAsync(
        string[] sources,
        string destination,
        string conflictAction,
        IProgress<ProgressUpdate>? progress = null,
        Action<string>? operationStarted = null,
        CancellationToken ct = default)
    {
        var operationId = GenerateOperationId();
        operationStarted?.Invoke(operationId);
        IDisposable? subscription = null;
        if (progress != null)
        {
            subscription = _ipc.On<ProgressUpdate>(Protocol.OperationProgressEvent, update =>
            {
                if (update.OperationId == operationId)
                    progress.Report(update);
            });
        }
        try
        {
            return await _ipc.MoveWithProgressAsync(
                sources, destination, operationId, conflictAction, ct).ConfigureAwait(false);
        }
        finally
        {
            subscription?.Dispose();
        }
    }

    // Cancel an in-progress operation.
    public async Task CancelOperationAsync(string operationId, CancellationToken ct = default)
    {
        await _ipc.CancelOperationAsync(operationId, ct).ConfigureAwait(false);
    }

    public async Task<SearchResult[]> SearchAsync(
        SearchOptions options,
        Action<SearchResult[]>? onBatch = null,
        Action<int>? onComplete = null,
        CancellationToken ct = default)
    {
        return await _ipc.SearchFilesAsync(options, onBatch, onComplete, ct).ConfigureAwait(false);
    }

    public async Task CancelSearchAsync(string searchId, CancellationToken ct = default)
    {
        await _ipc.CancelSearchAsync(searchId, ct).ConfigureAwait(false);
    }

    public async Task WatchDirectoryAsync(string path, CancellationToken ct = default)
    {
        await _ipc.WatchDirectoryAsync(path, ct).ConfigureAwait(false);
    }

    public async Task UnwatchDirectoryAsync(CancellationToken ct = default)
    {
        await _ipc.UnwatchDirectoryAsync(ct).ConfigureAwait(false);
    }

    // Open a file in the default application.
    public async Task OpenFileAsync(string path, CancellationToken ct = default)
    {
        await _ipc.OpenFileAsync(path, ct).ConfigureAwait(false);
    }

    // Reveal a file in Windows Explorer.
    public async Task RevealInFolderAsync(string path, CancellationToken ct = default)
    {
        await _ipc.RevealInFolderAsync(path, ct).ConfigureAwait(false);
    }

    // Check if an IpcException represents a conflict.
    public static bool IsConflict(IpcException ex)
        => ex.Message.StartsWith(Protocol.PrefixConflict, StringComparison.Ordinal);

    // Check if an IpcException represents a trash unavailable error.
    public static bool IsTrashUnavailable(IpcException ex)
        => ex.Message.StartsWith(Protocol.PrefixTrashUnavailable, StringComparison.Ordinal);

    private static long _operationCounter;

    private static string GenerateOperationId()
    {
        var counter = Interlocked.Increment(ref _operationCounter);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        return $"op_{timestamp}_{counter}";
    }
}
