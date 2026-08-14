using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Windows.Graphics;
using Windows.System;

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

    public ObservableCollection<FileRow> PrimaryFiles { get; } = [];
    public ObservableCollection<FileRow> SecondaryFiles { get; } = [];
    public ObservableCollection<DriveRow> Drives { get; } = [];
    public ObservableCollection<QuickAccessRow> QuickAccess { get; } = [];

    public MainWindow()
    {
        InitializeComponent();
        Title = "SimpleFile - File Explorer";
        AppWindow.Resize(new SizeInt32(1200, 800));

        PrimaryFileList.ItemsSource = PrimaryFiles;
        SecondaryFileList.ItemsSource = SecondaryFiles;
        DriveList.ItemsSource = Drives;
        QuickAccessList.ItemsSource = QuickAccess;

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
            _workspace.Changed += OnWorkspaceChanged;
            await _workspace.InitializeAsync();
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
        if (_workspace is null)
        {
            return;
        }

        Replace(PrimaryFiles, _workspace.VisibleEntriesFor(PaneId.Primary).Select(FileRow.From));
        Replace(SecondaryFiles, _workspace.VisibleEntriesFor(PaneId.Secondary).Select(FileRow.From));
        Replace(
            Drives,
            _workspace.Drives.Select(drive => DriveRow.From(drive, _workspace.Pane(_workspace.SidebarTarget).Path)));
        Replace(
            QuickAccess,
            ExplorerWorkspace.QuickAccessLocations.Select(item => new QuickAccessRow
            {
                Name = item.Name,
                Icon = item.Icon,
                Command = item.Command,
            }));

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

        var active = _workspace.Active;
        var count = _workspace.VisibleEntriesFor(_workspace.ActivePane).Count;
        var paneLabel = _workspace.ActivePaneLabel;
        CountText.Text = count == 1 ? "1 item" : $"{count} items";
        if (!string.IsNullOrEmpty(paneLabel))
        {
            CountText.Text = $"{paneLabel} · {CountText.Text}";
        }

        if (active.ListingInProgress && count == 0)
        {
            StatusText.Text = "Loading…";
        }
        else if (!string.IsNullOrEmpty(_workspace.ErrorMessage))
        {
            StatusText.Text = _workspace.ErrorMessage;
        }
        else if (!string.IsNullOrEmpty(_workspace.StatusMessage))
        {
            StatusText.Text = _workspace.StatusMessage;
        }
        else
        {
            StatusText.Text = active.Path;
        }

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

        if (_workspace.PendingReconnect is { } drive && !_reconnectDialogOpen)
        {
            _ = PromptNetworkReconnectAsync(drive.Name, drive.StatusDetail, drive.RemotePath, drive.Path);
        }
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
            host.Children.Add(tabButton);

            var close = new Button
            {
                Content = "×",
                Padding = new Thickness(6, 2, 6, 2),
                Tag = new PaneTab(paneId, tab.Id),
            };
            close.Click += OnTabCloseClick;
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
        list.SelectedItem = path is null ? null : rows.FirstOrDefault(row => row.Path == path);
    }

    private static void Replace<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
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
        QuickAccessCollapseButton.Content = _quickAccessCollapsed ? "▸" : "▾";
        QuickAccessList.Visibility = _quickAccessCollapsed ? Visibility.Collapsed : Visibility.Visible;
    }

    private void OnToggleMyPc(object sender, RoutedEventArgs e)
    {
        _myPcCollapsed = !_myPcCollapsed;
        MyPcCollapseButton.Content = _myPcCollapsed ? "▸" : "▾";
        DriveList.Visibility = _myPcCollapsed ? Visibility.Collapsed : Visibility.Visible;
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

    private void OnPrimaryFileClick(object sender, ItemClickEventArgs e) => SelectClicked(e, PaneId.Primary);

    private void OnSecondaryFileClick(object sender, ItemClickEventArgs e) => SelectClicked(e, PaneId.Secondary);

    private void SelectClicked(ItemClickEventArgs e, PaneId pane)
    {
        if (_workspace is not null && e.ClickedItem is FileRow row)
        {
            _workspace.SelectPath(row.Path, pane);
        }
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
        if (e.Key != VirtualKey.Enter)
        {
            return;
        }

        e.Handled = true;
        await OpenSelectedFile(list, pane);
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

    private async void OnClosed(object sender, WindowEventArgs args)
    {
        if (_workspace is not null)
        {
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

        try
        {
            await _workspace.TrashSelectedAsync(paths);
        }
        catch (IpcException ex)
        {
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
            StatusText.Text = $"Copied {paths.Length} item(s)";
        }
    }

    private void CutToClipboard()
    {
        var paths = SelectedPaths;
        if (paths is not null && paths.Length > 0)
        {
            _workspace?.Clipboard.SetCut(paths);
            StatusText.Text = $"Cut {paths.Length} item(s)";
        }
    }

    private async Task PasteFromClipboard()
    {
        if (_workspace is null || _workspace.Clipboard is null || !_workspace.Clipboard.HasItems) return;
        if (_workspace.FileOps is null) return;

        var clipboard = _workspace.Clipboard;
        var destination = _workspace.ActivePane == PaneId.Primary ? _workspace.Primary.Path : _workspace.Secondary.Path;

        try
        {
            if (clipboard.Operation == ClipboardOperation.Copy)
            {
                await _workspace.FileOps.CopyAsync(
                    clipboard.SourcePaths, destination, "keep-both");
            }
            else
            {
                await _workspace.FileOps.MoveAsync(
                    clipboard.SourcePaths, destination, "keep-both");
                clipboard.Clear();
            }
            await _workspace.RefreshAsync();
        }
        catch (IpcException ex)
        {
            ShowMessage("Paste", ex.Message, InfoBarSeverity.Error);
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
}
