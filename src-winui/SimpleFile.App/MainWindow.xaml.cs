using System.Collections.ObjectModel;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media.Imaging;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Windows.Graphics;
using Windows.System;
using Windows.Storage.Streams;

namespace SimpleFile.App;

public sealed partial class MainWindow : Window
{
    private const double PaneMinPercent = 20;
    private const double PaneMaxPercent = 80;

    private BackendSession? _backend;
    private ExplorerWorkspace? _workspace;
    private bool _quickAccessCollapsed;
    private bool _myPcCollapsed;
    private bool _editingPrimaryPath;
    private bool _editingSecondaryPath;
    private bool _reconnectDialogOpen;
    private bool _dividerDragging;
    private double _primaryPercent = 50;
    private IDisposable? _fileChangeSubscription;
    private string? _watchTargetPath;
    private string? _watchedPath;
    private string? _currentOperationId;
    private string? _activeSearchId;
    private string? _searchRoot;
    private int _searchCounter;
    private bool _searchMode;
    private PaneId _searchPane = PaneId.Primary;
    private readonly List<SearchResult> _activeSearchResults = [];
    private int _previewToken;
    private string? _previewPath;
    private bool _applyingWorkspace;
    private int _folderRefreshToken;

    public ObservableCollection<FileRow> PrimaryFiles { get; } = [];
    public ObservableCollection<FileRow> SecondaryFiles { get; } = [];
    public ObservableCollection<DriveRow> Drives { get; } = [];
    public ObservableCollection<QuickAccessRow> QuickAccess { get; } = [];

    public MainWindow()
    {
        try
        {
            InitializeComponent();
        }
        catch (Exception exception)
        {
            App.LogCrash("MainWindow.InitializeComponent", exception);
            throw;
        }

        Title = "SimpleFile - File Explorer";
        AppWindow.Resize(new SizeInt32(1200, 800));
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsResizable = true;
            presenter.IsMaximizable = true;
        }

        PrimaryFileList.ItemsSource = PrimaryFiles;
        SecondaryFileList.ItemsSource = SecondaryFiles;
        DriveList.ItemsSource = Drives;
        QuickAccessList.ItemsSource = QuickAccess;
        FileProgressPanel.CancelRequested += OnFileProgressCancelRequested;

