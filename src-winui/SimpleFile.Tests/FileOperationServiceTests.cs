using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Xunit;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Tests;

public class FileOperationServiceTests
{
    private class StubIpc : ISimpleFileIpc
    {
        public Func<string, string, CancellationToken, Task<string>>? CreateDirectoryHandler;
        public Func<string, string, CancellationToken, Task<string>>? CreateFileHandler;
        public Func<string, string, CancellationToken, Task<string>>? RenameEntryHandler;
        public Func<string[], CancellationToken, Task>? MoveToTrashHandler;
        public Func<string[], string, string?, string, CancellationToken, Task<TransferResult[]>>? CopyWithProgressHandler;
        public Func<string, CancellationToken, Task>? CancelOperationHandler { get; set; }
        public Func<SearchOptions, Action<SearchResult[]>?, Action<int>?, CancellationToken, Task<SearchResult[]>>? SearchFilesHandler { get; set; }
        public Func<string, CancellationToken, Task>? CancelSearchHandler { get; set; }
        public Func<string, CancellationToken, Task>? WatchDirectoryHandler { get; set; }
        public Func<CancellationToken, Task>? UnwatchDirectoryHandler { get; set; }
        private readonly Dictionary<string, List<object>> _handlers = new();

        public Task<string> CreateDirectoryAsync(string path, string name, CancellationToken ct = default)
            => CreateDirectoryHandler?.Invoke(path, name, ct) ?? throw new NotImplementedException();

        public Task<string> CreateFileAsync(string path, string name, CancellationToken ct = default)
            => CreateFileHandler?.Invoke(path, name, ct) ?? throw new NotImplementedException();

        public Task<string> RenameEntryAsync(string path, string newName, CancellationToken ct = default)
            => RenameEntryHandler?.Invoke(path, newName, ct) ?? throw new NotImplementedException();

        public Task MoveToTrashAsync(string[] paths, CancellationToken ct = default)
        {
            if (MoveToTrashHandler != null)
                return MoveToTrashHandler(paths, ct);
            throw new NotImplementedException();
        }

        public Task<TransferResult[]> CopyWithProgressAsync(string[] sources, string destination, string? operationId, string conflictAction, CancellationToken ct = default)
            => CopyWithProgressHandler?.Invoke(sources, destination, operationId, conflictAction, ct) ?? throw new NotImplementedException();

        public Task CancelOperationAsync(string operationId, CancellationToken ct = default)
            => CancelOperationHandler?.Invoke(operationId, ct) ?? throw new NotImplementedException();

        public Task<SearchResult[]> SearchFilesAsync(SearchOptions options, Action<SearchResult[]>? onBatch = null, Action<int>? onComplete = null, CancellationToken ct = default)
            => SearchFilesHandler?.Invoke(options, onBatch, onComplete, ct) ?? throw new NotImplementedException();

        public Task CancelSearchAsync(string searchId, CancellationToken ct = default)
            => CancelSearchHandler?.Invoke(searchId, ct) ?? throw new NotImplementedException();

        public Task WatchDirectoryAsync(string path, CancellationToken ct = default)
            => WatchDirectoryHandler?.Invoke(path, ct) ?? throw new NotImplementedException();

        public Task UnwatchDirectoryAsync(CancellationToken ct = default)
            => UnwatchDirectoryHandler?.Invoke(ct) ?? throw new NotImplementedException();

        public int SubscriptionCount(string eventName)
            => _handlers.TryGetValue(eventName, out var handlers) ? handlers.Count : 0;

        public void Emit<T>(string eventName, T payload)
        {
            if (!_handlers.TryGetValue(eventName, out var handlers)) return;
            foreach (var handler in handlers.OfType<Action<T>>().ToArray())
            {
                handler(payload);
            }
        }

