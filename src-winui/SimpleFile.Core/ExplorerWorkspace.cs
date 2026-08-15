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
        Undo = new UndoStack();
        Columns = new ColumnLayout();
        Settings = UiSettings.CreateDefault();
        Primary = new ExplorerPane(PaneId.Primary);
        Secondary = new ExplorerPane(PaneId.Secondary);
    }

    public event EventHandler? Changed;

    public FileOperationService? FileOps { get; }
    public ClipboardState Clipboard { get; }
    public UndoStack Undo { get; }
    public ColumnLayout Columns { get; }
    public UiSettings Settings { get; private set; }
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

    public List<SmartFolder> SmartFolders { get; private set; } = [];
    public List<Tag> AllTags { get; private set; } = [];
    public Dictionary<string, Tag> FileTags { get; private set; } = new();

    public IReadOnlyList<DriveInfo> Drives => _drives;

    public PaneId SidebarTarget =>
        DualPaneEnabled && ActivePane == PaneId.Secondary ? PaneId.Secondary : PaneId.Primary;

    public ExplorerPane Active => Pane(ActivePane);

    public ExplorerPane Pane(PaneId pane) =>
        Normalize(pane) == PaneId.Secondary ? Secondary : Primary;

    public PaneId Normalize(PaneId pane) =>
        pane == PaneId.Secondary && DualPaneEnabled ? PaneId.Secondary : PaneId.Primary;

    private static bool IsSupportedArchivePath(string path)
    {
        var name = PathRules.Basename(path).ToLowerInvariant();
        return name.EndsWith(".tar.gz", StringComparison.Ordinal)
            || name.EndsWith(".tgz", StringComparison.Ordinal)
            || name.EndsWith(".zip", StringComparison.Ordinal)
            || name.EndsWith(".tar", StringComparison.Ordinal)
            || name.EndsWith(".rar", StringComparison.Ordinal);
    }

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

        await LoadSmartFoldersAsync().ConfigureAwait(false);
        await LoadTagsAsync().ConfigureAwait(false);
        await LoadUiSettingsAsync(cancellationToken).ConfigureAwait(false);

        if (await TryRestoreWorkspaceLayoutAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        var startPath = ResolveStartPath();
        await NavigatePaneAsync(PaneId.Primary, startPath, HistoryMode.Push, activate: false, cancellationToken)
            .ConfigureAwait(false);
    }

    public string ResolveStartPath()
    {
        var mode = UiSettings.NormalizeStartLocation(Settings.StartLocation);
        if (mode == "custom" && !string.IsNullOrWhiteSpace(Settings.CustomPath))
        {
            return Settings.CustomPath.Trim();
        }

        if (mode == "last" && !string.IsNullOrWhiteSpace(Settings.LastPath))
        {
            return Settings.LastPath.Trim();
        }

        return string.IsNullOrEmpty(HomePath) ? Primary.Path : HomePath;
    }

    public void ApplyUiSettings(UiSettings settings)
    {
        Settings = settings;
        ShowHiddenFiles = settings.ShowHidden;
        Columns.ApplyPreset(string.IsNullOrWhiteSpace(settings.ColumnPreset) ? "default" : settings.ColumnPreset);
        Columns.RestoreWidths(settings.ColumnWidths);
        RaiseChanged();
    }

    public void SetShowHidden(bool showHidden)
    {
        ShowHiddenFiles = showHidden;
        Settings.ShowHidden = showHidden;
        RaiseChanged();
    }

    public ExplorerPane OtherPane()
    {
        return ActivePane == PaneId.Secondary ? Primary : Secondary;
    }

    public string? OtherPanePath()
    {
        if (!DualPaneEnabled)
        {
            return null;
        }

        var path = OtherPane().Path;
        return string.IsNullOrWhiteSpace(path) ? null : path;
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

        if (shouldNavigate == false && IsSupportedArchivePath(path))
        {
            shouldNavigate = true;
        }

        if (shouldNavigate == true)
        {
            await NavigatePaneAsync(target, path, HistoryMode.Push, activate: DualPaneEnabled, cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        if (shouldNavigate == false)
        {
            if (FileOps is not null)
            {
                try
                {
                    await FileOps.OpenFileAsync(path, cancellationToken).ConfigureAwait(false);
                    lock (_gate)
                    {
                        Pane(target).SelectedPath = path;
                        StatusMessage = $"Opened {PathRules.Basename(path)}";
                        ErrorMessage = null;
                    }

                    RaiseChanged();
                    return;
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    lock (_gate)
                    {
                        Pane(target).SelectedPath = path;
                        ErrorMessage = exception.Message;
                    }

                    RaiseChanged();
                    return;
                }
            }

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

        await LoadSmartFoldersAsync().ConfigureAwait(false);
        await LoadTagsAsync().ConfigureAwait(false);
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

    // --- Smart Folders ---

    private async Task LoadSmartFoldersAsync()
    {
        try
        {
            var ops = RequireFileOps();
            var folders = await ops.LoadSmartFoldersAsync().ConfigureAwait(false);
            SmartFolders = [.. folders];
        }
        catch
        {
            SmartFolders = [];
        }
    }

    public async Task SaveSmartFolderAsync(SmartFolder folder)
    {
        var ops = RequireFileOps();
        var updated = await ops.SaveSmartFolderAsync(folder).ConfigureAwait(false);
        SmartFolders = [.. updated];
        RaiseChanged();
    }

    public async Task DeleteSmartFolderAsync(string id)
    {
        var ops = RequireFileOps();
        var updated = await ops.DeleteSmartFolderAsync(id).ConfigureAwait(false);
        SmartFolders = [.. updated];
        RaiseChanged();
    }

    // --- Tags ---

    private static readonly Tag[] DefaultTags =
    [
        new() { Name = "Red", Color = "#ef4444" },
        new() { Name = "Orange", Color = "#f97316" },
        new() { Name = "Yellow", Color = "#eab308" },
        new() { Name = "Green", Color = "#22c55e" },
        new() { Name = "Blue", Color = "#3b82f6" },
        new() { Name = "Purple", Color = "#a855f7" },
    ];

    private async Task LoadTagsAsync()
    {
        try
        {
            var ops = RequireFileOps();
            var tags = await ops.GetAllTagsAsync().ConfigureAwait(false);
            if (tags.Length == 0)
            {
                foreach (var dt in DefaultTags)
                {
                    await ops.CreateTagAsync(dt.Name, dt.Color).ConfigureAwait(false);
                }
                tags = await ops.GetAllTagsAsync().ConfigureAwait(false);
            }
            AllTags = [.. tags];
            FileTags = await ops.GetAllFileTagsAsync().ConfigureAwait(false);
        }
        catch
        {
            AllTags = [];
            FileTags = new();
        }
    }

    public async Task SetColorLabelAsync(string[] paths, long tagId)
    {
        var ops = RequireFileOps();
        foreach (var path in paths)
        {
            await ops.SetTagsForPathAsync(path, [tagId]).ConfigureAwait(false);
        }
        FileTags = await ops.GetAllFileTagsAsync().ConfigureAwait(false);
        RaiseChanged();
    }

    public async Task RemoveColorLabelAsync(string[] paths)
    {
        var ops = RequireFileOps();
        foreach (var path in paths)
        {
            await ops.SetTagsForPathAsync(path, []).ConfigureAwait(false);
        }
        FileTags = await ops.GetAllFileTagsAsync().ConfigureAwait(false);
        RaiseChanged();
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

    public WorkspaceLayout CaptureLayout()
    {
        return new WorkspaceLayout
        {
            DualPaneEnabled = DualPaneEnabled,
            ActivePane = ActivePane,
            SortBy = SortBy,
            SortAscending = SortAscending,
            Primary = CapturePane(Primary),
            Secondary = CapturePane(Secondary),
        };
    }

    public async Task ApplyLayoutAsync(WorkspaceLayout layout, CancellationToken cancellationToken = default)
    {
        DualPaneEnabled = layout.DualPaneEnabled;
        SortBy = string.IsNullOrWhiteSpace(layout.SortBy) ? "name" : layout.SortBy;
        SortAscending = layout.SortAscending;
        RestorePaneTabs(Primary, layout.Primary);
        RestorePaneTabs(Secondary, layout.Secondary);

        var primaryPath = string.IsNullOrWhiteSpace(layout.Primary.Path) ? HomePath : layout.Primary.Path;
        if (!string.IsNullOrWhiteSpace(primaryPath))
        {
            await NavigatePaneAsync(PaneId.Primary, primaryPath, HistoryMode.ReplaceCurrent, activate: false, cancellationToken)
                .ConfigureAwait(false);
        }

        if (DualPaneEnabled && !string.IsNullOrWhiteSpace(layout.Secondary.Path))
        {
            await NavigatePaneAsync(PaneId.Secondary, layout.Secondary.Path, HistoryMode.ReplaceCurrent, activate: false, cancellationToken)
                .ConfigureAwait(false);
        }

        if (DualPaneEnabled)
        {
            ActivatePane(layout.ActivePane);
        }
        else
        {
            ActivatePane(PaneId.Primary);
        }
    }

    public async Task SaveWorkspaceLayoutAsync(CancellationToken cancellationToken = default)
    {
        if (FileOps is null)
        {
            return;
        }

        var json = System.Text.Json.JsonSerializer.Serialize(CaptureLayout());
        await FileOps.SetSettingAsync(WorkspaceLayout.SettingsKey, json, cancellationToken).ConfigureAwait(false);
        Settings.LastPath = Active.Path;
        await FileOps.SetSettingAsync("lastPath", Settings.LastPath, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> TryRestoreWorkspaceLayoutAsync(CancellationToken cancellationToken = default)
    {
        if (FileOps is null)
        {
            return false;
        }

        try
        {
            var json = await FileOps.GetSettingAsync(WorkspaceLayout.SettingsKey, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(json))
            {
                return false;
            }

            var layout = System.Text.Json.JsonSerializer.Deserialize<WorkspaceLayout>(json);
            if (layout is null || string.IsNullOrWhiteSpace(layout.Primary.Path))
            {
                return false;
            }

            await ApplyLayoutAsync(layout, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task SaveUiSettingsAsync(CancellationToken cancellationToken = default)
    {
        if (FileOps is null)
        {
            return;
        }

        Settings.ShowHidden = ShowHiddenFiles;
        Settings.ColumnWidths = Columns.SnapshotWidths();
        await FileOps.SetSettingAsync("theme", Settings.Theme, cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("showHidden", Settings.ShowHidden ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("useTrash", Settings.UseTrash ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("confirmDelete", Settings.ConfirmDelete ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("startLocation", Settings.StartLocation, cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("customPath", Settings.CustomPath, cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("openInNewTab", Settings.OpenInNewTab ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("enableGitIntegration", Settings.EnableGitIntegration ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("previewVisible", Settings.PreviewVisible ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("sidebar.quickAccessCollapsed", Settings.QuickAccessCollapsed ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("sidebar.myPcCollapsed", Settings.MyPcCollapsed ? "true" : "false", cancellationToken).ConfigureAwait(false);
        await FileOps.SetSettingAsync("lastPath", Settings.LastPath, cancellationToken).ConfigureAwait(false);
    }

    public async Task CopyOrMoveToOtherPaneAsync(string[] sources, bool move, string conflictAction = "keep-both", CancellationToken cancellationToken = default)
    {
        var destination = OtherPanePath();
        if (destination is null || sources.Length == 0 || FileOps is null)
        {
            return;
        }

        if (move)
        {
            var results = await FileOps.MoveAsync(sources, destination, conflictAction, ct: cancellationToken).ConfigureAwait(false);
            Undo.PushMove(results, FileOps);
        }
        else
        {
            var results = await FileOps.CopyAsync(sources, destination, conflictAction, ct: cancellationToken).ConfigureAwait(false);
            Undo.PushCopy(results, FileOps);
        }

        await RefreshAsync(cancellationToken).ConfigureAwait(false);
        if (DualPaneEnabled)
        {
            await NavigatePaneAsync(OtherPane().Id, destination, HistoryMode.None, activate: false, cancellationToken)
                .ConfigureAwait(false);
        }
    }

    public async Task PackIntoFolderAsync(string[] sources, string folderName, CancellationToken cancellationToken = default)
    {
        if (FileOps is null || sources.Length == 0 || string.IsNullOrWhiteSpace(folderName))
        {
            return;
        }

        var created = await FileOps.CreateFolderAsync(Active.Path, folderName, cancellationToken).ConfigureAwait(false);
        await FileOps.MoveAsync(sources, created, "keep-both", ct: cancellationToken).ConfigureAwait(false);
        await RefreshAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task UnpackFolderAsync(string folderPath, CancellationToken cancellationToken = default)
    {
        if (FileOps is null || string.IsNullOrWhiteSpace(folderPath))
        {
            return;
        }

        var listing = await _backend.ListDirectoryAsync(folderPath, cancellationToken: cancellationToken).ConfigureAwait(false);
        var parent = PathRules.GetParentPath(folderPath);
        if (parent is null)
        {
            return;
        }

        var children = listing.Entries.Select(entry => entry.Path).ToArray();
        if (children.Length > 0)
        {
            await FileOps.MoveAsync(children, parent, "keep-both", ct: cancellationToken).ConfigureAwait(false);
        }

        await FileOps.DeleteAsync(folderPath, cancellationToken).ConfigureAwait(false);
        await RefreshAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task LoadUiSettingsAsync(CancellationToken cancellationToken)
    {
        if (FileOps is null)
        {
            return;
        }

        try
        {
            Settings.Theme = UiSettings.NormalizeTheme(await FileOps.GetSettingAsync("theme", cancellationToken).ConfigureAwait(false));
            Settings.ShowHidden = await ReadBoolSettingAsync("showHidden", false, cancellationToken).ConfigureAwait(false);
            Settings.UseTrash = await ReadBoolSettingAsync("useTrash", true, cancellationToken).ConfigureAwait(false);
            Settings.ConfirmDelete = await ReadBoolSettingAsync("confirmDelete", true, cancellationToken).ConfigureAwait(false);
            Settings.StartLocation = UiSettings.NormalizeStartLocation(
                await FileOps.GetSettingAsync("startLocation", cancellationToken).ConfigureAwait(false));
            Settings.CustomPath = await FileOps.GetSettingAsync("customPath", cancellationToken).ConfigureAwait(false) ?? "";
            Settings.LastPath = await FileOps.GetSettingAsync("lastPath", cancellationToken).ConfigureAwait(false) ?? "";
            Settings.OpenInNewTab = await ReadBoolSettingAsync("openInNewTab", false, cancellationToken).ConfigureAwait(false);
            Settings.EnableGitIntegration = await ReadBoolSettingAsync("enableGitIntegration", true, cancellationToken).ConfigureAwait(false);
            Settings.PreviewVisible = await ReadBoolSettingAsync("previewVisible", true, cancellationToken).ConfigureAwait(false);
            Settings.QuickAccessCollapsed = await ReadBoolSettingAsync("sidebar.quickAccessCollapsed", false, cancellationToken).ConfigureAwait(false);
            Settings.MyPcCollapsed = await ReadBoolSettingAsync("sidebar.myPcCollapsed", false, cancellationToken).ConfigureAwait(false);
            ShowHiddenFiles = Settings.ShowHidden;
        }
        catch
        {
            // Missing keys or a stub IPC keep defaults.
        }
    }

    private async Task<bool> ReadBoolSettingAsync(string key, bool fallback, CancellationToken cancellationToken)
    {
        var raw = await FileOps!.GetSettingAsync(key, cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        return raw.Equals("true", StringComparison.OrdinalIgnoreCase);
    }

    private static WorkspacePaneLayout CapturePane(ExplorerPane pane)
    {
        return new WorkspacePaneLayout
        {
            Path = pane.Path,
            ActiveTabId = pane.ActiveTabId,
            Tabs = pane.Tabs.Select(tab => new WorkspaceTabLayout
            {
                Id = tab.Id,
                Path = tab.Path,
                Title = tab.Title,
                History = [.. tab.History],
                HistoryIndex = tab.HistoryIndex,
            }).ToList(),
        };
    }

    private static void RestorePaneTabs(ExplorerPane pane, WorkspacePaneLayout layout)
    {
        pane.Tabs.Clear();
        foreach (var tab in layout.Tabs)
        {
            pane.Tabs.Add(new FileTab
            {
                Id = string.IsNullOrEmpty(tab.Id) ? ExplorerPane.CreateTab(tab.Path).Id : tab.Id,
                Path = tab.Path,
                Title = string.IsNullOrEmpty(tab.Title) ? PathRules.Basename(tab.Path) : tab.Title,
                History = tab.History.Count > 0 ? [.. tab.History] : [tab.Path],
                HistoryIndex = tab.HistoryIndex,
            });
        }

        pane.ActiveTabId = layout.ActiveTabId;
        if (pane.ActiveTabId is not null)
        {
            var active = pane.Tabs.FirstOrDefault(tab => tab.Id == pane.ActiveTabId);
            if (active is not null)
            {
                pane.ApplyTabHistory(active);
            }
        }
    }
}