        Closed += OnClosed;
        Activated += OnActivated;
    }

    private async void OnActivated(object sender, WindowActivatedEventArgs args)
    {
        Activated -= OnActivated;
        await ConnectAsync();
    }

    private async Task ConnectAsync()
    {
        try
        {
            StatusText.Text = "Starting simplefile-service…";
            _backend = new BackendSession();
            await _backend.StartAsync();
            var fileOps = new FileOperationService(_backend.Client!);
            _workspace = new ExplorerWorkspace(_backend, fileOps);
            ColumnLayoutHost.Attach(_workspace.Columns);
            _workspace.Changed += OnWorkspaceChanged;
            _fileChangeSubscription = _backend.Client!.On<FileChangeEvent>(Protocol.FileChangeEvent, OnFileChange);
            await _workspace.InitializeAsync();
            ApplyTheme(_workspace.Settings.Theme);
            _quickAccessCollapsed = _workspace.Settings.QuickAccessCollapsed;
            _myPcCollapsed = _workspace.Settings.MyPcCollapsed;
            ApplyPreviewVisibility();
            ApplyColumnWidths();
            SyncFromWorkspace();
        }
        catch (Exception exception)
        {
            ShowMessage(
                "Could not start or reach the IPC service.",
                exception.Message
                    + Environment.NewLine
                    + Environment.NewLine
                    + "Build the service first:"
                    + Environment.NewLine
                    + "  cargo build -p simplefile-service"
                    + Environment.NewLine
                    + "or set SIMPLEFILE_SERVICE_PATH to simplefile-service.exe.",
                InfoBarSeverity.Error);
        }
    }

    private void OnWorkspaceChanged(object? sender, EventArgs e)
    {
        DispatcherQueue.TryEnqueue(SyncFromWorkspace);
    }

    private void SyncFromWorkspace()
    {
        if (_workspace is null || _applyingWorkspace)
        {
            return;
        }

        _applyingWorkspace = true;
        try
        {
            SyncFromWorkspaceCore();
        }
        finally
        {
            _applyingWorkspace = false;
        }
    }

    private void SyncFromWorkspaceCore()
    {
        if (_workspace is null)
        {
            return;
        }

        if (_searchMode
            && _searchRoot is not null
            && !string.Equals(_workspace.Pane(_searchPane).Path, _searchRoot, StringComparison.OrdinalIgnoreCase))
        {
            ClearSearchState();
        }

        ReplaceIfChanged(
            PrimaryFiles,
            (_searchMode && _searchPane == PaneId.Primary
                ? _activeSearchResults.Select(SearchRowFrom)
                : _workspace.VisibleEntriesFor(PaneId.Primary).Select(ToFileRow)).ToList(),
            SameFileRow);
        ReplaceIfChanged(
            SecondaryFiles,
            (_searchMode && _searchPane == PaneId.Secondary
                ? _activeSearchResults.Select(SearchRowFrom)
                : _workspace.VisibleEntriesFor(PaneId.Secondary).Select(ToFileRow)).ToList(),
            SameFileRow);
        ReplaceIfChanged(
            Drives,
            _workspace.Drives.Select(drive => DriveRow.From(drive, _workspace.Pane(_workspace.SidebarTarget).Path)).ToList(),
            SameDriveRow);
        ReplaceIfChanged(
            QuickAccess,
            ExplorerWorkspace.QuickAccessLocations.Select(item => new QuickAccessRow
            {
                Name = item.Name,
                Icon = item.Icon,
                Command = item.Command,
            }).ToList(),
            SameQuickAccessRow);

        RebuildBreadcrumbs(PrimaryBreadcrumbHost, _workspace.Primary.Breadcrumbs, PaneId.Primary);
        RebuildBreadcrumbs(SecondaryBreadcrumbHost, _workspace.Secondary.Breadcrumbs, PaneId.Secondary);
        RebuildTabs(PrimaryTabHost, _workspace.Primary, PaneId.Primary);
        RebuildTabs(SecondaryTabHost, _workspace.Secondary, PaneId.Secondary);

        PrimaryBackButton.IsEnabled = _workspace.Primary.CanGoBack;
        PrimaryForwardButton.IsEnabled = _workspace.Primary.CanGoForward;
        PrimaryUpButton.IsEnabled = _workspace.Primary.CanGoUp;
        SecondaryBackButton.IsEnabled = _workspace.Secondary.CanGoBack;
        SecondaryForwardButton.IsEnabled = _workspace.Secondary.CanGoForward;
        SecondaryUpButton.IsEnabled = _workspace.Secondary.CanGoUp;

        DriveList.Visibility = _myPcCollapsed ? Visibility.Collapsed : Visibility.Visible;
        QuickAccessList.Visibility = _quickAccessCollapsed ? Visibility.Collapsed : Visibility.Visible;
        QuickAccessCollapseButton.Content = _quickAccessCollapsed ? "▸" : "▾";
        MyPcCollapseButton.Content = _myPcCollapsed ? "▸" : "▾";
        RefreshSmartFolders();
        BindItemsSource(FolderTreeList, _workspace.FolderTreeRows);
        BindItemsSource(BookmarksList, _workspace.Bookmarks);
        BindItemsSource(RecentsList, _workspace.RecentPaths);
        ApplyPreviewVisibility();
        ApplyColumnWidths();
        ApplyTheme(_workspace.Settings.Theme);
        UpdateEmptyStates();

        ApplyDualPaneLayout();
        PrimaryPaneRoot.BorderThickness = new Thickness(
            _workspace.DualPaneEnabled && _workspace.ActivePane == PaneId.Primary ? 2 : 0);
        SecondaryPaneRoot.BorderThickness = new Thickness(
            _workspace.DualPaneEnabled && _workspace.ActivePane == PaneId.Secondary ? 2 : 0);
        SidebarTargetSwitch.Visibility = _workspace.DualPaneEnabled ? Visibility.Visible : Visibility.Collapsed;
        DualPaneButton.Content = _workspace.DualPaneEnabled ? "Single" : "Dual";

        if (!_editingPrimaryPath)
        {
            PrimaryPathInput.Text = _workspace.Primary.Path;
        }

        if (!_editingSecondaryPath)
        {
            SecondaryPathInput.Text = _workspace.Secondary.Path;
        }

        SelectRow(PrimaryFileList, PrimaryFiles, _workspace.Primary.SelectedPath);
        SelectRow(SecondaryFileList, SecondaryFiles, _workspace.Secondary.SelectedPath);
        UpdateSelectionStatus();

        if (!string.IsNullOrEmpty(_workspace.ErrorMessage))
        {
            ShowMessage("Could not open folder", _workspace.ErrorMessage, InfoBarSeverity.Error);
        }
        else if (_workspace.FileOpenUnsupported)
        {
            ShowMessage("Open file", _workspace.StatusMessage ?? "Opening files is not ported yet.", InfoBarSeverity.Informational);
        }
        else
        {
            MessageBar.IsOpen = false;
        }

        QueueWatchActiveDirectory();

        if (_workspace.PendingReconnect is { } drive && !_reconnectDialogOpen)
        {
            _ = PromptNetworkReconnectAsync(drive.Name, drive.StatusDetail, drive.RemotePath, drive.Path);
        }

        QueuePreviewFromSelection();
    }

    private void ApplyDualPaneLayout()
    {
        var dual = _workspace?.DualPaneEnabled == true;
        SecondaryPaneRoot.Visibility = dual ? Visibility.Visible : Visibility.Collapsed;
        PaneDivider.Visibility = dual ? Visibility.Visible : Visibility.Collapsed;
        DividerColumn.Width = dual ? new GridLength(6) : new GridLength(0);
        if (dual)
        {
            var primary = Math.Clamp(_primaryPercent, PaneMinPercent, PaneMaxPercent);
            PrimaryColumn.Width = new GridLength(primary, GridUnitType.Star);
            SecondaryColumn.Width = new GridLength(100 - primary, GridUnitType.Star);
        }
        else
        {
            PrimaryColumn.Width = new GridLength(1, GridUnitType.Star);
            SecondaryColumn.Width = new GridLength(0);
        }
    }

    private void RebuildBreadcrumbs(StackPanel host, IReadOnlyList<BreadcrumbSegment> crumbs, PaneId pane)
    {
        var key = string.Join('\u001f', crumbs.Select(crumb => crumb.Path + "=" + crumb.Label));
        if (Equals(host.Tag, key) && host.Children.Count > 0)
        {
            return;
        }

        host.Tag = key;
        host.Children.Clear();
        for (var index = 0; index < crumbs.Count; index++)
        {
            var segment = crumbs[index];
            var button = new Button
            {
                Content = segment.Label,
                Tag = new PanePath(pane, segment.Path),
                Padding = new Thickness(6, 2, 6, 2),
            };
            button.Click += OnBreadcrumbClick;
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, $"Navigate to {segment.Label}");
            host.Children.Add(button);
            if (index < crumbs.Count - 1)
            {
                host.Children.Add(new TextBlock
                {
                    Text = "/",
                    Margin = new Thickness(4, 0, 4, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Opacity = 0.6,
                });
            }
        }
    }

    private void RebuildTabs(StackPanel host, ExplorerPane pane, PaneId paneId)
    {
        var key = string.Join(
            '\u001f',
            pane.Tabs.Select(tab => $"{tab.Id}:{tab.Path}:{tab.Id == pane.ActiveTabId}"));
        if (Equals(host.Tag, key) && host.Children.Count > 0)
        {
            return;
        }

        host.Tag = key;
        host.Children.Clear();
        var hasActive = pane.Tabs.Any(tab => tab.Id == pane.ActiveTabId);
        foreach (var tab in pane.Tabs)
        {
            var isActive = tab.Id == pane.ActiveTabId;
            var tabButton = new Button
            {
                Padding = new Thickness(8, 4, 4, 4),
                Tag = new PaneTab(paneId, tab.Id),
                Content = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    Spacing = 6,
                    Children =
                    {
                        new TextBlock { Text = "\uD83D\uDCC1" },
                        new TextBlock { Text = tab.Title, MaxWidth = 140, TextTrimming = TextTrimming.CharacterEllipsis },
                    },
                },
            };
            ToolTipService.SetToolTip(tabButton, tab.Path);
            tabButton.Click += OnTabClick;
            tabButton.PointerPressed += OnTabPointerPressed;
            tabButton.KeyDown += OnTabKeyDown;
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(tabButton, $"Tab {tab.Title}");
            host.Children.Add(tabButton);

            var close = new Button
            {
                Content = "×",
                Padding = new Thickness(6, 2, 6, 2),
                Tag = new PaneTab(paneId, tab.Id),
            };
            close.Click += OnTabCloseClick;
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(close, $"Close tab {tab.Title}");
            host.Children.Add(close);

            if (isActive)
            {
                var add = new Button
                {
                    Content = "+",
                    Padding = new Thickness(8, 2, 8, 2),
                    Tag = paneId,
                };
                ToolTipService.SetToolTip(add, "New Tab");
                add.Click += OnNewTabClick;
                host.Children.Add(add);
            }
        }

        if (!hasActive)
        {
            var add = new Button
            {
                Content = "+",
                Padding = new Thickness(8, 2, 8, 2),
                Tag = paneId,
            };
            ToolTipService.SetToolTip(add, "New Tab");
            add.Click += OnNewTabClick;
            host.Children.Add(add);
        }
    }

    private static void SelectRow(ListView list, ObservableCollection<FileRow> rows, string? path)
    {
        if (list.SelectionMode != ListViewSelectionMode.Single && list.SelectedItems.Count > 1)
        {
            return;
        }

        list.SelectedItem = path is null ? null : rows.FirstOrDefault(row => row.Path == path);
    }

    private FileRow ToFileRow(FileEntry entry)
    {
        var cut = _workspace?.Clipboard is { Operation: ClipboardOperation.Cut, HasItems: true } clipboard
            && clipboard.SourcePaths.Any(path => PathRules.PathsEqual(path, entry.Path));
        Tag? tag = null;
        _workspace?.FileTags.TryGetValue(entry.Path, out tag);
        return FileRow.From(entry, cut, tag);
    }

    private FileRow SearchRowFrom(SearchResult result)
    {
        return ToFileRow(new FileEntry
        {
            Name = result.Name,
            Path = result.Path,
            IsDir = result.IsDir,
            Size = result.Size,
            Modified = result.Modified,
            Extension = result.Extension,
        });
    }

    private void UpdateEmptyStates()
    {
        if (_workspace is null)
        {
            return;
        }

        SetEmptyState(PrimaryEmptyText, PrimaryFiles.Count, _workspace.Primary, _searchMode && _searchPane == PaneId.Primary);
        SetEmptyState(SecondaryEmptyText, SecondaryFiles.Count, _workspace.Secondary, _searchMode && _searchPane == PaneId.Secondary);
    }

    private static void SetEmptyState(TextBlock target, int count, ExplorerPane pane, bool searching)
    {
        if (count > 0)
        {
            target.Visibility = Visibility.Collapsed;
            return;
        }

        target.Text = pane.ListingInProgress
            ? "Loading…"
            : searching
                ? "No search results"
                : string.IsNullOrEmpty(pane.Path)
                    ? "Select a folder"
                    : "This folder is empty";
        target.Visibility = Visibility.Visible;
    }

    private static void Replace<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
        }
    }

    private static bool ReplaceIfChanged<T>(
        ObservableCollection<T> target,
        IReadOnlyList<T> source,
        Func<T, T, bool> same)
    {
        if (target.Count == source.Count)
        {
            var unchanged = true;
            for (var index = 0; index < source.Count; index++)
            {
                if (!same(target[index], source[index]))
                {
                    unchanged = false;
                    break;
                }
            }

            if (unchanged)
            {
                return false;
            }
        }

        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
        }

        return true;
    }

    private static bool SameFileRow(FileRow left, FileRow right) =>
        left.Path == right.Path
        && left.Name == right.Name
        && left.IsDir == right.IsDir
        && left.IsCut == right.IsCut
        && left.Size == right.Size
        && left.ModifiedText == right.ModifiedText
        && left.SizeText == right.SizeText
        && left.TypeText == right.TypeText
        && left.GitText == right.GitText
        && left.TagColor == right.TagColor
        && left.Icon == right.Icon;

    private static bool SameDriveRow(DriveRow left, DriveRow right) =>
        left.Path == right.Path
        && left.Name == right.Name
        && left.IsActive == right.IsActive
        && left.Description == right.Description
        && left.Badge == right.Badge
        && left.Icon == right.Icon;

    private static bool SameQuickAccessRow(QuickAccessRow left, QuickAccessRow right) =>
        left.Command == right.Command
        && left.Name == right.Name
        && left.Icon == right.Icon;

    private static void BindItemsSource(ListView list, object? items)
    {
        if (!ReferenceEquals(list.ItemsSource, items))
        {
            list.ItemsSource = items;
        }
    }

    private async void OnToggleDualPane(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.ToggleDualPaneAsync();
        }
    }

    private void OnSidebarLeft(object sender, RoutedEventArgs e) => _workspace?.ActivatePane(PaneId.Primary);

    private void OnSidebarRight(object sender, RoutedEventArgs e) => _workspace?.ActivatePane(PaneId.Secondary);

    private void OnPrimaryPanePressed(object sender, PointerRoutedEventArgs e) => _workspace?.ActivatePane(PaneId.Primary);

    private void OnSecondaryPanePressed(object sender, PointerRoutedEventArgs e) => _workspace?.ActivatePane(PaneId.Secondary);

    private async void OnPrimaryBack(object sender, RoutedEventArgs e) => await GoHistory(PaneId.Primary, -1);

    private async void OnPrimaryForward(object sender, RoutedEventArgs e) => await GoHistory(PaneId.Primary, 1);

    private async void OnPrimaryUp(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.GoUpAsync(PaneId.Primary);
        }
    }

    private async void OnSecondaryBack(object sender, RoutedEventArgs e) => await GoHistory(PaneId.Secondary, -1);

    private async void OnSecondaryForward(object sender, RoutedEventArgs e) => await GoHistory(PaneId.Secondary, 1);

    private async void OnSecondaryUp(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.GoUpAsync(PaneId.Secondary);
        }
    }

    private async Task GoHistory(PaneId pane, int delta)
    {
        if (_workspace is null)
        {
            return;
        }

        if (delta < 0)
        {
            await _workspace.GoBackAsync(pane);
        }
        else
        {
            await _workspace.GoForwardAsync(pane);
        }
    }

    private async void OnRefreshDrives(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.RefreshDrivesAsync();
        }
    }

    private void OnToggleQuickAccess(object sender, RoutedEventArgs e)
    {
        _quickAccessCollapsed = !_quickAccessCollapsed;
        if (_workspace is not null)
        {
            _workspace.Settings.QuickAccessCollapsed = _quickAccessCollapsed;
        }

        QuickAccessCollapseButton.Content = _quickAccessCollapsed ? "▸" : "▾";
        QuickAccessList.Visibility = _quickAccessCollapsed ? Visibility.Collapsed : Visibility.Visible;
    }

    private void OnToggleMyPc(object sender, RoutedEventArgs e)
    {
        _myPcCollapsed = !_myPcCollapsed;
        if (_workspace is not null)
        {
            _workspace.Settings.MyPcCollapsed = _myPcCollapsed;
        }

        MyPcCollapseButton.Content = _myPcCollapsed ? "▸" : "▾";
        DriveList.Visibility = _myPcCollapsed ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void OnTabKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (_workspace is null || sender is not Button { Tag: PaneTab tab })
        {
            return;
        }

        if (e.Key is not VirtualKey.Left and not VirtualKey.Right)
        {
            return;
        }

        e.Handled = true;
        var pane = _workspace.Pane(tab.Pane);
        if (pane.Tabs.Count == 0)
        {
            return;
        }

        var index = pane.Tabs.FindIndex(candidate => candidate.Id == tab.TabId);
        if (index < 0)
        {
            return;
        }

        var delta = e.Key == VirtualKey.Right ? 1 : -1;
        var next = pane.Tabs[(index + delta + pane.Tabs.Count) % pane.Tabs.Count];
        await _workspace.SwitchToTabAsync(next.Id, tab.Pane);
    }

    private async void OnQuickAccessClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is QuickAccessRow row)
        {
            await _workspace.NavigateSpecialAsync(row.Command, _workspace.SidebarTarget);
        }
    }

    private async void OnDriveClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is DriveRow row)
        {
            await _workspace.OpenPathAsync(row.Path, isDirectory: true, _workspace.SidebarTarget);
        }
    }

    private async void OnBreadcrumbClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is Button { Tag: PanePath target })
        {
            await _workspace.NavigatePaneAsync(target.Pane, target.Path);
        }
    }

    private void OnEditPrimaryPath(object sender, RoutedEventArgs e) => BeginPathEdit(PaneId.Primary);

    private void OnEditSecondaryPath(object sender, RoutedEventArgs e) => BeginPathEdit(PaneId.Secondary);

    private void BeginPathEdit(PaneId pane)
    {
        if (_workspace is null)
        {
            return;
        }

        var input = pane == PaneId.Secondary ? SecondaryPathInput : PrimaryPathInput;
        var scroller = pane == PaneId.Secondary ? SecondaryBreadcrumbScroller : PrimaryBreadcrumbScroller;
        if (pane == PaneId.Secondary)
        {
            _editingSecondaryPath = true;
        }
        else
        {
            _editingPrimaryPath = true;
        }

        input.Text = _workspace.Pane(pane).Path;
        scroller.Visibility = Visibility.Collapsed;
        input.Visibility = Visibility.Visible;
        input.Focus(FocusState.Programmatic);
        input.SelectAll();
    }

    private void EndPathEdit(PaneId pane, bool reset)
    {
        var input = pane == PaneId.Secondary ? SecondaryPathInput : PrimaryPathInput;
        var scroller = pane == PaneId.Secondary ? SecondaryBreadcrumbScroller : PrimaryBreadcrumbScroller;
        if (pane == PaneId.Secondary)
        {
            _editingSecondaryPath = false;
        }
        else
        {
            _editingPrimaryPath = false;
        }

        if (reset && _workspace is not null)
        {
            input.Text = _workspace.Pane(pane).Path;
        }

        input.Visibility = Visibility.Collapsed;
        scroller.Visibility = Visibility.Visible;
    }

    private async void OnPrimaryPathKeyDown(object sender, KeyRoutedEventArgs e) =>
        await HandlePathKey(e, PaneId.Primary);

    private async void OnSecondaryPathKeyDown(object sender, KeyRoutedEventArgs e) =>
        await HandlePathKey(e, PaneId.Secondary);

    private void OnPrimaryPathLostFocus(object sender, RoutedEventArgs e)
    {
        if (_editingPrimaryPath)
        {
            EndPathEdit(PaneId.Primary, reset: true);
        }
    }

    private void OnSecondaryPathLostFocus(object sender, RoutedEventArgs e)
    {
        if (_editingSecondaryPath)
        {
            EndPathEdit(PaneId.Secondary, reset: true);
        }
    }

    private async Task HandlePathKey(KeyRoutedEventArgs e, PaneId pane)
    {
        if (e.Key == VirtualKey.Escape)
        {
            e.Handled = true;
            EndPathEdit(pane, reset: true);
            return;
        }

        if (e.Key != VirtualKey.Enter || _workspace is null)
        {
            return;
        }

        var input = pane == PaneId.Secondary ? SecondaryPathInput : PrimaryPathInput;
        var path = input.Text.Trim();
        if (path.Length == 0)
        {
            return;
        }

        e.Handled = true;
        EndPathEdit(pane, reset: false);
        await _workspace.NavigatePaneAsync(pane, path);
    }

    private void OnPrimaryFileRightTapped(object sender, RightTappedRoutedEventArgs e) =>
        SelectRightTapped(PrimaryFileList, PaneId.Primary, e);

    private void OnSecondaryFileRightTapped(object sender, RightTappedRoutedEventArgs e) =>
        SelectRightTapped(SecondaryFileList, PaneId.Secondary, e);

    private void SelectRightTapped(ListView list, PaneId pane, RightTappedRoutedEventArgs e)
    {
        if (_workspace is null || e.OriginalSource is not DependencyObject source)
        {
            return;
        }

        var view = FindAncestor<FileRowView>(source);
        var row = view?.Row;
        if (row is null)
        {
            return;
        }

        if (list.SelectedItems.OfType<FileRow>().Any(item =>
                string.Equals(item.Path, row.Path, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        _applyingWorkspace = true;
        try
        {
            list.SelectedItems.Clear();
            list.SelectedItems.Add(row);
        }
        finally
        {
            _applyingWorkspace = false;
        }

        _workspace.SelectPath(row.Path, pane);
        QueuePreview(row);
        UpdateSelectionStatus();
    }

    private void OnPrimarySelectionChanged(object sender, SelectionChangedEventArgs e) =>
        HandleSelectionChanged(PrimaryFileList, PaneId.Primary, e);

    private void OnSecondarySelectionChanged(object sender, SelectionChangedEventArgs e) =>
        HandleSelectionChanged(SecondaryFileList, PaneId.Secondary, e);

    private void HandleSelectionChanged(ListView list, PaneId pane, SelectionChangedEventArgs e)
    {
        if (_applyingWorkspace || _workspace is null)
        {
            return;
        }

        var row = e.AddedItems.OfType<FileRow>().LastOrDefault()
            ?? list.SelectedItems.OfType<FileRow>().LastOrDefault();
        if (row is null)
        {
            if (list == ActiveFileList)
            {
                _workspace.SelectPath(null, pane);
                ClearPreview();
                UpdateSelectionStatus();
            }

            return;
        }

        _workspace.SelectPath(row.Path, pane);
        QueuePreview(row);
        UpdateSelectionStatus();
    }

    private async void OnPrimaryFileDoubleTapped(object sender, DoubleTappedRoutedEventArgs e) =>
        await OpenSelectedFile(PrimaryFileList, PaneId.Primary);

    private async void OnSecondaryFileDoubleTapped(object sender, DoubleTappedRoutedEventArgs e) =>
        await OpenSelectedFile(SecondaryFileList, PaneId.Secondary);

    private async void OnPrimaryFileKeyDown(object sender, KeyRoutedEventArgs e) =>
        await HandleFileKey(e, PrimaryFileList, PaneId.Primary);

    private async void OnSecondaryFileKeyDown(object sender, KeyRoutedEventArgs e) =>
        await HandleFileKey(e, SecondaryFileList, PaneId.Secondary);

    private async Task HandleFileKey(KeyRoutedEventArgs e, ListView list, PaneId pane)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            await OpenSelectedFile(list, pane);
            return;
        }

        var letter = e.Key.ToString();
        if (_workspace is not null && letter.Length == 1 && char.IsLetterOrDigit(letter[0]))
        {
            var match = _workspace.MatchTypeAhead(letter[0]);
            if (match is not null)
            {
                e.Handled = true;
                _workspace.SelectPath(match.Path, pane);
                var rows = pane == PaneId.Secondary ? SecondaryFiles : PrimaryFiles;
                SelectRow(list, rows, match.Path);
                var row = rows.FirstOrDefault(item =>
                    string.Equals(item.Path, match.Path, StringComparison.OrdinalIgnoreCase));
                if (row is not null)
                {
                    QueuePreview(row);
                }

                UpdateSelectionStatus();
            }
        }
    }

    private async Task OpenSelectedFile(ListView list, PaneId pane)
    {
        if (_workspace is not null && list.SelectedItem is FileRow row)
        {
            await _workspace.OpenEntryAsync(
                new FileEntry { Name = row.Name, Path = row.Path, IsDir = row.IsDir },
                pane);
        }
    }

    private FileRow? ActiveSelectedRow =>
        ActiveFileList.SelectedItem as FileRow
        ?? ActiveFileList.SelectedItems.OfType<FileRow>().LastOrDefault();

    private IReadOnlyList<FileRow> ActiveSelectedRows =>
        ActiveFileList.SelectedItems.OfType<FileRow>().ToArray();

    private void UpdateSelectionStatus()
    {
        if (_workspace is null)
        {
            return;
        }

        var active = _workspace.Active;
        var searchCount = _searchMode && _searchPane == _workspace.ActivePane
            ? _activeSearchResults.Count
            : (int?)null;
        var visible = _workspace.VisibleEntriesFor(_workspace.ActivePane);
        var count = searchCount ?? visible.Count;
        var selectedEntries = ActiveSelectedRows
            .Select(row => new FileEntry { Name = row.Name, Path = row.Path, IsDir = row.IsDir, Size = row.Size })
            .ToList();
        var snapshot = StatusBarFormatter.Format(
            count,
            selectedEntries,
            active.Path,
            _workspace.ActivePaneLabel,
            listingInProgress: active.ListingInProgress,
            isEmpty: count == 0 && !active.ListingInProgress && searchCount is null);
        CountText.Text = searchCount is null
            ? snapshot.Combined
            : (count == 1 ? "1 search result" : $"{count} search results");
        if (searchCount is not null && !string.IsNullOrEmpty(_workspace.ActivePaneLabel))
        {
            CountText.Text = $"{_workspace.ActivePaneLabel} · {CountText.Text}";
        }

        if (active.ListingInProgress && count == 0)
        {
            StatusText.Text = "Loading…";
        }
        else if (!string.IsNullOrEmpty(_workspace.ErrorMessage))
        {
            StatusText.Text = _workspace.ErrorMessage;
        }
        else if (_searchMode && _searchPane == _workspace.ActivePane)
        {
            StatusText.Text = string.IsNullOrWhiteSpace(SearchBox.Text)
                ? "Search results"
                : $"Search results for \"{SearchBox.Text.Trim()}\"";
        }
        else if (!string.IsNullOrEmpty(_workspace.StatusMessage))
        {
            StatusText.Text = _workspace.StatusMessage;
        }
        else
        {
            StatusText.Text = active.Path;
        }
    }

    private void QueuePreviewFromSelection()
    {
        var row = ActiveSelectedRow;
        if (row is null)
        {
            ClearPreview();
            return;
        }

        QueuePreview(row);
    }

    private void QueuePreview(FileRow row)
    {
        UpdatePreviewButtons(row);
        if (string.Equals(_previewPath, row.Path, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        _previewPath = row.Path;
        _ = LoadPreviewAsync(row);
    }

    private void ClearPreview()
    {
        _previewPath = null;
        _ = Interlocked.Increment(ref _previewToken);
        PreviewTitle.Text = "Preview";
        PreviewSubtitle.Text = "Select a file";
        PreviewImage.Source = null;
        PreviewImage.Visibility = Visibility.Collapsed;
        PreviewTextBox.Text = "";
        PreviewTextBox.Visibility = Visibility.Collapsed;
        PreviewEmptyText.Text = "No preview loaded.";
        PreviewEmptyText.Visibility = Visibility.Visible;
        PreviewMetadataRows.Children.Clear();
        PreviewChecksumText.Text = "";
        UpdatePreviewButtons(null);
    }

    private void UpdatePreviewButtons(FileRow? row)
    {
        var selected = ActiveSelectedRows;
        var canActOnSelection = row is not null;
        var canInspectFile = row is not null && !row.IsDir;
        PreviewOpenButton.IsEnabled = canActOnSelection;
        PreviewRevealButton.IsEnabled = canActOnSelection;
        PreviewOpenWithButton.IsEnabled = canInspectFile;
        PreviewChecksumButton.IsEnabled = canInspectFile;
        PreviewCompareButton.IsEnabled = selected.Count == 2 && selected.All(item => !item.IsDir);
    }

    private async Task LoadPreviewAsync(FileRow row)
    {
        var token = Interlocked.Increment(ref _previewToken);
        PreviewTitle.Text = row.Name;
        PreviewSubtitle.Text = row.Path;
        PreviewImage.Source = null;
        PreviewImage.Visibility = Visibility.Collapsed;
        PreviewTextBox.Text = "";
        PreviewTextBox.Visibility = Visibility.Collapsed;
        PreviewEmptyText.Text = row.IsDir ? "Folder selected." : "Loading preview...";
        PreviewEmptyText.Visibility = Visibility.Visible;
        PreviewMetadataRows.Children.Clear();
        PreviewChecksumText.Text = "";
        AddMetadataRow("Type", row.TypeText);
        AddMetadataRow("Size", row.SizeText);
        AddMetadataRow("Modified", row.ModifiedText);

        if (row.IsDir || _workspace?.FileOps is null)
        {
            return;
        }

        FilePreview? preview = null;
        try
        {
            preview = await _workspace.FileOps.ReadFilePreviewAsync(row.Path, 2_000_000);
            if (token != _previewToken)
            {
                return;
            }

            AddMetadataRow("Preview type", preview.FileType);
            AddMetadataRow("MIME", preview.MimeType);
            AddMetadataRow("Preview size", EntryPresentation.FormatFileSize(preview.Size, isDirectory: false));
            await RenderPreviewContentAsync(row.Path, preview);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            if (token != _previewToken)
            {
                return;
            }

            PreviewEmptyText.Text = exception.Message;
        }

        await LoadMetadataAsync(row.Path, preview?.FileType, token);
    }

    private async Task RenderPreviewContentAsync(string path, FilePreview preview)
    {
        if (preview.FileType == "text" && preview.Content is not null)
        {
            PreviewTextBox.Text = preview.Content;
            PreviewTextBox.Visibility = Visibility.Visible;
            PreviewEmptyText.Visibility = Visibility.Collapsed;
            return;
        }

        if (preview.FileType == "image")
        {
            if (preview.Content is not null && await TrySetPreviewImageAsync(preview.Content))
            {
                PreviewEmptyText.Visibility = Visibility.Collapsed;
                return;
            }

            try
            {
                var thumbnail = await _workspace!.FileOps!.GenerateThumbnailAsync(path, 256);
                if (await TrySetPreviewImageAsync(thumbnail))
                {
                    PreviewEmptyText.Text = "Thumbnail preview";
                    return;
                }
            }
            catch
            {
                // Unsupported image codecs still keep metadata and actions visible.
            }
        }

        PreviewEmptyText.Text = preview.Content is null
            ? "No inline preview is available for this file."
            : $"Preview content uses {preview.Encoding ?? "an unsupported"} encoding.";
    }

    private async Task LoadMetadataAsync(string path, string? previewType, int token)
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        try
        {
            var metadata = await _workspace.FileOps.GetFileMetadataAsync(path);
            if (token != _previewToken)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(metadata.Summary))
            {
                AddMetadataRow("Summary", metadata.Summary!);
            }

            if (!string.Equals(metadata.Kind, "unsupported", StringComparison.OrdinalIgnoreCase))
            {
                AddMetadataRow("Metadata kind", metadata.Kind);
            }

            AddMetadataRows(metadata.Fields);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            if (token == _previewToken)
            {
                AddMetadataRow("Metadata", exception.Message);
            }
        }

        if (!string.Equals(previewType, "image", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            var image = await _workspace.FileOps.GetImageMetadataAsync(path);
            if (token != _previewToken)
            {
                return;
            }

            AddMetadataRow("Dimensions", $"{image.Width} x {image.Height}");
            AddMetadataRows(image.Exif.Take(12));
        }
        catch
        {
            // get_file_metadata already covers the non-EXIF image summary.
        }
    }

    private async Task<bool> TrySetPreviewImageAsync(string base64)
    {
        try
        {
            var bytes = Convert.FromBase64String(base64);
            var stream = new InMemoryRandomAccessStream();
            var writer = new DataWriter(stream.GetOutputStreamAt(0));
            writer.WriteBytes(bytes);
            await writer.StoreAsync();
            await writer.FlushAsync();
            writer.DetachStream();
            writer.Dispose();
            stream.Seek(0);
            var bitmap = new BitmapImage();
            await bitmap.SetSourceAsync(stream);
            PreviewImage.Source = bitmap;
            PreviewImage.Visibility = Visibility.Visible;
            return true;
        }
        catch
        {
            PreviewImage.Source = null;
            PreviewImage.Visibility = Visibility.Collapsed;
            return false;
        }
    }

    private void AddMetadataRows(IEnumerable<string[]> rows)
    {
        foreach (var row in rows)
        {
            if (row.Length >= 2)
            {
                AddMetadataRow(row[0], row[1]);
            }
        }
    }

    private void AddMetadataRow(string label, string value)
    {
        if (string.IsNullOrWhiteSpace(label) || string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        PreviewMetadataRows.Children.Add(new TextBlock
        {
            Text = $"{label}: {value}",
            FontSize = 12,
            Opacity = 0.86,
            TextWrapping = TextWrapping.Wrap,
        });
    }

    private async void OnPreviewOpenClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is null || ActiveSelectedRow is not { } row)
        {
            return;
        }

        try
        {
            await _workspace.OpenPathAsync(row.Path, row.IsDir, _workspace.ActivePane);
        }
        catch (IpcException exception)
        {
            ShowMessage("Open", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async void OnPreviewRevealClick(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps is null || ActiveSelectedRow is not { } row)
        {
            return;
        }

        try
        {
            await _workspace.FileOps.RevealInFolderAsync(row.Path);
        }
        catch (IpcException exception)
        {
            ShowMessage("Reveal in folder", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async void OnPreviewOpenWithClick(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps is null || ActiveSelectedRow is not { IsDir: false } row)
        {
            return;
        }

        var input = new TextBox
        {
            PlaceholderText = "Application name or full path",
        };
        var dialog = new ContentDialog
        {
            Title = "Open With",
            Content = input,
            PrimaryButtonText = "Open",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };

        var result = await dialog.ShowAsync();
        if (result != ContentDialogResult.Primary || string.IsNullOrWhiteSpace(input.Text))
        {
            return;
        }

        try
        {
            await _workspace.FileOps.OpenFileWithAsync(row.Path, input.Text.Trim());
        }
        catch (IpcException exception)
        {
            ShowMessage("Open With", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async void OnPreviewChecksumClick(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps is null || ActiveSelectedRow is not { IsDir: false } row)
        {
            return;
        }

        PreviewChecksumButton.IsEnabled = false;
        PreviewChecksumText.Text = "Computing...";
        try
        {
            var checksums = await _workspace.FileOps.ComputeChecksumAsync(row.Path);
            PreviewChecksumText.Text =
                $"MD5    {checksums.Md5}{Environment.NewLine}" +
                $"SHA1   {checksums.Sha1}{Environment.NewLine}" +
                $"SHA256 {checksums.Sha256}";
        }
        catch (IpcException exception)
        {
            PreviewChecksumText.Text = exception.Message;
        }
        finally
        {
            PreviewChecksumButton.IsEnabled = ActiveSelectedRow is { IsDir: false };
        }
    }

    private async void OnPreviewCompareClick(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        var selected = ActiveSelectedRows;
        if (selected.Count != 2 || selected.Any(row => row.IsDir))
        {
            return;
        }

        try
        {
            var comparison = await _workspace.FileOps.CompareFilesAsync(selected[0].Path, selected[1].Path);
            await ShowComparisonAsync(comparison);
        }
        catch (IpcException exception)
        {
            ShowMessage("Compare files", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task ShowComparisonAsync(FileComparison comparison)
    {
        var summary = comparison.Identical
            ? "Files are identical."
            : $"{comparison.Added} added, {comparison.Removed} removed, {comparison.Changed} changed";
        var rows = comparison.Rows
            .Take(80)
            .Select(row =>
            {
                var left = row.LeftLine?.ToString() ?? "";
                var right = row.RightLine?.ToString() ?? "";
                var text = row.LeftText ?? row.RightText ?? "";
                return $"{row.Kind,-8} {left,4} {right,4}  {text}";
            });

        var diffBox = new TextBox
        {
            Text = string.Join(Environment.NewLine, rows),
            FontFamily = new Microsoft.UI.Xaml.Media.FontFamily("Consolas"),
            FontSize = 12,
            IsReadOnly = true,
            AcceptsReturn = true,
            TextWrapping = TextWrapping.NoWrap,
            MaxHeight = 360,
        };
        ScrollViewer.SetHorizontalScrollBarVisibility(diffBox, ScrollBarVisibility.Auto);
        ScrollViewer.SetVerticalScrollBarVisibility(diffBox, ScrollBarVisibility.Auto);

        var body = new StackPanel
        {
            Spacing = 8,
            Children =
            {
                new TextBlock { Text = $"{comparison.LeftName} -> {comparison.RightName}" },
                new TextBlock { Text = summary },
                diffBox,
            },
        };

        var dialog = new ContentDialog
        {
            Title = "File Compare",
            Content = body,
            CloseButtonText = "Close",
            XamlRoot = Content.XamlRoot,
        };

        await dialog.ShowAsync();
    }

    private async void OnTabClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is Button { Tag: PaneTab tab })
        {
            await _workspace.SwitchToTabAsync(tab.TabId, tab.Pane);
        }
    }

    private async void OnTabPointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (!e.GetCurrentPoint((UIElement)sender).Properties.IsMiddleButtonPressed)
        {
            return;
        }

        if (_workspace is not null && sender is FrameworkElement { Tag: PaneTab tab })
        {
            e.Handled = true;
            await _workspace.CloseTabAsync(tab.TabId, tab.Pane);
        }
    }

    private async void OnTabCloseClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is Button { Tag: PaneTab tab })
        {
            await _workspace.CloseTabAsync(tab.TabId, tab.Pane);
        }
    }

    private async void OnNewTabClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is Button { Tag: PaneId pane })
        {
            await _workspace.OpenNewTabAsync(pane);
        }
    }

    private void OnSortName(object sender, RoutedEventArgs e) => _workspace?.SetSort("name");

    private void OnSortSize(object sender, RoutedEventArgs e) => _workspace?.SetSort("size");

    private void OnSortDate(object sender, RoutedEventArgs e) => _workspace?.SetSort("date");

    private void OnSortType(object sender, RoutedEventArgs e) => _workspace?.SetSort("type");

    private void OnDividerPressed(object sender, PointerRoutedEventArgs e)
    {
        _dividerDragging = true;
        PaneDivider.CapturePointer(e.Pointer);
    }

    private void OnDividerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_dividerDragging)
        {
            return;
        }

        var point = e.GetCurrentPoint(PanesGrid).Position;
        if (PanesGrid.ActualWidth <= 0)
        {
            return;
        }

        _primaryPercent = Math.Clamp(point.X / PanesGrid.ActualWidth * 100, PaneMinPercent, PaneMaxPercent);
        ApplyDualPaneLayout();
    }

    private void OnDividerReleased(object sender, PointerRoutedEventArgs e)
    {
        _dividerDragging = false;
        PaneDivider.ReleasePointerCapture(e.Pointer);
    }

    private async void OnRefreshAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.RefreshAsync();
        }
    }

    private async void OnDualPaneAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null)
        {
            await _workspace.ToggleDualPaneAsync();
        }
    }

    private async void OnBackAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.GoBackAsync();
        }
    }

    private async void OnForwardAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.GoForwardAsync();
        }
    }

    private async void OnUpAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.GoUpAsync();
        }
    }

    private void OnFocusPrimaryAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        _workspace?.ActivatePane(PaneId.Primary);
    }

    private async void OnFocusSecondaryAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null)
        {
            await _workspace.FocusSecondaryAsync();
        }
    }

    private async void OnNewTabAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.OpenNewTabAsync();
        }
    }

    private async void OnCloseTabAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is null || IsEditingPath)
        {
            return;
        }

        var id = _workspace.Active.ActiveTabId;
        if (id is not null)
        {
            await _workspace.CloseTabAsync(id, _workspace.ActivePane);
        }
    }

    private async void OnNextTabAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.SwitchTabByAsync(1);
        }
    }

    private async void OnPreviousTabAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !IsEditingPath)
        {
            await _workspace.SwitchTabByAsync(-1);
        }
    }

    private bool IsEditingPath => _editingPrimaryPath || _editingSecondaryPath;

    private async Task PromptNetworkReconnectAsync(string name, string? detail, string? remote, string path)
    {
        if (_workspace is null || _reconnectDialogOpen)
        {
            return;
        }

        _reconnectDialogOpen = true;
        var dialog = new ContentDialog
        {
            Title = "Network drive unavailable",
            Content = string.Join(
                Environment.NewLine,
                new[]
                {
                    $"{name} is currently unavailable.",
                    detail ?? "",
                    string.IsNullOrEmpty(remote) ? "" : $"Share: {remote}",
                    $"Path: {path}",
                    "Retry probes the mapping again. Check VPN or credentials if it stays offline.",
                }.Where(line => line.Length > 0)),
            PrimaryButtonText = "Retry",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };

        try
        {
            var result = await dialog.ShowAsync();
            if (result == ContentDialogResult.Primary)
            {
                await _workspace.RetryPendingDriveAsync();
            }
            else
            {
                _workspace.CancelPendingReconnect();
            }
        }
        finally
        {
            _reconnectDialogOpen = false;
        }
    }

    private void ShowMessage(string title, string message, InfoBarSeverity severity)
    {
        MessageBar.Title = title;
        MessageBar.Message = message;
        MessageBar.Severity = severity;
        MessageBar.IsOpen = true;
        StatusText.Text = message;
    }

    private void QueueWatchActiveDirectory()
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        var path = _workspace.Active.Path;
        if (string.IsNullOrWhiteSpace(path)
            || string.Equals(path, _watchTargetPath, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        _watchTargetPath = path;
        _ = WatchDirectoryAsync(path);
    }

    private async Task WatchDirectoryAsync(string path)
    {
        try
        {
            await (_workspace?.FileOps?.WatchDirectoryAsync(path) ?? Task.CompletedTask);
            _watchedPath = path;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            if (string.Equals(path, _watchTargetPath, StringComparison.OrdinalIgnoreCase))
            {
                _watchTargetPath = null;
            }

            StatusText.Text = exception.Message;
        }
    }

    private void OnFileChange(FileChangeEvent change)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            if (_workspace is null || string.IsNullOrEmpty(_watchedPath))
            {
                return;
            }

            if (!string.IsNullOrEmpty(_previewPath)
                && string.Equals(change.Path, _previewPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (_searchMode)
            {
                return;
            }

            if (!PathRules.PathContains(_workspace.Active.Path, change.Path)
                && !string.Equals(_workspace.Active.Path, _watchedPath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var name = System.IO.Path.GetFileName(change.Path);
            StatusText.Text = string.IsNullOrEmpty(name)
                ? $"{change.Kind}: {change.Path}"
                : $"{change.Kind}: {name}";
            ScheduleInPlaceRefresh();
        });
    }

    private async void ScheduleInPlaceRefresh()
    {
        var token = Interlocked.Increment(ref _folderRefreshToken);
        try
        {
            await Task.Delay(350);
            if (token != _folderRefreshToken || _workspace is null)
            {
                return;
            }

            await _workspace.RefreshAsync();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            StatusText.Text = exception.Message;
        }
    }

    private async void OnClosed(object sender, WindowEventArgs args)
    {
        _fileChangeSubscription?.Dispose();
        _fileChangeSubscription = null;

        if (_workspace?.FileOps is not null)
        {
            try
            {
                await _workspace.FileOps.UnwatchDirectoryAsync();
            }
            catch
            {
                // Best-effort shutdown cleanup.
            }
        }

        if (_workspace is not null)
        {
            try
            {
                await _workspace.SaveWorkspaceLayoutAsync();
                await _workspace.SaveUiSettingsAsync();
            }
            catch
            {
                // Best-effort persistence on exit.
            }

            _workspace.Changed -= OnWorkspaceChanged;
            _workspace = null;
        }

        if (_backend is not null)
        {
            await _backend.DisposeAsync();
            _backend = null;
        }
    }

    private readonly record struct PanePath(PaneId Pane, string Path);

    private readonly record struct PaneTab(PaneId Pane, string TabId);

    // ========================================================================
    // File operation helpers
    // ========================================================================

    private ListView ActiveFileList
        => _workspace?.ActivePane == PaneId.Secondary ? SecondaryFileList : PrimaryFileList;

    private string? SelectedPath
    {
        get
        {
            var list = ActiveFileList;
            return list.SelectedItem is FileRow row ? row.Path : null;
        }
    }

    private string[]? SelectedPaths
    {
        get
        {
            var list = ActiveFileList;
            var items = list.SelectedItems;
            if (items == null || items.Count == 0) return null;
            return items.OfType<FileRow>().Select(r => r.Path).ToArray();
        }
    }

    private async Task PromptAndCreateFolder(PaneId pane)
    {
        if (_workspace is null) return;

        var dialog = new ContentDialog
        {
            Title = "New Folder",
            Content = new TextBox { PlaceholderText = "Folder name" },
            PrimaryButtonText = "Create",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary && dialog.Content is TextBox tb && !string.IsNullOrWhiteSpace(tb.Text))
        {
            try
            {
                _workspace.ActivatePane(pane);
                await _workspace.CreateFolderInCurrentPaneAsync(tb.Text.Trim());
            }
            catch (IpcException ex)
            {
                ShowMessage("New Folder", ex.Message, InfoBarSeverity.Error);
            }
        }
    }

    private async Task PromptAndCreateFile(PaneId pane)
    {
        if (_workspace is null) return;

        var dialog = new ContentDialog
        {
            Title = "New File",
            Content = new TextBox { PlaceholderText = "File name" },
            PrimaryButtonText = "Create",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary && dialog.Content is TextBox tb && !string.IsNullOrWhiteSpace(tb.Text))
        {
            try
            {
                _workspace.ActivatePane(pane);
                await _workspace.CreateFileInCurrentPaneAsync(tb.Text.Trim());
            }
            catch (IpcException ex)
            {
                ShowMessage("New File", ex.Message, InfoBarSeverity.Error);
            }
        }
    }

    private async Task PromptAndRename()
    {
        if (_workspace is null) return;

        var list = ActiveFileList;
        if (list.SelectedItem is not FileRow row) return;

        var tb = new TextBox { Text = row.Name };
        tb.SelectAll();

        var dialog = new ContentDialog
        {
            Title = "Rename",
            Content = tb,
            PrimaryButtonText = "Rename",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary && !string.IsNullOrWhiteSpace(tb.Text) && tb.Text.Trim() != row.Name)
        {
            try
            {
                await _workspace.RenameSelectedAsync(row.Path, tb.Text.Trim());
            }
            catch (IpcException ex)
            {
                ShowMessage("Rename", ex.Message, InfoBarSeverity.Error);
            }
        }
    }

    private async Task TrashSelected()
    {
        if (_workspace is null) return;
        var paths = SelectedPaths;
        if (paths is null || paths.Length == 0) return;

        if (_workspace.Settings.ConfirmDelete)
        {
            var dialog = new ContentDialog
            {
                Title = _workspace.Settings.UseTrash ? "Move to Trash" : "Delete",
                Content = $"Delete {paths.Length} item(s)?",
                PrimaryButtonText = _workspace.Settings.UseTrash ? "Trash" : "Delete",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Close,
                XamlRoot = Content.XamlRoot,
            };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary)
            {
                return;
            }
        }

        try
        {
            if (_workspace.Settings.UseTrash)
            {
                await _workspace.TrashSelectedAsync(paths);
            }
            else
            {
                foreach (var path in paths)
                {
                    await _workspace.DeleteSelectedAsync(path);
                }
            }
        }
        catch (IpcException ex)
        {
            if (FileOperationService.IsTrashUnavailable(ex))
            {
                ShowMessage("Trash unavailable", ex.Message, InfoBarSeverity.Warning);
                return;
            }

            ShowMessage("Trash", ex.Message, InfoBarSeverity.Error);
        }
    }

    private async Task DeleteSelected()
    {
        if (_workspace is null) return;
        var path = SelectedPath;
        if (path is null) return;

        var dialog = new ContentDialog
        {
            Title = "Permanently Delete",
            Content = $"Are you sure you want to permanently delete this item?\n{path}",
            PrimaryButtonText = "Delete",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
            XamlRoot = Content.XamlRoot,
        };

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            try
            {
                await _workspace.DeleteSelectedAsync(path);
            }
            catch (IpcException ex)
            {
                ShowMessage("Delete", ex.Message, InfoBarSeverity.Error);
            }
        }
    }

    private void CopyToClipboard()
    {
        var paths = SelectedPaths;
        if (paths is not null && paths.Length > 0)
        {
            _workspace?.Clipboard.SetCopy(paths);
            _workspace?.RememberClipboard();
            StatusText.Text = $"Copied {paths.Length} item(s)";
        }
    }

    private void CutToClipboard()
    {
        var paths = SelectedPaths;
        if (paths is not null && paths.Length > 0)
        {
            _workspace?.Clipboard.SetCut(paths);
            _workspace?.RememberClipboard();
            StatusText.Text = $"Cut {paths.Length} item(s)";
        }
    }

    private async Task PasteFromClipboard()
    {
        if (_workspace is null || !_workspace.Clipboard.HasItems) return;

        var clipboard = _workspace.Clipboard;
        var destination = _workspace.Active.Path;
        await TransferWithConflictAsync(clipboard.SourcePaths, destination, clipboard.Operation == ClipboardOperation.Cut);
        if (clipboard.Operation == ClipboardOperation.Cut)
        {
            clipboard.Clear();
        }
    }

    private void StartTransferProgress(string operationId, string label)
    {
        _currentOperationId = operationId;
        FileProgressPanel.Start(label);
    }

    private void OnTransferProgress(ProgressUpdate update)
    {
        if (_currentOperationId is not null
            && !string.Equals(update.OperationId, _currentOperationId, StringComparison.Ordinal))
        {
            return;
        }

        FileProgressPanel.UpdateProgress(update);
        if (update.Status is "completed" or "cancelled" or "error")
        {
            _currentOperationId = null;
        }
    }

    private async void OnFileProgressCancelRequested(object? sender, EventArgs e)
    {
        var operationId = _currentOperationId;
        if (string.IsNullOrEmpty(operationId) || _workspace?.FileOps is null)
        {
            return;
        }

        FileProgressPanel.SetCancelling();
        try
        {
            await _workspace.FileOps.CancelOperationAsync(operationId);
        }
        catch (IpcException ex)
        {
            ShowMessage("Cancel operation", ex.Message, InfoBarSeverity.Error);
        }
    }

    private async Task StartSearchAsync()
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        var query = SearchBox.Text.Trim();
        if (query.Length == 0)
        {
            await CancelActiveSearchAsync();
            ClearSearchState();
            SyncFromWorkspace();
            return;
        }

        await CancelActiveSearchAsync();

        var pane = _workspace.ActivePane;
        var root = _workspace.Active.Path;
        var searchId = $"search_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Interlocked.Increment(ref _searchCounter)}";
        _activeSearchId = searchId;
        _searchMode = true;
        _searchPane = pane;
        _searchRoot = root;
        _activeSearchResults.Clear();
        SearchCancelButton.IsEnabled = true;
        ApplySearchRows();
        StatusText.Text = $"Searching {root}...";

        var options = new SearchOptions
        {
            Query = query,
            SearchPath = root,
            CaseSensitive = false,
            IncludeHidden = false,
            MaxResults = 1000,
            MaxDepth = 10,
            SearchId = searchId,
            ContentSearch = false,
        };

        try
        {
            var results = await _workspace.FileOps.SearchAsync(
                options,
                batch => DispatcherQueue.TryEnqueue(() =>
                {
                    if (!string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
                    {
                        return;
                    }

                    _activeSearchResults.AddRange(batch);
                    ApplySearchRows();
                    StatusText.Text = $"Searching... {_activeSearchResults.Count} result(s)";
                }),
                count => DispatcherQueue.TryEnqueue(() =>
                {
                    if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
                    {
                        StatusText.Text = $"Search complete: {count} result(s)";
                    }
                }));

            if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
            {
                _activeSearchResults.Clear();
                _activeSearchResults.AddRange(results);
                ApplySearchRows();
                StatusText.Text = $"Search complete: {results.Length} result(s)";
            }
        }
        catch (IpcException ex)
        {
            if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
            {
                ShowMessage("Search", ex.Message, InfoBarSeverity.Error);
            }
        }
        finally
        {
            if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
            {
                _activeSearchId = null;
                SearchCancelButton.IsEnabled = false;
            }
        }
    }

    private void ApplySearchRows()
    {
        if (_searchPane == PaneId.Secondary)
        {
            Replace(SecondaryFiles, _activeSearchResults.Select(SearchRowFrom));
        }
        else
        {
            Replace(PrimaryFiles, _activeSearchResults.Select(SearchRowFrom));
        }

        CountText.Text = _activeSearchResults.Count == 1
            ? "1 search result"
            : $"{_activeSearchResults.Count} search results";
    }

    private async Task CancelActiveSearchAsync()
    {
        var searchId = _activeSearchId;
        if (string.IsNullOrEmpty(searchId) || _workspace?.FileOps is null)
        {
            return;
        }

        try
        {
            await _workspace.FileOps.CancelSearchAsync(searchId);
            StatusText.Text = "Search cancelled";
        }
        catch (IpcException ex)
        {
            ShowMessage("Cancel search", ex.Message, InfoBarSeverity.Error);
        }
        finally
        {
            _activeSearchId = null;
            SearchCancelButton.IsEnabled = false;
        }
    }

    private void ClearSearchState()
    {
        _searchMode = false;
        _searchRoot = null;
        _activeSearchId = null;
        _activeSearchResults.Clear();
        SearchCancelButton.IsEnabled = false;
    }

    private async void OnSearchClick(object sender, RoutedEventArgs e) => await StartSearchAsync();

    private async void OnCancelSearchClick(object sender, RoutedEventArgs e)
    {
        await CancelActiveSearchAsync();
    }

    private async void OnSearchKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            await StartSearchAsync();
        }
        else if (e.Key == VirtualKey.Escape)
        {
            e.Handled = true;
            await CancelActiveSearchAsync();
            ClearSearchState();
            SyncFromWorkspace();
        }
    }

    // ========================================================================
    // Per-pane button Click handlers
    // ========================================================================

    private async void OnPrimaryNewFolder(object sender, RoutedEventArgs e) => await PromptAndCreateFolder(PaneId.Primary);

    private async void OnPrimaryNewFile(object sender, RoutedEventArgs e) => await PromptAndCreateFile(PaneId.Primary);

    private async void OnPrimaryRename(object sender, RoutedEventArgs e)
    {
        _workspace?.ActivatePane(PaneId.Primary);
        await PromptAndRename();
    }

    private async void OnPrimaryDelete(object sender, RoutedEventArgs e)
    {
        _workspace?.ActivatePane(PaneId.Primary);
        await TrashSelected();
    }

    private async void OnSecondaryNewFolder(object sender, RoutedEventArgs e) => await PromptAndCreateFolder(PaneId.Secondary);

    private async void OnSecondaryNewFile(object sender, RoutedEventArgs e) => await PromptAndCreateFile(PaneId.Secondary);

    private async void OnSecondaryRename(object sender, RoutedEventArgs e)
    {
        _workspace?.ActivatePane(PaneId.Secondary);
        await PromptAndRename();
    }

    private async void OnSecondaryDelete(object sender, RoutedEventArgs e)
    {
        _workspace?.ActivatePane(PaneId.Secondary);
        await TrashSelected();
    }

    // ========================================================================
    // Keyboard accelerator handlers
    // ========================================================================

    private async void OnNewFolderAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await PromptAndCreateFolder(_workspace?.ActivePane ?? PaneId.Primary);
    }

    private async void OnNewFileAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await PromptAndCreateFile(_workspace?.ActivePane ?? PaneId.Primary);
    }

    private async void OnRenameAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await PromptAndRename();
    }

    private async void OnDeleteAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await DeleteSelected();
    }

    private async void OnTrashAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await TrashSelected();
    }

    private void OnCopyAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        CopyToClipboard();
    }

    private void OnCutAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        CutToClipboard();
    }

    private async void OnPasteAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await PasteFromClipboard();
    }

    private FileRow[] GetSelectedEntries() => ActiveSelectedRows.ToArray();
    private void ShowError(string message) => ShowMessage("Error", message, Microsoft.UI.Xaml.Controls.InfoBarSeverity.Error);
    private void RefreshView() => SyncFromWorkspace();

    private static bool IsCancellationMessage(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        return message.Contains("cancel", StringComparison.OrdinalIgnoreCase);
    }

    private void OnOpenTerminalAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        OnOpenTerminalClicked(sender, new RoutedEventArgs());
    }

    private void OnSettingsAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        OnSettingsClicked(sender, new RoutedEventArgs());
    }

    private async void OnSettingsClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var dialog = new SettingsDialog
        {
            XamlRoot = Content.XamlRoot,
            OwnerHwnd = WinRT.Interop.WindowNative.GetWindowHandle(this),
        };
        await dialog.LoadSettingsAsync(_workspace.FileOps);
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            await dialog.SaveSettingsAsync(_workspace.FileOps);
            dialog.ApplyTo(_workspace.Settings);
            _workspace.SetShowHidden(_workspace.Settings.ShowHidden);
            ApplyTheme(_workspace.Settings.Theme);
            await _workspace.SaveUiSettingsAsync();
        }
    }

    private async void OnViewArchiveClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var selected = GetSelectedEntries();
        if (selected.Length != 1) return;
        var entry = selected[0];
        try
        {
            var info = await _workspace.FileOps.ListArchiveAsync(entry.Path);
            var dialog = new ArchiveViewerDialog { XamlRoot = Content.XamlRoot };
            dialog.ArchiveData = info;
            var result = await dialog.ShowAsync();
            if (dialog.ExtractRequested)
            {
                await ShowExtractDialogAsync(info);
            }
        }
        catch (Exception ex) { ShowError(ex.Message); }
    }

    private async Task ShowExtractDialogAsync(SimpleFile.Ipc.ArchiveInfo info)
    {
        if (_workspace?.FileOps == null) return;
        var dialog = new ExtractArchiveDialog { XamlRoot = Content.XamlRoot };
        dialog.ArchiveData = info;
        dialog.SetBaseDirectory(_workspace.Active.Path);
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            await _workspace.FileOps.ExtractArchiveAsync(info.Path, dialog.Destination);
            await _workspace.RefreshAsync();
        }
    }

    private async void OnExtractArchiveClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var selected = GetSelectedEntries();
        if (selected.Length != 1) return;
        try
        {
            var info = await _workspace.FileOps.ListArchiveAsync(selected[0].Path);
            await ShowExtractDialogAsync(info);
        }
        catch (Exception ex) { ShowError(ex.Message); }
    }

    private async void OnCreateArchiveClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var selected = GetSelectedEntries();
        if (selected.Length == 0) return;
        var dialog = new CreateArchiveDialog { XamlRoot = Content.XamlRoot };
        dialog.SelectedPaths = System.Linq.Enumerable.ToArray(System.Linq.Enumerable.Select(selected, e => e.Path));
        dialog.SelectedNames = System.Linq.Enumerable.ToArray(System.Linq.Enumerable.Select(selected, e => e.Name));
        dialog.TargetDirectory = _workspace.Active.Path;
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            await _workspace.FileOps.CreateArchiveAsync(
                dialog.SelectedPaths, 
                System.IO.Path.Combine(dialog.TargetDirectory, dialog.ArchiveName),
                dialog.ArchiveFormat);
            await _workspace.RefreshAsync();
        }
    }

    private async void OnDuplicateCheckerClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var path = _workspace.Active.Path;
        if (string.IsNullOrWhiteSpace(path)) return;

        var dialog = new DuplicateCheckerDialog { XamlRoot = Content.XamlRoot, Directory = path };
        dialog.ShowConfiguration();
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;

        var progress = new Progress<Ipc.ProgressUpdate>(update =>
        {
            DispatcherQueue.TryEnqueue(() => dialog.UpdateProgress(update));
        });

        dialog.ScanCancelled += (_, _) =>
        {
            _ = _workspace.FileOps.CancelDuplicateCheckAsync();
        };
        dialog.PreviewRequested += (_, filePath) =>
        {
            QueuePreview(ToFileRow(new FileEntry
            {
                Name = System.IO.Path.GetFileName(filePath),
                Path = filePath,
            }));
        };
        dialog.OpenRequested += (_, filePath) =>
        {
            _ = _workspace.FileOps.OpenFileAsync(filePath);
        };
        dialog.RevealRequested += (_, filePath) =>
        {
            _ = _workspace.FileOps.RevealInFolderAsync(filePath);
        };

        try
        {
            dialog.ShowScanning();
            var scanUi = dialog.ShowAsync();
            var result = await _workspace.FileOps.DuplicateCheckAsync(
                path, dialog.MinSizeBytes, null, progress);
            if (dialog.ScanWasCancelled)
            {
                return;
            }

            dialog.ShowResults(result);
            await scanUi;
            if (dialog.DeleteRequested)
            {
                var trash = dialog.PathsToDelete;
                if (trash.Length > 0)
                {
                    await _workspace.FileOps.TrashAsync(trash);
                    await _workspace.RefreshAsync();
                }
            }
        }
        catch (OperationCanceledException)
        {
            dialog.Hide();
        }
        catch (Exception ex)
        {
            dialog.Hide();
            if (!IsCancellationMessage(ex.Message))
            {
                ShowError(ex.Message);
            }
        }
    }

    private async void OnDiskCleanupClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        var path = _workspace.Active.Path;
        if (string.IsNullOrWhiteSpace(path)) return;

        var dialog = new DiskCleanupDialog { XamlRoot = Content.XamlRoot, Directory = path };
        dialog.ShowConfiguration();
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;

        var progress = new Progress<Ipc.ProgressUpdate>(update =>
        {
            DispatcherQueue.TryEnqueue(() => dialog.UpdateProgress(update));
        });

        dialog.ScanCancelled += (_, _) =>
        {
            _ = _workspace.FileOps.CancelDiskCleanupAsync();
        };

        try
        {
            dialog.ShowScanning();
            var scanUi = dialog.ShowAsync();
            var result = await _workspace.FileOps.DiskCleanupAsync(path, dialog.ThresholdBytes, progress);
            if (dialog.ScanWasCancelled)
            {
                return;
            }

            dialog.ShowResults(result);
            await scanUi;
        }
        catch (OperationCanceledException)
        {
            dialog.Hide();
        }
        catch (Exception ex)
        {
            dialog.Hide();
            if (!IsCancellationMessage(ex.Message))
            {
                ShowError(ex.Message);
            }
        }
    }

    private async void OnSetColorLabelClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace == null) return;
        var selected = GetSelectedEntries();
        if (selected.Length == 0) return;
        var dialog = new TagPickerDialog { XamlRoot = Content.XamlRoot };
        dialog.SetTags(System.Linq.Enumerable.ToArray(_workspace.AllTags));
        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            var paths = System.Linq.Enumerable.ToArray(System.Linq.Enumerable.Select(selected, e => e.Path));
            if (dialog.SelectedTagId.HasValue)
                await _workspace.SetColorLabelAsync(paths, dialog.SelectedTagId.Value);
            else
                await _workspace.RemoveColorLabelAsync(paths);
            RefreshView();
        }
    }

    private async void OnOpenTerminalClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace?.FileOps == null) return;
        await _workspace.FileOps.OpenTerminalAsync(_workspace.Active.Path);
    }

    private void RefreshSmartFolders()
    {
        if (_workspace == null) return;
        BindItemsSource(SmartFoldersList, _workspace.SmartFolders);
    }

    private async void OnSmartFolderClicked(object sender, ItemClickEventArgs e)
    {
        if (_workspace == null || e.ClickedItem is not SimpleFile.Ipc.SmartFolder folder) return;
        
        await CancelActiveSearchAsync();
        
        var pane = _workspace.ActivePane;
        var root = folder.SearchOptions.SearchPath;
        if (string.IsNullOrEmpty(root)) root = _workspace.Active.Path;
        
        var searchId = $"search_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Interlocked.Increment(ref _searchCounter)}";
        folder.SearchOptions.SearchId = searchId;
        
        _activeSearchId = searchId;
        _searchMode = true;
        _searchPane = pane;
        _searchRoot = root;
        _activeSearchResults.Clear();
        SearchCancelButton.IsEnabled = true;
        ApplySearchRows();
        StatusText.Text = $"Searching Smart Folder...";
        
        try
        {
            var results = await _workspace.FileOps!.SearchAsync(
                folder.SearchOptions,
                batch => DispatcherQueue.TryEnqueue(() =>
                {
                    if (!string.Equals(_activeSearchId, searchId, StringComparison.Ordinal)) return;
                    _activeSearchResults.AddRange(batch);
                    ApplySearchRows();
                    StatusText.Text = $"Searching... {_activeSearchResults.Count} result(s)";
                }),
                count => DispatcherQueue.TryEnqueue(() =>
                {
                    if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
                        StatusText.Text = $"Search complete: {count} result(s)";
                }));
            
            if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
            {
                _activeSearchResults.Clear();
                _activeSearchResults.AddRange(results);
                ApplySearchRows();
                StatusText.Text = $"Search complete: {results.Length} result(s)";
            }
        }
        catch (Exception ex)
        {
            if (string.Equals(_activeSearchId, searchId, StringComparison.Ordinal))
                StatusText.Text = ex.Message;
        }
    }

    private async void OnRefreshFolderTree(object sender, RoutedEventArgs e)
    {
        if (_workspace is null)
        {
            return;
        }

        var root = _workspace.Active.Path;
        if (string.IsNullOrEmpty(root))
        {
            root = _workspace.HomePath;
        }

        await _workspace.LoadTreeChildrenAsync(root);
    }

    private async void OnFolderTreeClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is FolderTreeItem item)
        {
            await _workspace.NavigateToAsync(item.Path);
        }
    }

    private async void OnFolderTreeToggle(object sender, RoutedEventArgs e)
    {
        if (_workspace is null || sender is not FrameworkElement { Tag: string path })
        {
            return;
        }

        _workspace.ToggleTreeExpanded(path);
        await _workspace.LoadTreeChildrenAsync(path);
    }

    private void OnAddBookmark(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && !string.IsNullOrEmpty(_workspace.Active.Path))
        {
            _workspace.AddBookmark(_workspace.Active.Path);
        }
    }

    private void OnRemoveBookmark(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is FrameworkElement { Tag: string path })
        {
            _workspace.RemoveBookmark(path);
        }
    }

    private async void OnBookmarkClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is BookmarkItem item)
        {
            await _workspace.NavigateToAsync(item.Path);
        }
    }

    private async void OnRecentClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is string path)
        {
            await _workspace.NavigateToAsync(path);
        }
    }

    private async void OnSaveSmartFolder(object sender, RoutedEventArgs e)
    {
        if (_workspace is null)
        {
            return;
        }

        var nameBox = new TextBox { PlaceholderText = "Smart folder name", Text = SearchBox.Text.Trim() };
        var dialog = new ContentDialog
        {
            Title = "Save Smart Folder",
            Content = nameBox,
            PrimaryButtonText = "Save",
            CloseButtonText = "Cancel",
            XamlRoot = Content.XamlRoot,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || string.IsNullOrWhiteSpace(nameBox.Text))
        {
            return;
        }

        var options = new SearchOptions
        {
            Query = SearchBox.Text.Trim(),
            SearchPath = _workspace.Active.Path,
            IncludeHidden = _workspace.Settings.ShowHidden,
            SearchId = $"smart_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
        };
        try
        {
            await _workspace.SaveCurrentSearchAsSmartFolderAsync(nameBox.Text.Trim(), options);
            RefreshSmartFolders();
        }
        catch (Exception exception)
        {
            ShowMessage("Smart folder", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async void OnDeleteSmartFolderClicked(object sender, RoutedEventArgs e)
    {
        if (_workspace == null || sender is not FrameworkElement fe || fe.Tag is not string folderId) return;
        await _workspace.DeleteSmartFolderAsync(folderId);
        RefreshSmartFolders();
    }
}
