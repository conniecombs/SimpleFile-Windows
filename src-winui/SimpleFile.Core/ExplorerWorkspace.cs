using SimpleFile.Ipc;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Core;

/// <summary>
/// Dual-pane navigation + pane-local tabs, ported from
/// frontend/src/lib/app/core.ts (loadDirectory, loadSecondaryDirectory,
/// loadDirectoryForPane, toggleDualPane, openNewTab / switchToTab / closeTab,
/// activatePane) and SidebarShell sidebar targeting.
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
    private List<DriveInfo> _drives = [];

    public ExplorerWorkspace(IExplorerBackend backend, FileOperationService? fileOps = null)
    {
        _backend = backend;
        FileOps = fileOps;
        Clipboard = new ClipboardState();
        Primary = new ExplorerPane(PaneId.Primary);
        Secondary = new ExplorerPane(PaneId.Secondary);
    }

    public event EventHandler? Changed;

    public FileOperationService? FileOps { get; }
    public ClipboardState Clipboard { get; }
    public ExplorerPane Primary { get; }
    public ExplorerPane Secondary { get; }

    public string HomePath { get; private set; } = "";
    public bool DualPaneEnabled { get; private set; }
    public PaneId ActivePane { get; private set; } = PaneId.Primary;
    public string SortBy { get; private set; } = "name";
    public bool SortAscending { get; private set; } = true;
    public bool ShowHiddenFiles { get; private set; }
    public string FilterQuery { get; private set; } = "";
    public string? ErrorMessage { get; private set; }
    public string? StatusMessage { get; private set; }
    public DriveInfo? PendingReconnect { get; private set; }
    public PaneId PendingReconnectPane { get; private set; } = PaneId.Primary;
    public bool FileOpenUnsupported { get; private set; }

    public IReadOnlyList<DriveInfo> Drives => _drives;

    public PaneId SidebarTarget =>
        DualPaneEnabled && ActivePane == PaneId.Secondary ? PaneId.Secondary : PaneId.Primary;

    public ExplorerPane Active => Pane(ActivePane);

    public ExplorerPane Pane(PaneId pane) =>
        Normalize(pane) == PaneId.Secondary ? Secondary : Primary;

    public PaneId Normalize(PaneId pane) =>
        pane == PaneId.Secondary && DualPaneEnabled ? PaneId.Secondary : PaneId.Primary;

    public string CurrentPath => Primary.Path;
    public IReadOnlyList<FileEntry> Entries => Primary.Entries;
    public IReadOnlyList<string> History => Primary.History;
    public int HistoryIndex => Primary.HistoryIndex;
    public IReadOnlyList<FileEntry> VisibleEntries =>
        Primary.VisibleEntries(SortBy, SortAscending, ShowHiddenFiles, FilterQuery);
    public IReadOnlyList<BreadcrumbSegment> Breadcrumbs => Primary.Breadcrumbs;
    public bool IsNavigating => Primary.IsNavigating;
    public bool ListingInProgress => Primary.ListingInProgress;
    public bool PathIsNetwork => Primary.PathIsNetwork;
    public string? SelectedPath => Active.SelectedPath;
    public bool CanGoBack => Active.CanGoBack;
    public bool CanGoForward => Active.CanGoForward;
    public bool CanGoUp => Active.CanGoUp;

    public string? ActivePaneLabel =>
        DualPaneEnabled ? (ActivePane == PaneId.Secondary ? "Right pane" : "Left pane") : null;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        HomePath = await _backend.GetHomeDirAsync(cancellationToken).ConfigureAwait(false);
        await RefreshDrivesAsync(quiet: true, cancellationToken).ConfigureAwait(false);
        await NavigatePaneAsync(PaneId.Primary, HomePath, HistoryMode.Push, activate: false, cancellationToken)
            .ConfigureAwait(false);
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
                        string.IsNullOrEmpty(HomePath) ? Primary.Path : HomePath);
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

    public Task NavigateToAsync(
        string path,
        HistoryMode historyMode = HistoryMode.Push,
        CancellationToken cancellationToken = default)
    {
        return NavigatePaneAsync(ActivePane, path, historyMode, activate: false, cancellationToken);
    }

    public async Task NavigatePaneAsync(
        PaneId pane,
        string path,
        HistoryMode historyMode = HistoryMode.Push,
        bool activate = true,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var target = Normalize(pane);
        var state = Pane(target);
        if (activate && DualPaneEnabled)
        {
            ActivePane = target;
        }

        var token = state.NextNavigationToken();
        List<FileEntry> progressive = [];

        lock (_gate)
        {
            state.IsNavigating = true;
            state.ListingInProgress = true;
            state.Path = path;
            state.Entries = [];
            state.SelectedPath = null;
            ErrorMessage = null;
            FileOpenUnsupported = false;
            PendingReconnect = null;
            state.PathIsNetwork = PathRules.IsNetworkFsPath(path, _drives);
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
                            if (token != state.NavigationToken)
                            {
                                return;
                            }

                            lock (_gate)
                            {
                                if (chunk.IsNetwork)
                                {
                                    state.PathIsNetwork = true;
                                }

                                if (!string.IsNullOrEmpty(chunk.Path))
                                {
                                    state.Path = chunk.Path;
                                }

                                progressive.AddRange(chunk.Entries);
                                state.Entries = [.. progressive];
                                if (progressive.Count > 0)
                                {
                                    state.IsNavigating = false;
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
                    if (token != state.NavigationToken)
                    {
                        return;
                    }

                    state.RecordHistory(state.Path, historyMode);
                    state.SyncActiveTab();
                    StatusMessage = exception.Message;
                }

                RaiseChanged();
                return;
            }

            if (token != state.NavigationToken)
            {
                return;
            }

            lock (_gate)
            {
                state.Path = listing.Path;
                state.Entries = [.. listing.Entries];
                state.PathIsNetwork = listing.IsNetwork || PathRules.IsNetworkFsPath(listing.Path, _drives);
                state.RecordHistory(listing.Path, historyMode);
                state.SyncActiveTab();
                StatusMessage = null;
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            if (token != state.NavigationToken)
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
            if (token == state.NavigationToken)
            {
                lock (_gate)
                {
                    state.IsNavigating = false;
                    state.ListingInProgress = false;
                }

                RaiseChanged();
            }
        }
    }

    public Task GoBackAsync(CancellationToken cancellationToken = default)
    {
        return GoBackAsync(ActivePane, cancellationToken);
    }

    public Task GoBackAsync(PaneId pane, CancellationToken cancellationToken = default)
    {
        string? path = null;
        lock (_gate)
        {
            var state = Pane(pane);
            if (!state.CanGoBack)
            {
                return Task.CompletedTask;
            }

            state.HistoryIndex -= 1;
            path = state.History[state.HistoryIndex];
        }

        return NavigatePaneAsync(pane, path!, HistoryMode.None, activate: DualPaneEnabled, cancellationToken);
    }

    public Task GoForwardAsync(CancellationToken cancellationToken = default)
    {
        return GoForwardAsync(ActivePane, cancellationToken);
    }

    public Task GoForwardAsync(PaneId pane, CancellationToken cancellationToken = default)
    {
        string? path = null;
        lock (_gate)
        {
            var state = Pane(pane);
            if (!state.CanGoForward)
            {
                return Task.CompletedTask;
            }

            state.HistoryIndex += 1;
            path = state.History[state.HistoryIndex];
        }

        return NavigatePaneAsync(pane, path!, HistoryMode.None, activate: DualPaneEnabled, cancellationToken);
    }

    public Task GoUpAsync(CancellationToken cancellationToken = default)
    {
        return GoUpAsync(ActivePane, cancellationToken);
    }

    public Task GoUpAsync(PaneId pane, CancellationToken cancellationToken = default)
    {
        var parent = PathRules.GetParentPath(Pane(pane).Path);
        return parent is null
            ? Task.CompletedTask
            : NavigatePaneAsync(pane, parent, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken);
    }

    public Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        return RefreshAsync(ActivePane, cancellationToken);
    }

    public Task RefreshAsync(PaneId pane, CancellationToken cancellationToken = default)
    {
        var path = Pane(pane).Path;
        return string.IsNullOrEmpty(path)
            ? Task.CompletedTask
            : NavigatePaneAsync(pane, path, HistoryMode.None, activate: false, cancellationToken);
    }

    public Task NavigateSpecialAsync(string command, CancellationToken cancellationToken = default)
    {
        return NavigateSpecialAsync(command, SidebarTarget, cancellationToken);
    }

    public Task NavigateSpecialAsync(string command, PaneId pane, CancellationToken cancellationToken = default)
    {
        if (command == "navigateHome")
        {
            return NavigatePaneAsync(pane, HomePath, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken);
        }

        if (SpecialFolders.TryGetValue(command, out var folder))
        {
            return NavigatePaneAsync(
                pane,
                PathRules.JoinPath(HomePath, folder),
                HistoryMode.Push,
                activate: DualPaneEnabled,
                cancellationToken);
        }

        return Task.CompletedTask;
    }

    public Task OpenEntryAsync(FileEntry entry, CancellationToken cancellationToken = default)
    {
        return OpenPathAsync(entry.Path, entry.IsDir, ActivePane, cancellationToken);
    }

    public Task OpenEntryAsync(FileEntry entry, PaneId pane, CancellationToken cancellationToken = default)
    {
        return OpenPathAsync(entry.Path, entry.IsDir, pane, cancellationToken);
    }

    public Task OpenPathAsync(
        string path,
        bool? isDirectory = null,
        CancellationToken cancellationToken = default)
    {
        return OpenPathAsync(path, isDirectory, ActivePane, cancellationToken);
    }

    public async Task OpenPathAsync(
        string path,
        bool? isDirectory,
        PaneId pane,
        CancellationToken cancellationToken = default)
    {
        FileOpenUnsupported = false;
        var target = Normalize(pane);
        var shouldNavigate = isDirectory;
        var drive = DrivePresentation.FindDriveForPath(path, _drives);
        if (drive is not null && PathRules.PathsEqual(drive.Path, path))
        {
            shouldNavigate = true;
            if (DrivePresentation.IsNetwork(drive) && !DrivePresentation.IsAvailable(drive))
            {
                PendingReconnect = drive;
                PendingReconnectPane = target;
                RaiseChanged();
                return;
            }
        }

        if (shouldNavigate == true)
        {
            await NavigatePaneAsync(target, path, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        if (shouldNavigate == false)
        {
            lock (_gate)
            {
                FileOpenUnsupported = true;
                Pane(target).SelectedPath = path;
                StatusMessage = "Opening files in an external app is not ported yet.";
            }

            RaiseChanged();
            return;
        }

        await NavigatePaneAsync(target, path, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task RetryPendingDriveAsync(CancellationToken cancellationToken = default)
    {
        var pending = PendingReconnect;
        var pane = PendingReconnectPane;
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
            await NavigatePaneAsync(pane, pending.Path, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken)
                .ConfigureAwait(false);
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

    public async Task ToggleDualPaneAsync(CancellationToken cancellationToken = default)
    {
        if (DualPaneEnabled)
        {
            DualPaneEnabled = false;
            ActivatePane(PaneId.Primary);
            return;
        }

        DualPaneEnabled = true;
        if (string.IsNullOrEmpty(Secondary.Path))
        {
            await NavigatePaneAsync(
                    PaneId.Secondary,
                    Primary.Path,
                    HistoryMode.ReplaceCurrent,
                    activate: false,
                    cancellationToken)
                .ConfigureAwait(false);
        }

        ActivatePane(PaneId.Primary);
    }

    public void ActivatePane(PaneId pane)
    {
        if (!DualPaneEnabled)
        {
            ActivePane = PaneId.Primary;
            RaiseChanged();
            return;
        }

        ActivePane = pane == PaneId.Secondary ? PaneId.Secondary : PaneId.Primary;
        RaiseChanged();
    }

    public void SwitchActivePane()
    {
        if (!DualPaneEnabled)
        {
            return;
        }

        ActivatePane(ActivePane == PaneId.Primary ? PaneId.Secondary : PaneId.Primary);
    }

    public async Task FocusSecondaryAsync(CancellationToken cancellationToken = default)
    {
        if (!DualPaneEnabled)
        {
            await ToggleDualPaneAsync(cancellationToken).ConfigureAwait(false);
        }

        ActivatePane(PaneId.Secondary);
    }

    public async Task OpenNewTabAsync(PaneId? pane = null, string? path = null, CancellationToken cancellationToken = default)
    {
        var target = Normalize(pane ?? ActivePane);
        var state = Pane(target);
        var targetPath = path ?? state.Path;
        if (string.IsNullOrEmpty(targetPath))
        {
            targetPath = HomePath;
        }

        if (string.IsNullOrEmpty(targetPath))
        {
            return;
        }

        var tab = ExplorerPane.CreateTab(targetPath);
        lock (_gate)
        {
            state.Tabs.Add(tab);
            state.ApplyTabHistory(tab);
        }

        await NavigatePaneAsync(target, targetPath, HistoryMode.ReplaceCurrent, activate: DualPaneEnabled, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task SwitchToTabAsync(string tabId, PaneId pane, CancellationToken cancellationToken = default)
    {
        var target = Normalize(pane);
        FileTab? tab;
        lock (_gate)
        {
            tab = Pane(target).Tabs.FirstOrDefault(candidate => candidate.Id == tabId);
            if (tab is null)
            {
                return;
            }

            Pane(target).ApplyTabHistory(tab);
        }

        await NavigatePaneAsync(target, tab.Path, HistoryMode.None, activate: DualPaneEnabled, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task CloseTabAsync(string tabId, PaneId pane, CancellationToken cancellationToken = default)
    {
        var target = Normalize(pane);
        string? nextId = null;
        string? homeFallback = null;
        lock (_gate)
        {
            var state = Pane(target);
            var closingIndex = state.Tabs.FindIndex(tab => tab.Id == tabId);
            if (closingIndex < 0)
            {
                return;
            }

            state.Tabs.RemoveAt(closingIndex);
            if (state.Tabs.Count == 0)
            {
                homeFallback = HomePath;
                if (string.IsNullOrEmpty(homeFallback))
                {
                    homeFallback = state.Path;
                }

                if (string.IsNullOrEmpty(homeFallback))
                {
                    homeFallback = Primary.Path;
                }
            }
            else if (state.ActiveTabId == tabId)
            {
                var next = state.Tabs[Math.Min(closingIndex, state.Tabs.Count - 1)];
                nextId = next.Id;
            }
        }

        if (homeFallback is not null)
        {
            await OpenNewTabAsync(target, homeFallback, cancellationToken).ConfigureAwait(false);
            return;
        }

        if (nextId is not null)
        {
            await SwitchToTabAsync(nextId, target, cancellationToken).ConfigureAwait(false);
            return;
        }

        RaiseChanged();
    }

    public Task SwitchTabByAsync(int delta, CancellationToken cancellationToken = default)
    {
        var state = Active;
        if (state.Tabs.Count == 0)
        {
            return Task.CompletedTask;
        }

        var activeIndex = Math.Max(0, state.Tabs.FindIndex(tab => tab.Id == state.ActiveTabId));
        var next = state.Tabs[(activeIndex + delta % state.Tabs.Count + state.Tabs.Count) % state.Tabs.Count];
        return SwitchToTabAsync(next.Id, ActivePane, cancellationToken);
    }

    public void SelectPath(string? path)
    {
        SelectPath(path, ActivePane);
    }

    public void SelectPath(string? path, PaneId pane)
    {
        Pane(pane).SelectedPath = path;
        if (DualPaneEnabled)
        {
            ActivePane = Normalize(pane);
        }

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

    public IReadOnlyList<FileEntry> VisibleEntriesFor(PaneId pane)
    {
        var filter = Normalize(pane) == PaneId.Secondary ? "" : FilterQuery;
        return Pane(pane).VisibleEntries(SortBy, SortAscending, ShowHiddenFiles, filter);
    }

    private void RaiseChanged()
    {
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private FileOperationService RequireFileOps()
        => FileOps ?? throw new InvalidOperationException(
            "FileOperationService is required for file operations.");

    public async Task<string> CreateFolderInCurrentPaneAsync(string name)
    {
        var ops = RequireFileOps();
        var path = ActivePane == PaneId.Primary ? Primary.Path : Secondary.Path;
        var result = await ops.CreateFolderAsync(path, name).ConfigureAwait(false);
        await RefreshAsync().ConfigureAwait(false);
        return result;
    }

    public async Task<string> CreateFileInCurrentPaneAsync(string name)
    {
        var ops = RequireFileOps();
        var path = ActivePane == PaneId.Primary ? Primary.Path : Secondary.Path;
        var result = await ops.CreateFileAsync(path, name).ConfigureAwait(false);
        await RefreshAsync().ConfigureAwait(false);
        return result;
    }

    public async Task TrashSelectedAsync(string[] selectedPaths)
    {
        await RequireFileOps().TrashAsync(selectedPaths).ConfigureAwait(false);
        await RefreshAsync().ConfigureAwait(false);
    }

    public async Task DeleteSelectedAsync(string path)
    {
        await RequireFileOps().DeleteAsync(path).ConfigureAwait(false);
        await RefreshAsync().ConfigureAwait(false);
    }

    public async Task<string> RenameSelectedAsync(string path, string newName)
    {
        var ops = RequireFileOps();
        var result = await ops.RenameAsync(path, newName).ConfigureAwait(false);
        await RefreshAsync().ConfigureAwait(false);
        return result;
    }

    public async Task OpenFileAsync(string path)
    {
        await RequireFileOps().OpenFileAsync(path).ConfigureAwait(false);
    }

    public async Task RevealInFolderAsync(string path)
    {
        await RequireFileOps().RevealInFolderAsync(path).ConfigureAwait(false);
    }
}
