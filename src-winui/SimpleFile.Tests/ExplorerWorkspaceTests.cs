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