        // Dummy implementations for the rest
        public bool IsConnected => throw new NotImplementedException();
#pragma warning disable CS0067
        public event EventHandler<Exception?>? Disconnected;
#pragma warning restore CS0067
        public Task<HandshakeResult> HandshakeAsync(string authToken, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<TResult> InvokeAsync<TResult>(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task InvokeAsync(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public IDisposable On<T>(string eventName, Action<T> handler)
        {
            if (!_handlers.TryGetValue(eventName, out var handlers))
            {
                handlers = new List<object>();
                _handlers[eventName] = handlers;
            }
            handlers.Add(handler);
            return new TestSubscription(() => handlers.Remove(handler));
        }
        public Task<DirectoryListing> ListDirectoryAsync(string path, Action<DirectoryListingChunk>? onChunk = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<HealthResult> HealthAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<string> GetAppVersionAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<string> GetHomeDirAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<IReadOnlyList<DriveInfo>> ListDrivesAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task SelectDirectoryAsync(string? defaultPath = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task ShowMainWindowAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task ShutdownAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task DeleteEntryAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<string[]> BatchRenameAsync(RenameRequest[] entries, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<string> CopyEntryAsync(string source, string destination, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<string> MoveEntryAsync(string source, string destination, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<string> CopyEntryResolvedAsync(string source, string destination, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<string> MoveEntryResolvedAsync(string source, string destination, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<FileEntry> GetEntryInfoAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task OpenFileAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task RevealInFolderAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<TreeNode[]> ListSubdirectoriesAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<ulong> CalculateFolderSizeAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<ulong> CountFolderItemsAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
        public Task<TransferResult[]> MoveWithProgressAsync(string[] sources, string destination, string? operationId, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class TestSubscription : IDisposable
    {
        private readonly Action _dispose;
        private bool _disposed;

        public TestSubscription(Action dispose)
        {
            _dispose = dispose;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _dispose();
        }
    }

    private sealed class InlineProgress<T> : IProgress<T>
    {
        private readonly Action<T> _report;

        public InlineProgress(Action<T> report)
        {
            _report = report;
        }

        public void Report(T value) => _report(value);
    }

    [Fact]
    public async Task CreateFolderAsync_ReturnsPathFromIpc()
    {
        var stub = new StubIpc
        {
            CreateDirectoryHandler = (path, name, ct) => Task.FromResult($@"{path}\{name}")
        };
        var service = new FileOperationService(stub);

        var result = await service.CreateFolderAsync(@"C:\test", "newfolder");

        Assert.Equal(@"C:\test\newfolder", result);
    }

    [Fact]
    public async Task CreateFileAsync_ReturnsPathFromIpc()
    {
        var stub = new StubIpc
        {
            CreateFileHandler = (path, name, ct) => Task.FromResult($@"{path}\{name}")
        };
        var service = new FileOperationService(stub);

        var result = await service.CreateFileAsync(@"C:\test", "newfile.txt");

        Assert.Equal(@"C:\test\newfile.txt", result);
    }

    [Fact]
    public async Task RenameAsync_ReturnsNewPathFromIpc()
    {
        var stub = new StubIpc
        {
            RenameEntryHandler = (path, newName, ct) => Task.FromResult($@"C:\test\{newName}")
        };
        var service = new FileOperationService(stub);

        var result = await service.RenameAsync(@"C:\test\old.txt", "new.txt");

        Assert.Equal(@"C:\test\new.txt", result);
    }

    [Fact]
    public async Task TrashAsync_CallsIpcWithCorrectPaths()
    {
        string[]? receivedPaths = null;
        var stub = new StubIpc
        {
            MoveToTrashHandler = (paths, ct) =>
            {
                receivedPaths = paths;
                return Task.CompletedTask;
            }
        };
        var service = new FileOperationService(stub);
        var inputPaths = new[] { @"C:\test\file1.txt", @"C:\test\file2.txt" };

        await service.TrashAsync(inputPaths);

        Assert.Equal(inputPaths, receivedPaths);
    }

    [Fact]
    public void IsConflict_CorrectlyDetectsConflictPrefix()
    {
        var conflictEx = new IpcException(Protocol.ErrApplication, "CONFLICT: file exists");
        var otherEx = new IpcException(Protocol.ErrApplication, "some other error");

        Assert.True(FileOperationService.IsConflict(conflictEx));
        Assert.False(FileOperationService.IsConflict(otherEx));
    }

    [Fact]
    public void IsTrashUnavailable_CorrectlyDetectsTrashUnavailablePrefix()
    {
        var trashEx = new IpcException(Protocol.ErrApplication, "TRASH_UNAVAILABLE: no trash on this drive");
        var otherEx = new IpcException(Protocol.ErrApplication, "some other error");

        Assert.True(FileOperationService.IsTrashUnavailable(trashEx));
        Assert.False(FileOperationService.IsTrashUnavailable(otherEx));
    }

    [Fact]
    public async Task GenerateOperationId_FormatCheck()
    {
        string? capturedOpId = null;
        var stub = new StubIpc
        {
            CopyWithProgressHandler = (sources, dest, opId, conflictAction, ct) => 
            {
                capturedOpId = opId;
                return Task.FromResult(Array.Empty<TransferResult>());
            }
        };
        var service = new FileOperationService(stub);

        await service.CopyAsync(new[] { "a" }, "b", "error");

        Assert.NotNull(capturedOpId);
        Assert.Matches(@"^op_\d+_\d+$", capturedOpId);
    }

    [Fact]
    public async Task CopyAsync_ReportsProgressAndDisposesSubscription()
    {
        var seen = new List<ProgressUpdate>();
        var stub = new StubIpc();
        stub.CopyWithProgressHandler = (sources, dest, opId, conflictAction, ct) =>
        {
            stub.Emit(
                Protocol.OperationProgressEvent,
                new ProgressUpdate
                {
                    OperationId = opId!,
                    OperationType = "copy",
                    Current = 1,
                    Total = 2,
                    Status = "running",
                });
            return Task.FromResult(Array.Empty<TransferResult>());
        };
        var service = new FileOperationService(stub);

        await service.CopyAsync(
            new[] { "a" },
            "b",
            "error",
            new InlineProgress<ProgressUpdate>(seen.Add));

        Assert.Single(seen);
        Assert.Equal(0, stub.SubscriptionCount(Protocol.OperationProgressEvent));

        stub.Emit(
            Protocol.OperationProgressEvent,
            new ProgressUpdate { OperationId = seen[0].OperationId, Status = "running" });
        Assert.Single(seen);
    }

    [Fact]
    public async Task CancelOperationAsync_CallsNamedIpcCancel()
    {
        string? cancelled = null;
        var stub = new StubIpc
        {
            CancelOperationHandler = (operationId, ct) =>
            {
                cancelled = operationId;
                return Task.CompletedTask;
            }
        };
        var service = new FileOperationService(stub);

        await service.CancelOperationAsync("op_123_4");

        Assert.Equal("op_123_4", cancelled);
    }

    [Fact]
    public async Task SearchAsync_StreamsEventsAndDisposesSubscriptions()
    {
        var batches = new List<SearchResult[]>();
        var completes = new List<int>();
        var stub = new StubIpc
        {
            SearchFilesHandler = (options, onBatch, onComplete, ct) =>
            {
                onBatch?.Invoke(new[] { new SearchResult { Name = "alpha.txt", Path = @"C:\alpha.txt" } });
                onComplete?.Invoke(1);
                return Task.FromResult(new[] { new SearchResult { Name = "alpha.txt", Path = @"C:\alpha.txt" } });
            }
        };
        var service = new FileOperationService(stub);

        var results = await service.SearchAsync(
            new SearchOptions { Query = "alpha", SearchPath = @"C:\" },
            batches.Add,
            completes.Add);

        Assert.Single(results);
        Assert.Single(batches);
        Assert.Equal([1], completes);
    }
}
