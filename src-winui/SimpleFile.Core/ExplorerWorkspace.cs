using SimpleFile.Ipc;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Core;

public enum HistoryMode
{
    Push,
    ReplaceCurrent,
    None,
}

/// <summary>
/// Primary-pane navigation ported from frontend/src/lib/app/core.ts loadDirectory /
/// openEntryPath / navigateHistory / navigateSpecial.
/// </summary>
public sealed class ExplorerWorkspace
{
    public static readonly IReadOnlyList<(string Name, string Icon, string Command)> QuickAccessLocations =
    [
        ("Home", "\uD83C\uDFE0", "navigateHome"),
        ("Desktop", "\uD83D\uDCBB", "navigateDesktop"),
        ("Downloads", "\uD83D\uDCE5", "navigateDownloads"),
        ("Documents", "\uD83D\uDCC4", "navigateDocuments"),
        ("Pictures", "\uD83D\uDDBC\uFE0F", "navigatePictures"),
    ];

    private static readonly Dictionary<string, string> SpecialFolders = new(StringComparer.Ordinal)
    {
        ["navigateDesktop"] = "Desktop",
        ["navigateDocuments"] = "Documents",
        ["navigateDownloads"] = "Downloads",
        ["navigatePictures"] = "Pictures",
    };

    private readonly IExplorerBackend _backend;
    private readonly object _gate = new();
    private int _navigationToken;
    private readonly List<string> _history = [];
    private int _historyIndex = -1;
    private List<FileEntry> _entries = [];
    private List<DriveInfo> _drives = [];

    public ExplorerWorkspace(IExplorerBackend backend)
    {
        _backend = backend;
    }

    public event EventHandler? Changed;

    public string HomePath { get; private set; } = "";
    public string CurrentPath { get; private set; } = "";
    public bool IsNavigating { get; private set; }
    public bool ListingInProgress { get; private set; }
    public bool PathIsNetwork { get; private set; }
    public string SortBy { get; private set; } = "name";
    public bool SortAscending { get; private set; } = true;
    public bool ShowHiddenFiles { get; private set; }
    public string FilterQuery { get; private set; } = "";
    public string? ErrorMessage { get; private set; }
    public string? StatusMessage { get; private set; }
    public string? SelectedPath { get; private set; }
    public DriveInfo? PendingReconnect { get; private set; }
    public bool FileOpenUnsupported { get; private set; }

    public IReadOnlyList<DriveInfo> Drives => _drives;
    public IReadOnlyList<FileEntry> Entries => _entries;
    public IReadOnlyList<string> History => _history;
    public int HistoryIndex => _historyIndex;

    public IReadOnlyList<FileEntry> VisibleEntries =>
        EntryPresentation.VisibleEntries(_entries, FilterQuery, ShowHiddenFiles, SortBy, SortAscending);

    public IReadOnlyList<BreadcrumbSegment> Breadcrumbs => BreadcrumbBuilder.FromPath(CurrentPath);

