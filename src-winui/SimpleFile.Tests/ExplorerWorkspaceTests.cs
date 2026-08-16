using SimpleFile.Core;
using SimpleFile.Ipc;
using Xunit;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Tests;

public class ExplorerWorkspaceTests
{
    [Fact]
    public async Task Initialize_NavigatesHomeAndRecordsHistory()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();

        Assert.Equal(@"C:\Users\test", workspace.HomePath);
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
        Assert.Equal(["Desktop", "notes.txt"], workspace.VisibleEntries.Select(entry => entry.Name));
        Assert.Equal([@"C:\Users\test"], workspace.History);
        Assert.False(workspace.CanGoBack);
        Assert.True(workspace.CanGoUp);
    }

    [Fact]
    public async Task Navigate_PushesHistoryAndBackRestores()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();
        await workspace.NavigateToAsync(@"C:\Users\test\Desktop");

        Assert.Equal(@"C:\Users\test\Desktop", workspace.CurrentPath);
        Assert.True(workspace.CanGoBack);
        await workspace.GoBackAsync();
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
        Assert.True(workspace.CanGoForward);
        await workspace.GoForwardAsync();
        Assert.Equal(@"C:\Users\test\Desktop", workspace.CurrentPath);
    }

    [Fact]
    public async Task GoUp_UsesParentAndDoesNothingAtRoot()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();
        await workspace.NavigateToAsync(@"C:\Users\test\Desktop");
        await workspace.GoUpAsync();
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);

        await workspace.NavigateToAsync(@"C:\");
        await workspace.GoUpAsync();
        Assert.Equal(@"C:\", workspace.CurrentPath);
        Assert.False(workspace.CanGoUp);
    }

    [Fact]
    public async Task OpenFolder_Navigates_OpenFile_IsUnsupported()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();

        var folder = workspace.VisibleEntries.First(entry => entry.IsDir);
        await workspace.OpenEntryAsync(folder);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.CurrentPath);

        await workspace.NavigateToAsync(@"C:\Users\test");
        var file = workspace.VisibleEntries.First(entry => !entry.IsDir);
        await workspace.OpenEntryAsync(file);
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
        Assert.True(workspace.FileOpenUnsupported);
        Assert.Contains("not ported yet", workspace.StatusMessage, StringComparison.Ordinal);
    }

    [Fact]
    public async Task OpenArchiveFile_NavigatesIntoArchive()
    {
        var backend = FakeExplorerBackend.Typical();
        var archivePath = @"C:\Users\test\pack.zip";
        backend.Listings[@"C:\Users\test"].Entries.Add(new FileEntry
        {
            Name = "pack.zip",
            Path = archivePath,
            Extension = "zip",
            Size = 100,
        });
        backend.Listings[archivePath] = new DirectoryListing
        {
            Path = archivePath,
            Parent = @"C:\Users\test",
            Entries =
            [
                new FileEntry { Name = "inside.txt", Path = archivePath + @"\inside.txt", Size = 5 },
            ],
        };
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();

        var archive = workspace.VisibleEntries.First(entry => entry.Name == "pack.zip");
        await workspace.OpenEntryAsync(archive);

        Assert.Equal(archivePath, workspace.CurrentPath);
        Assert.Equal("inside.txt", workspace.VisibleEntries.Single().Name);
        Assert.False(workspace.FileOpenUnsupported);
    }

    [Fact]
    public async Task OpenPath_UnknownDirectoryType_ProbesEntryInfoAndNavigates()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.EntryInfo[@"C:\Users\test\Desktop"] = new FileEntry
        {
            Name = "Desktop",
            Path = @"C:\Users\test\Desktop",
            IsDir = true,
        };
        var workspace = new ExplorerWorkspace(backend, new FileOperationService(settingsIpc));
        await workspace.InitializeAsync();

        await workspace.OpenPathAsync(@"C:\Users\test\Desktop", isDirectory: null);

        Assert.Empty(settingsIpc.OpenedFiles);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.CurrentPath);
        Assert.Equal("shot.png", workspace.VisibleEntries.Single().Name);
    }

    [Fact]
    public async Task OpenPath_UnknownFileType_ProbesEntryInfoAndOpensFile()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.EntryInfo[@"C:\Users\test\notes.txt"] = new FileEntry
        {
            Name = "notes.txt",
            Path = @"C:\Users\test\notes.txt",
            Extension = "txt",
        };
        var workspace = new ExplorerWorkspace(backend, new FileOperationService(settingsIpc));
        await workspace.InitializeAsync();

        await workspace.OpenPathAsync(@"C:\Users\test\notes.txt", isDirectory: null);

        Assert.Equal([@"C:\Users\test\notes.txt"], settingsIpc.OpenedFiles);
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
        Assert.Equal(@"C:\Users\test\notes.txt", workspace.SelectedPath);
        Assert.Equal("Opened notes.txt", workspace.StatusMessage);
        Assert.Null(workspace.ErrorMessage);
    }

    [Fact]
    public async Task ApplyGitStatuses_UpdatesPaneEntriesWhenEnabled()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.GitFileStatuses[@"C:\Users\test"] =
        [
            new FileEntry
            {
                Name = "notes.txt",
                Path = @"C:\Users\test\notes.txt",
                GitStatus = "modified",
            },
        ];
        var workspace = new ExplorerWorkspace(backend, new FileOperationService(settingsIpc));
        await workspace.InitializeAsync();

        await workspace.ApplyGitStatusesAsync(PaneId.Primary);

        Assert.Equal(1, settingsIpc.GitStatusCalls);
        Assert.Equal(
            "modified",
            workspace.VisibleEntries.Single(entry => entry.Name == "notes.txt").GitStatus);
    }

    [Fact]
    public async Task NavigateSpecial_HomeAndDesktop()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();
        await workspace.NavigateSpecialAsync("navigateDesktop");
        Assert.Equal(@"C:\Users\test\Desktop", workspace.CurrentPath);
        await workspace.NavigateSpecialAsync("navigateHome");
        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
    }

    [Fact]
    public async Task ListDirectoryChunks_PaintBeforeFinalResult()
    {
        var backend = FakeExplorerBackend.Typical();
        backend.EmitChunks = true;
        var workspace = new ExplorerWorkspace(backend);
        var paints = 0;
        workspace.Changed += (_, _) =>
        {
            if (workspace.VisibleEntries.Count > 0)
            {
                paints += 1;
            }
        };

        await workspace.NavigateToAsync(@"C:\Users\test");
        Assert.True(paints >= 1);
        Assert.Equal(2, workspace.VisibleEntries.Count);
    }

    [Fact]
    public async Task ResultTooLarge_KeepsStreamedChunks()
    {
        var backend = FakeExplorerBackend.Typical();
        backend.ThrowTooLargeAfterChunks = true;
        var workspace = new ExplorerWorkspace(backend);
        await workspace.NavigateToAsync(@"C:\Users\test");
        Assert.NotEmpty(workspace.VisibleEntries);
        Assert.Contains(@"C:\Users\test", workspace.History);
        Assert.Contains("RESULT_TOO_LARGE", workspace.StatusMessage, StringComparison.Ordinal);
    }

    [Fact]
    public async Task StaleNavigation_IsIgnored()
    {
        var backend = FakeExplorerBackend.Typical();
        var first = new TaskCompletionSource<DirectoryListing>(TaskCreationOptions.RunContinuationsAsynchronously);
        backend.Pending["slow"] = first.Task;
        var workspace = new ExplorerWorkspace(backend);

        var slow = workspace.NavigateToAsync("slow");
        await workspace.NavigateToAsync(@"C:\Users\test");
        first.SetResult(new DirectoryListing
        {
            Path = "slow",
            Entries = [new FileEntry { Name = "stale", Path = @"slow\stale" }],
        });
        await slow;

        Assert.Equal(@"C:\Users\test", workspace.CurrentPath);
        Assert.DoesNotContain(workspace.VisibleEntries, entry => entry.Name == "stale");
    }

    [Fact]
    public async Task OfflineNetworkDrive_SetsPendingReconnect()
    {
        var backend = FakeExplorerBackend.Typical();
        backend.Drives.Add(new DriveInfo
        {
            Name = "Share (Z:)",
            Path = @"Z:\",
            DriveType = "Network",
            DriveStatus = "offline",
            StatusDetail = "The network path was not found",
        });
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();
        await workspace.OpenPathAsync(@"Z:\", isDirectory: true);
        Assert.NotNull(workspace.PendingReconnect);
        Assert.Equal(@"Z:\", workspace.PendingReconnect!.Path);
        Assert.NotEqual(@"Z:\", workspace.CurrentPath);
    }

    [Fact]
    public async Task RefreshDrives_UsesFallbackWhenEmpty()
    {
        var backend = FakeExplorerBackend.Typical();
        backend.Drives.Clear();
        var workspace = new ExplorerWorkspace(backend);
        await workspace.InitializeAsync();
        Assert.Single(workspace.Drives);
        Assert.Equal(@"C:\", workspace.Drives[0].Path);
    }

    [Fact]
    public async Task Initialize_RestoresSavedWorkspaceLayoutFromIpcSettings()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.Settings["startLocation"] = "last";
        var fileOps = new FileOperationService(settingsIpc);
        var first = new ExplorerWorkspace(backend, fileOps);
        await first.InitializeAsync();
        await first.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        await first.ToggleDualPaneAsync();
        await first.NavigatePaneAsync(PaneId.Secondary, @"C:\", HistoryMode.ReplaceCurrent);
        first.SetSort("size");
        await first.SaveWorkspaceLayoutAsync();

        var second = new ExplorerWorkspace(backend, fileOps);
        await second.InitializeAsync();

        Assert.True(second.DualPaneEnabled);
        Assert.Equal(@"C:\Users\test\Desktop", second.Primary.Path);
        Assert.Equal(@"C:\", second.Secondary.Path);
        Assert.Equal("size", second.SortBy);
        Assert.True(second.Primary.Tabs.Count >= 1);
        var activePrimaryTab = second.Primary.Tabs.First(tab => tab.Id == second.Primary.ActiveTabId);
        Assert.Equal(second.Primary.Path, activePrimaryTab.Path);
    }

    [Fact]
    public async Task Initialize_HomeStartLocationIgnoresSavedWorkspaceLayout()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.Settings["startLocation"] = "last";
        var fileOps = new FileOperationService(settingsIpc);
        var first = new ExplorerWorkspace(backend, fileOps);
        await first.InitializeAsync();
        await first.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        await first.ToggleDualPaneAsync();
        await first.NavigatePaneAsync(PaneId.Secondary, @"C:\", HistoryMode.ReplaceCurrent);
        await first.SaveWorkspaceLayoutAsync();

        settingsIpc.Settings["startLocation"] = "home";
        var second = new ExplorerWorkspace(backend, fileOps);
        await second.InitializeAsync();

        Assert.False(second.DualPaneEnabled);
        Assert.Equal(@"C:\Users\test", second.Primary.Path);
        Assert.Equal([@"C:\Users\test"], second.Primary.History);
    }

    [Fact]
    public async Task Initialize_CustomStartLocationIgnoresSavedWorkspaceLayout()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        settingsIpc.Settings["startLocation"] = "last";
        var fileOps = new FileOperationService(settingsIpc);
        var first = new ExplorerWorkspace(backend, fileOps);
        await first.InitializeAsync();
        await first.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        await first.SaveWorkspaceLayoutAsync();

        settingsIpc.Settings["startLocation"] = "custom";
        settingsIpc.Settings["customPath"] = @"C:\";
        var second = new ExplorerWorkspace(backend, fileOps);
        await second.InitializeAsync();

        Assert.False(second.DualPaneEnabled);
        Assert.Equal(@"C:\", second.Primary.Path);
        Assert.Equal([@"C:\"], second.Primary.History);
    }

    [Fact]
    public async Task UiSettings_RestoresColumnPresetAndWidths()
    {
        var backend = FakeExplorerBackend.Typical();
        var settingsIpc = new WorkspaceSettingsIpc();
        var fileOps = new FileOperationService(settingsIpc);
        var first = new ExplorerWorkspace(backend, fileOps);
        await first.InitializeAsync();
        var settings = UiSettings.CreateDefault();
        settings.ColumnPreset = "developer";
        settings.QuickAccessCollapsed = true;
        settings.MyPcCollapsed = true;
        first.ApplyUiSettings(settings);
        first.Columns.Resize("path", 360);
        await first.SaveUiSettingsAsync();

        var second = new ExplorerWorkspace(backend, fileOps);
        await second.InitializeAsync();

        Assert.Equal("developer", second.Settings.ColumnPreset);
        Assert.Equal(["name", "size", "date", "extension", "git", "symlink", "path"], second.Columns.VisibleColumns.Select(column => column.Id));
        Assert.Equal(360, second.Columns.WidthOf("path"));
        Assert.True(second.Settings.QuickAccessCollapsed);
        Assert.True(second.Settings.MyPcCollapsed);
    }

}
internal sealed class FakeExplorerBackend : IExplorerBackend
{
    public string Home { get; set; } = @"C:\Users\test";
    public List<DriveInfo> Drives { get; } = [];
    public Dictionary<string, DirectoryListing> Listings { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, Task<DirectoryListing>> Pending { get; } = new(StringComparer.OrdinalIgnoreCase);
    public bool EmitChunks { get; set; }
    public bool ThrowTooLargeAfterChunks { get; set; }

    public static FakeExplorerBackend Typical()
    {
        var backend = new FakeExplorerBackend();
        backend.Drives.Add(new DriveInfo
        {
            Name = "Windows (C:)",
            Path = @"C:\",
            DriveType = "Fixed",
            DriveStatus = "available",
            TotalSpace = 100,
            FreeSpace = 40,
        });
        backend.Listings[@"C:\Users\test"] = new DirectoryListing
        {
            Path = @"C:\Users\test",
            Parent = @"C:\Users",
            Entries =
            [
                new FileEntry { Name = "Desktop", Path = @"C:\Users\test\Desktop", IsDir = true },
                new FileEntry { Name = "notes.txt", Path = @"C:\Users\test\notes.txt", Extension = "txt", Size = 12 },
            ],
        };
        backend.Listings[@"C:\Users\test\Desktop"] = new DirectoryListing
        {
            Path = @"C:\Users\test\Desktop",
            Parent = @"C:\Users\test",
            Entries =
            [
                new FileEntry { Name = "shot.png", Path = @"C:\Users\test\Desktop\shot.png", Extension = "png" },
            ],
        };
        backend.Listings[@"C:\"] = new DirectoryListing
        {
            Path = @"C:\",
            Entries =
            [
                new FileEntry { Name = "Users", Path = @"C:\Users", IsDir = true },
            ],
        };
        return backend;
    }

    public Task<string> GetHomeDirAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(Home);
    }

    public Task<IReadOnlyList<DriveInfo>> ListDrivesAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IReadOnlyList<DriveInfo>>(Drives);
    }

    public async Task<DirectoryListing> ListDirectoryAsync(
        string path,
        Action<DirectoryListingChunk>? onChunk = null,
        CancellationToken cancellationToken = default)
    {
        if (Pending.TryGetValue(path, out var pending))
        {
            return await pending.WaitAsync(cancellationToken).ConfigureAwait(false);
        }

        if (!Listings.TryGetValue(path, out var listing))
        {
            throw new IpcException(Protocol.ErrApplication, $"Path is not a directory: {path}");
        }

        if (EmitChunks || ThrowTooLargeAfterChunks)
        {
            onChunk?.Invoke(new DirectoryListingChunk
            {
                Path = listing.Path,
                Entries = listing.Entries,
                ChunkIndex = 0,
                Done = true,
            });
        }

        if (ThrowTooLargeAfterChunks)
        {
            throw new IpcException(
                Protocol.ErrApplication,
                "RESULT_TOO_LARGE: list_directory result exceeds 80 MiB; use streamed chunks");
        }

        return listing;
    }
}

internal sealed class WorkspaceSettingsIpc : ISimpleFileIpc
{
    public Dictionary<string, string> Settings { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, FileEntry> EntryInfo { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, FileEntry[]> GitFileStatuses { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> OpenedFiles { get; } = [];
    public int GitStatusCalls { get; private set; }
    public bool IsConnected => true;

#pragma warning disable CS0067
    public event EventHandler<Exception?>? Disconnected;
#pragma warning restore CS0067

    public Task<string?> GetDbSettingAsync(string key, CancellationToken ct = default)
    {
        Settings.TryGetValue(key, out var value);
        return Task.FromResult<string?>(value);
    }

    public Task SetDbSettingAsync(string key, string value, CancellationToken ct = default)
    {
        Settings[key] = value;
        return Task.CompletedTask;
    }

    public Task<GitStatus> GetGitStatusAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<FileEntry[]> GetGitFileStatusesAsync(string path, CancellationToken ct = default)
    {
        GitStatusCalls += 1;
        return Task.FromResult(GitFileStatuses.TryGetValue(path, out var statuses) ? statuses : []);
    }

    public Task GitPullAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task GitPushAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelFolderSizeAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelFolderItemCountAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelCountItemsAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<bool> CheckRarInstalledAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<RarInstallPlan> PrepareRarInstallAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task DiscardRarInstallAsync(string confirmationToken, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> InstallRarAsync(string confirmationToken, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<CleanupResult> DiskCleanupAsync(string path, ulong? minSize, string? opId, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelDiskCleanupAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<DuplicateCheckResult> DuplicateCheckAsync(string path, ulong? minSize, ulong? hashBytes, string? opId, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelDuplicateCheckAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Tag[]> GetAllTagsAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Tag> CreateTagAsync(string name, string color, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Tag> UpdateTagAsync(long id, string name, string color, CancellationToken ct = default) => throw new NotImplementedException();
    public Task DeleteTagAsync(long id, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Tag[]> GetTagsForPathAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task SetTagsForPathAsync(string path, long[] tags, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Dictionary<string, Tag>> GetAllFileTagsAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string[]> GetFilesWithTagAsync(long id, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<SmartFolder[]> LoadSmartFoldersAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<SmartFolder[]> SaveSmartFolderAsync(SmartFolder folder, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<SmartFolder[]> DeleteSmartFolderAsync(string id, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<AppAboutInfo> GetAppAboutInfoAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task<UpdateInfo?> CheckForUpdateAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task InstallUpdateAsync(CancellationToken ct = default) => throw new NotImplementedException();
    public Task OpenTerminalAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task OpenPowershellAdminAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    public IDisposable On<T>(string eventName, Action<T> handler) => new NoopSubscription();
    public Task<HandshakeResult> HandshakeAsync(string authToken, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<TResult> InvokeAsync<TResult>(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task InvokeAsync(string method, object? args, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<DirectoryListing> ListDirectoryAsync(string path, Action<DirectoryListingChunk>? onChunk = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<HealthResult> HealthAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<string> GetAppVersionAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<string> GetHomeDirAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<IReadOnlyList<DriveInfo>> ListDrivesAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task SelectDirectoryAsync(string? defaultPath = null, CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task ShowMainWindowAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task ShutdownAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    public Task<string> CreateDirectoryAsync(string path, string name, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> CreateFileAsync(string path, string name, CancellationToken ct = default) => throw new NotImplementedException();
    public Task DeleteEntryAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task MoveToTrashAsync(string[] paths, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> RenameEntryAsync(string path, string newName, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string[]> BatchRenameAsync(RenameRequest[] entries, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> CopyEntryAsync(string source, string destination, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> MoveEntryAsync(string source, string destination, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> CopyEntryResolvedAsync(string source, string destination, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> MoveEntryResolvedAsync(string source, string destination, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<FileEntry> GetEntryInfoAsync(string path, CancellationToken ct = default)
    {
        if (EntryInfo.TryGetValue(path, out var entry))
        {
            return Task.FromResult(entry);
        }

        throw new IpcException(Protocol.ErrApplication, $"Path does not exist: {path}");
    }

    public Task OpenFileAsync(string path, CancellationToken ct = default)
    {
        OpenedFiles.Add(path);
        return Task.CompletedTask;
    }

    public Task RevealInFolderAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task OpenExternalUrlAsync(string url, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<ArchiveInfo> ListArchiveAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task ExtractArchiveAsync(string archivePath, string destination, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CreateArchiveAsync(string[] paths, string archivePath, string format, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<FilePreview> ReadFilePreviewAsync(string path, ulong? maxSize = null, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<string> GenerateThumbnailAsync(string path, uint size, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<ThumbnailResult[]> GenerateThumbnailsAsync(string[] paths, uint size, CancellationToken ct = default) => throw new NotImplementedException();
    public Task OpenFileWithAsync(string path, string application, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<FileComparison> CompareFilesAsync(string pathA, string pathB, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<Checksums> ComputeChecksumAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<ImageMetadata> GetImageMetadataAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<FileMetadata> GetFileMetadataAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<TreeNode[]> ListSubdirectoriesAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<ulong> CalculateFolderSizeAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<ulong> CountFolderItemsAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<TransferResult[]> CopyWithProgressAsync(string[] sources, string destination, string? operationId, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<TransferResult[]> MoveWithProgressAsync(string[] sources, string destination, string? operationId, string conflictAction, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelOperationAsync(string operationId, CancellationToken ct = default) => throw new NotImplementedException();
    public Task<SearchResult[]> SearchFilesAsync(SearchOptions options, Action<SearchResult[]>? onBatch = null, Action<int>? onComplete = null, CancellationToken ct = default) => throw new NotImplementedException();
    public Task CancelSearchAsync(string searchId, CancellationToken ct = default) => throw new NotImplementedException();
    public Task WatchDirectoryAsync(string path, CancellationToken ct = default) => throw new NotImplementedException();
    public Task UnwatchDirectoryAsync(CancellationToken ct = default) => throw new NotImplementedException();

    private sealed class NoopSubscription : IDisposable
    {
        public void Dispose()
        {
        }
    }
}
