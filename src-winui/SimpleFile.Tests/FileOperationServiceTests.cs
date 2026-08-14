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

        // Dummy implementations for the rest
        public bool IsConnected => throw new NotImplementedException();
#pragma warning disable CS0067
        public event EventHandler<Exception?>? Disconnected;
#pragma warning restore CS0067
        public Task<HandshakeResult> HandshakeAsync(string authToken, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<TResult> InvokeAsync<TResult>(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task InvokeAsync(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public IDisposable On<T>(string eventName, Action<T> handler) => throw new NotImplementedException();
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
        public Task CancelOperationAsync(string operationId, CancellationToken ct = default) => throw new NotImplementedException();
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
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
}