    public bool CanGoBack => _historyIndex > 0;
    public bool CanGoForward => _historyIndex >= 0 && _historyIndex < _history.Count - 1;
    public bool CanGoUp => PathRules.GetParentPath(CurrentPath) is not null;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        HomePath = await _backend.GetHomeDirAsync(cancellationToken).ConfigureAwait(false);
        await RefreshDrivesAsync(quiet: true, cancellationToken).ConfigureAwait(false);
        await NavigateToAsync(HomePath, HistoryMode.Push, cancellationToken).ConfigureAwait(false);
    }

    public async Task RefreshDrivesAsync(bool quiet = false, CancellationToken cancellationToken = default)
    {
        try
        {
            var drives = await _backend.ListDrivesAsync(cancellationToken).ConfigureAwait(false);
            lock (_gate)
            {
                if (drives.Count > 0)
                {
                    _drives = [.. drives];
                }
                else
                {
                    var fallback = PathRules.CreateFallbackDriveForPath(
                        string.IsNullOrEmpty(HomePath) ? CurrentPath : HomePath);
                    _drives = fallback is null ? [] : [fallback];
                }

                if (!quiet)
                {
                    var offline = _drives.Count(drive =>
                    {
                        var status = DrivePresentation.Status(drive);
                        return status is "offline" or "stale";
                    });
                    StatusMessage = offline > 0
                        ? $"Drives refreshed · {offline} network mapping{(offline == 1 ? "" : "s")} need attention"
                        : "Drives refreshed";
                    ErrorMessage = null;
                }
            }
        }
        catch (Exception exception)
        {
            lock (_gate)
            {
                if (!quiet)
                {
                    ErrorMessage = exception.Message;
                }
            }
        }

        RaiseChanged();
    }

    public async Task NavigateToAsync(
        string path,
        HistoryMode historyMode = HistoryMode.Push,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var token = Interlocked.Increment(ref _navigationToken);
        List<FileEntry> progressive = [];

        lock (_gate)
        {
            IsNavigating = true;
            ListingInProgress = true;
            CurrentPath = path;
            _entries = [];
            SelectedPath = null;
            ErrorMessage = null;
            FileOpenUnsupported = false;
            PendingReconnect = null;
            PathIsNetwork = PathRules.IsNetworkFsPath(path, _drives);
        }

        RaiseChanged();

        try
        {
            DirectoryListing listing;
            try
            {
                listing = await _backend.ListDirectoryAsync(
                        path,
                        chunk =>
                        {
                            if (token != Volatile.Read(ref _navigationToken))
                            {
                                return;
                            }

                            lock (_gate)
                            {
                                if (chunk.IsNetwork)
                                {
                                    PathIsNetwork = true;
                                }

                                if (!string.IsNullOrEmpty(chunk.Path))
                                {
                                    CurrentPath = chunk.Path;
                                }

                                progressive.AddRange(chunk.Entries);
                                _entries = [.. progressive];
                                if (progressive.Count > 0)
                                {
                                    IsNavigating = false;
                                }
                            }

                            RaiseChanged();
                        },
                        cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (IpcException exception) when (exception.IsResultTooLarge && progressive.Count > 0)
            {
                lock (_gate)
                {
                    if (token != _navigationToken)
                    {
                        return;
                    }

                    RecordHistoryUnlocked(CurrentPath, historyMode);
                    StatusMessage = exception.Message;
                }

                RaiseChanged();
                return;
            }

            if (token != Volatile.Read(ref _navigationToken))
            {
                return;
            }

            lock (_gate)
            {
                CurrentPath = listing.Path;
                _entries = [.. listing.Entries];
                PathIsNetwork = listing.IsNetwork || PathRules.IsNetworkFsPath(listing.Path, _drives);
                RecordHistoryUnlocked(listing.Path, historyMode);
                StatusMessage = null;
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            if (token != Volatile.Read(ref _navigationToken))
            {
                return;
            }

            var refreshNetworkStatus = false;
            lock (_gate)
            {
                var drive = DrivePresentation.FindDriveForPath(path, _drives);
                ErrorMessage = drive is not null && DrivePresentation.IsNetwork(drive)
                    ? (drive.StatusDetail ?? exception.Message)
                    : exception.Message;
                refreshNetworkStatus = drive is not null && DrivePresentation.IsNetwork(drive);
            }

            if (refreshNetworkStatus)
            {
                await RefreshDrivesAsync(quiet: true, CancellationToken.None).ConfigureAwait(false);
            }
        }
        finally
        {
            if (token == Volatile.Read(ref _navigationToken))
            {
                lock (_gate)
                {
                    IsNavigating = false;
                    ListingInProgress = false;
                }

                RaiseChanged();
            }
        }
    }

    public Task GoBackAsync(CancellationToken cancellationToken = default)
    {
        string? path = null;
        lock (_gate)
        {
            if (_historyIndex <= 0)
            {
                return Task.CompletedTask;
            }

            _historyIndex -= 1;
            path = _history[_historyIndex];
        }

        return NavigateToAsync(path!, HistoryMode.None, cancellationToken);
    }

    public Task GoForwardAsync(CancellationToken cancellationToken = default)
    {
        string? path = null;
        lock (_gate)
        {
            if (_historyIndex < 0 || _historyIndex >= _history.Count - 1)
            {
                return Task.CompletedTask;
            }

            _historyIndex += 1;
            path = _history[_historyIndex];
        }

        return NavigateToAsync(path!, HistoryMode.None, cancellationToken);
    }

    public Task GoUpAsync(CancellationToken cancellationToken = default)
    {
        var parent = PathRules.GetParentPath(CurrentPath);
        return parent is null
            ? Task.CompletedTask
            : NavigateToAsync(parent, HistoryMode.Push, cancellationToken);
    }

    public Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        return string.IsNullOrEmpty(CurrentPath)
            ? Task.CompletedTask
            : NavigateToAsync(CurrentPath, HistoryMode.None, cancellationToken);
    }

    public Task NavigateSpecialAsync(string command, CancellationToken cancellationToken = default)
    {
        if (command == "navigateHome")
        {
            return NavigateToAsync(HomePath, HistoryMode.Push, cancellationToken);
        }

        if (SpecialFolders.TryGetValue(command, out var folder))
        {
            return NavigateToAsync(PathRules.JoinPath(HomePath, folder), HistoryMode.Push, cancellationToken);
        }

        return Task.CompletedTask;
    }

    public Task OpenEntryAsync(FileEntry entry, CancellationToken cancellationToken = default)
    {
        return OpenPathAsync(entry.Path, entry.IsDir, cancellationToken);
    }

    public async Task OpenPathAsync(
        string path,
        bool? isDirectory = null,
        CancellationToken cancellationToken = default)
    {
        FileOpenUnsupported = false;
        var shouldNavigate = isDirectory;
        var drive = DrivePresentation.FindDriveForPath(path, _drives);
        if (drive is not null && PathRules.PathsEqual(drive.Path, path))
        {
            shouldNavigate = true;
            if (DrivePresentation.IsNetwork(drive) && !DrivePresentation.IsAvailable(drive))
            {
                PendingReconnect = drive;
                RaiseChanged();
                return;
            }
        }

        if (shouldNavigate == true)
        {
            await NavigateToAsync(path, HistoryMode.Push, cancellationToken).ConfigureAwait(false);
            return;
        }

        if (shouldNavigate == false)
        {
            lock (_gate)
            {
                FileOpenUnsupported = true;
                SelectedPath = path;
                StatusMessage = "Opening files in an external app is not ported yet.";
            }

            RaiseChanged();
            return;
        }

        await NavigateToAsync(path, HistoryMode.Push, cancellationToken).ConfigureAwait(false);
    }

    public async Task RetryPendingDriveAsync(CancellationToken cancellationToken = default)
    {
        var pending = PendingReconnect;
        PendingReconnect = null;
        if (pending is null)
        {
            return;
        }

        await RefreshDrivesAsync(quiet: true, cancellationToken).ConfigureAwait(false);
        var updated = DrivePresentation.FindDriveForPath(pending.Path, _drives);
        if (updated is not null && DrivePresentation.IsAvailable(updated))
        {
            StatusMessage = string.IsNullOrEmpty(updated.RemotePath)
                ? "Network drive is available again"
                : $"Connected to {updated.RemotePath}";
            await NavigateToAsync(pending.Path, HistoryMode.Push, cancellationToken).ConfigureAwait(false);
            return;
        }

        ErrorMessage = updated?.StatusDetail ?? "The network drive is still unavailable.";
        RaiseChanged();
    }

    public void CancelPendingReconnect()
    {
        PendingReconnect = null;
        RaiseChanged();
    }

    public void SelectPath(string? path)
    {
        SelectedPath = path;
        RaiseChanged();
    }

    public void SetSort(string sortBy)
    {
        if (string.Equals(SortBy, sortBy, StringComparison.OrdinalIgnoreCase))
        {
            SortAscending = !SortAscending;
        }
        else
        {
            SortBy = sortBy;
            SortAscending = true;
        }

        RaiseChanged();
    }

    public void SetFilterQuery(string query)
    {
        FilterQuery = query;
        RaiseChanged();
    }

    public void ClearStatus()
    {
        StatusMessage = null;
        ErrorMessage = null;
        FileOpenUnsupported = false;
        RaiseChanged();
    }

    private void RecordHistoryUnlocked(string path, HistoryMode mode)
    {
        if (mode == HistoryMode.None)
        {
            return;
        }

        if (mode == HistoryMode.ReplaceCurrent && _historyIndex >= 0)
        {
            _history[_historyIndex] = path;
            return;
        }

        if (_historyIndex >= 0 && _historyIndex < _history.Count && _history[_historyIndex] == path)
        {
            return;
        }

        if (_historyIndex + 1 < _history.Count)
        {
            _history.RemoveRange(_historyIndex + 1, _history.Count - _historyIndex - 1);
        }

        _history.Add(path);
        _historyIndex = _history.Count - 1;
    }

    private void RaiseChanged()
    {
        Changed?.Invoke(this, EventArgs.Empty);
    }
}
