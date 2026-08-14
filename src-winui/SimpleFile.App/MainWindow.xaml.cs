using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SimpleFile.Core;
using Windows.Graphics;
using Windows.System;

namespace SimpleFile.App;

public sealed partial class MainWindow : Window
{
    private BackendSession? _backend;
    private ExplorerWorkspace? _workspace;
    private bool _quickAccessCollapsed;
    private bool _myPcCollapsed;
    private bool _editingPath;
    private bool _reconnectDialogOpen;

    public ObservableCollection<FileRow> Files { get; } = [];
    public ObservableCollection<DriveRow> Drives { get; } = [];
    public ObservableCollection<QuickAccessRow> QuickAccess { get; } = [];

    public MainWindow()
    {
        InitializeComponent();
        Title = "SimpleFile - File Explorer";
        AppWindow.Resize(new SizeInt32(1200, 800));

        FileList.ItemsSource = Files;
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
            _workspace = new ExplorerWorkspace(_backend);
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

        Replace(Files, _workspace.VisibleEntries.Select(FileRow.From));
            Replace(Drives, _workspace.Drives.Select(drive => DriveRow.From(drive, _workspace.CurrentPath)));
            Replace(
                QuickAccess,
                ExplorerWorkspace.QuickAccessLocations.Select(item => new QuickAccessRow
                {
                    Name = item.Name,
                    Icon = item.Icon,
                    Command = item.Command,
                }));
            RebuildBreadcrumbs(_workspace.Breadcrumbs);

            BackButton.IsEnabled = _workspace.CanGoBack;
            ForwardButton.IsEnabled = _workspace.CanGoForward;
            UpButton.IsEnabled = _workspace.CanGoUp;
            DriveList.Visibility = _myPcCollapsed ? Visibility.Collapsed : Visibility.Visible;
            QuickAccessList.Visibility = _quickAccessCollapsed ? Visibility.Collapsed : Visibility.Visible;

            if (!_editingPath)
            {
                PathInput.Text = _workspace.CurrentPath;
            }

            var selected = _workspace.SelectedPath;
            FileList.SelectedItem = selected is null
                ? null
                : Files.FirstOrDefault(row => row.Path == selected);

            var count = _workspace.VisibleEntries.Count;
            CountText.Text = count == 1 ? "1 item" : $"{count} items";
            if (_workspace.ListingInProgress && count == 0)
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
                StatusText.Text = _workspace.CurrentPath;
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

    private void RebuildBreadcrumbs(IReadOnlyList<SimpleFile.Core.BreadcrumbSegment> crumbs)
    {
        BreadcrumbHost.Children.Clear();
        for (var index = 0; index < crumbs.Count; index++)
        {
            var segment = crumbs[index];
            var button = new Button
            {
                Content = segment.Label,
                Tag = segment.Path,
                Padding = new Thickness(6, 2, 6, 2),
            };
            button.Click += OnBreadcrumbClick;
            BreadcrumbHost.Children.Add(button);
            if (index < crumbs.Count - 1)
            {
                BreadcrumbHost.Children.Add(new TextBlock
                {
                    Text = "/",
                    Margin = new Thickness(4, 0, 4, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                    Opacity = 0.6,
                });
            }
        }
    }

    private static void Replace<T>(ObservableCollection<T> target, IEnumerable<T> source)
    {
        target.Clear();
        foreach (var item in source)
        {
            target.Add(item);
        }
    }

    private async void OnBack(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.GoBackAsync();
        }
    }

    private async void OnForward(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.GoForwardAsync();
        }
    }

    private async void OnUp(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null)
        {
            await _workspace.GoUpAsync();
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
            await _workspace.NavigateSpecialAsync(row.Command);
        }
    }

    private async void OnDriveClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is DriveRow row)
        {
            await _workspace.OpenPathAsync(row.Path, isDirectory: true);
        }
    }

    private async void OnBreadcrumbClick(object sender, RoutedEventArgs e)
    {
        if (_workspace is not null && sender is Button { Tag: string path } && !string.IsNullOrEmpty(path))
        {
            await _workspace.NavigateToAsync(path);
        }
    }

    private void OnEditPath(object sender, RoutedEventArgs e)
    {
        BeginPathEdit();
    }

    private void BeginPathEdit()
    {
        if (_workspace is null)
        {
            return;
        }

        _editingPath = true;
        PathInput.Text = _workspace.CurrentPath;
        BreadcrumbScroller.Visibility = Visibility.Collapsed;
        PathInput.Visibility = Visibility.Visible;
        PathInput.Focus(FocusState.Programmatic);
        PathInput.SelectAll();
    }

    private void EndPathEdit(bool reset)
    {
        _editingPath = false;
        if (reset && _workspace is not null)
        {
            PathInput.Text = _workspace.CurrentPath;
        }

        PathInput.Visibility = Visibility.Collapsed;
        BreadcrumbScroller.Visibility = Visibility.Visible;
    }

    private async void OnPathInputKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Escape)
        {
            e.Handled = true;
            EndPathEdit(reset: true);
            return;
        }

        if (e.Key != VirtualKey.Enter || _workspace is null)
        {
            return;
        }

        var path = PathInput.Text.Trim();
        if (path.Length == 0)
        {
            return;
        }

        e.Handled = true;
        EndPathEdit(reset: false);
        await _workspace.NavigateToAsync(path);
    }

    private void OnPathInputLostFocus(object sender, RoutedEventArgs e)
    {
        if (_editingPath)
        {
            EndPathEdit(reset: true);
        }
    }

    private void OnFileClick(object sender, ItemClickEventArgs e)
    {
        if (_workspace is not null && e.ClickedItem is FileRow row)
        {
            _workspace.SelectPath(row.Path);
        }
    }

    private async void OnFileDoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if (_workspace is not null && FileList.SelectedItem is FileRow row)
        {
            await _workspace.OpenEntryAsync(new SimpleFile.Ipc.FileEntry
            {
                Name = row.Name,
                Path = row.Path,
                IsDir = row.IsDir,
            });
        }
    }

    private async void OnFileListKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key != VirtualKey.Enter || _workspace is null || FileList.SelectedItem is not FileRow row)
        {
            return;
        }

        e.Handled = true;
        await _workspace.OpenEntryAsync(new SimpleFile.Ipc.FileEntry
        {
            Name = row.Name,
            Path = row.Path,
            IsDir = row.IsDir,
        });
    }

    private void OnSortName(object sender, RoutedEventArgs e) => _workspace?.SetSort("name");

    private void OnSortSize(object sender, RoutedEventArgs e) => _workspace?.SetSort("size");

    private void OnSortDate(object sender, RoutedEventArgs e) => _workspace?.SetSort("date");

    private void OnSortType(object sender, RoutedEventArgs e) => _workspace?.SetSort("type");

    private async void OnRefreshAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !_editingPath)
        {
            await _workspace.RefreshAsync();
        }
    }

    private async void OnBackAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !_editingPath)
        {
            await _workspace.GoBackAsync();
        }
    }

    private async void OnForwardAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !_editingPath)
        {
            await _workspace.GoForwardAsync();
        }
    }

    private async void OnUpAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (_workspace is not null && !_editingPath)
        {
            await _workspace.GoUpAsync();
        }
    }

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
}
