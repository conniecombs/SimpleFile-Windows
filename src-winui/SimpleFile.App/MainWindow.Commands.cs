using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;

namespace SimpleFile.App;

public sealed partial class MainWindow
{
    private bool _commandPaletteOpen;
    private List<AppCommand> _paletteCommands = [];

    private void OnCommandPaletteAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        if (!IsEditingPath && !IsTextInputFocused())
        {
            OpenCommandPalette();
        }
    }

    private void OnFocusPathAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        BeginPathEdit(_workspace?.ActivePane ?? PaneId.Primary);
    }

    private void OnFocusSearchAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        SearchBox.Focus(FocusState.Programmatic);
        SearchBox.SelectAll();
    }

    private void OnSelectAllAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        if (IsEditingPath || IsTextInputFocused())
        {
            return;
        }

        e.Handled = true;
        ActiveFileList.SelectAll();
    }

    private void OnCopyPathAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        var paths = SelectedPaths;
        if (paths is null || paths.Length == 0)
        {
            return;
        }

        var package = new DataPackage();
        package.SetText(string.Join(Environment.NewLine, paths));
        Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
        StatusText.Text = paths.Length == 1 ? "Path copied" : $"{paths.Length} paths copied";
    }

    private async void OnUndoAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await UndoLastAsync();
    }

    private async void OnRedoAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await RedoLastAsync();
    }

    private async void OnKeyboardHelpAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await ShowKeyboardHelpAsync();
    }

    private async void OnCopyToOtherPaneAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await CopyOrMoveToOtherPaneAsync(move: false);
    }

    private async void OnMoveToOtherPaneAccelerator(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs e)
    {
        e.Handled = true;
        await CopyOrMoveToOtherPaneAsync(move: true);
    }

    private void OnQuickFilterChanged(object sender, TextChangedEventArgs e)
    {
        _workspace?.SetFilterQuery(QuickFilterBox.Text);
    }

    private void OnTogglePreview(object sender, RoutedEventArgs e)
    {
        if (_workspace is null)
        {
            return;
        }

        _workspace.Settings.PreviewVisible = !_workspace.Settings.PreviewVisible;
        ApplyPreviewVisibility();
    }

    private void ApplyPreviewVisibility()
    {
        var visible = _workspace?.Settings.PreviewVisible != false;
        PreviewPane.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        PreviewColumn.Width = visible ? new GridLength(320) : new GridLength(0);
        ToolTipService.SetToolTip(PreviewToggleButton, visible ? "Hide preview pane" : "Show preview pane");
    }

    private void ApplyTheme(string? theme)
    {
        var next = UiSettings.NormalizeTheme(theme) switch
        {
            "light" => ElementTheme.Light,
            "dark" => ElementTheme.Dark,
            _ => ElementTheme.Default,
        };
        if (RootGrid.RequestedTheme != next)
        {
            RootGrid.RequestedTheme = next;
        }

        ApplyCaptionButtonColors(next);
    }

    private void OpenCommandPalette()
    {
        _commandPaletteOpen = true;
        CommandPaletteOverlay.Visibility = Visibility.Visible;
        CommandPaletteInput.Text = "";
        RefreshCommandPalette("");
        CommandPaletteInput.Focus(FocusState.Programmatic);
    }

    private void CloseCommandPalette()
    {
        _commandPaletteOpen = false;
        CommandPaletteOverlay.Visibility = Visibility.Collapsed;
    }

    private void RefreshCommandPalette(string query)
    {
        _paletteCommands = [.. AppCommandCatalog.Filter(query)];
        CommandPaletteList.ItemsSource = _paletteCommands;
        if (_paletteCommands.Count > 0)
        {
            CommandPaletteList.SelectedIndex = 0;
        }
    }

    private void OnCommandPaletteTextChanged(object sender, TextChangedEventArgs e)
    {
        RefreshCommandPalette(CommandPaletteInput.Text);
    }

    private async void OnCommandPaletteKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Escape)
        {
            e.Handled = true;
            CloseCommandPalette();
            return;
        }

        if (e.Key == VirtualKey.Down)
        {
            e.Handled = true;
            if (_paletteCommands.Count == 0)
            {
                return;
            }

            CommandPaletteList.SelectedIndex = (CommandPaletteList.SelectedIndex + 1) % _paletteCommands.Count;
            CommandPaletteList.ScrollIntoView(CommandPaletteList.SelectedItem);
            return;
        }

        if (e.Key == VirtualKey.Up)
        {
            e.Handled = true;
            if (_paletteCommands.Count == 0)
            {
                return;
            }

            var next = CommandPaletteList.SelectedIndex - 1;
            CommandPaletteList.SelectedIndex = next < 0 ? _paletteCommands.Count - 1 : next;
            CommandPaletteList.ScrollIntoView(CommandPaletteList.SelectedItem);
            return;
        }

        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            if (CommandPaletteList.SelectedItem is AppCommand command)
            {
                CloseCommandPalette();
                await RunAppCommandAsync(command.Id);
            }
        }
    }

    private async void OnCommandPaletteItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is AppCommand command)
        {
            CloseCommandPalette();
            await RunAppCommandAsync(command.Id);
        }
    }

    private void OnCommandPaletteOverlayPressed(object sender, PointerRoutedEventArgs e)
    {
        CloseCommandPalette();
    }

    private void OnCommandPaletteInnerPressed(object sender, PointerRoutedEventArgs e)
    {
        e.Handled = true;
    }

    private async Task RunAppCommandAsync(string id)
    {
        if (_workspace is null)
        {
            return;
        }

        switch (id)
        {
            case "go-home":
                await _workspace.NavigateSpecialAsync("navigateHome");
                break;
            case "refresh":
                await _workspace.RefreshAsync();
                break;
            case "copy":
                CopyToClipboard();
                break;
            case "cut":
                CutToClipboard();
                break;
            case "paste":
                await PasteFromClipboard();
                break;
            case "clipboard-history":
                StatusText.Text = _workspace.Clipboard.HasItems
                    ? $"{_workspace.Clipboard.Operation}: {string.Join(", ", _workspace.Clipboard.SourcePaths.Select(PathRules.Basename))}"
                    : "Clipboard is empty";
                break;
            case "operation-history":
                await ShowOperationHistoryAsync();
                break;
            case "undo":
                await UndoLastAsync();
                break;
            case "redo":
                await RedoLastAsync();
                break;
            case "delete":
                await TrashSelected();
                break;
            case "rename":
                await PromptAndRename();
                break;
            case "advanced-rename":
                await PromptAdvancedRenameAsync();
                break;
            case "new-folder":
                await PromptAndCreateFolder(_workspace.ActivePane);
                break;
            case "new-file":
                await PromptAndCreateFile(_workspace.ActivePane);
                break;
            case "create-archive":
                OnCreateArchiveClicked(this, new RoutedEventArgs());
                break;
            case "terminal":
                OnOpenTerminalClicked(this, new RoutedEventArgs());
                break;
            case "preview":
                OnTogglePreview(this, new RoutedEventArgs());
                break;
            case "dual-pane":
                await _workspace.ToggleDualPaneAsync();
                break;
            case "search":
                SearchBox.Focus(FocusState.Programmatic);
                break;
            case "quick-look":
                await ShowQuickLookAsync();
                break;
            case "properties":
                await ShowPropertiesAsync();
                break;
            case "color-label":
                OnSetColorLabelClicked(this, new RoutedEventArgs());
                break;
            case "folder-metrics":
                await ShowFolderMetricsAsync();
                break;
            case "disk-cleanup":
                OnDiskCleanupClicked(this, new RoutedEventArgs());
                break;
            case "duplicate-checker":
                OnDuplicateCheckerClicked(this, new RoutedEventArgs());
                break;
            case "settings":
                OnSettingsClicked(this, new RoutedEventArgs());
                break;
            case "keyboard-help":
                await ShowKeyboardHelpAsync();
                break;
            case "git-pull":
                await RunGitAsync(pull: true);
                break;
            case "git-push":
                await RunGitAsync(pull: false);
                break;
        }
    }

    private void OnFileRowContextRequested(object sender, ContextRequestedEventArgs e)
    {
        if (sender is not FileRowView view || view.Row is null || _workspace is null)
        {
            return;
        }

        var list = FindAncestor<ListView>(view);
        if (list is null)
        {
            return;
        }

        _workspace.ActivatePane(ReferenceEquals(list, SecondaryFileList) ? PaneId.Secondary : PaneId.Primary);

        var row = view.Row;
        if (!list.SelectedItems.OfType<FileRow>().Any(selected =>
                string.Equals(selected.Path, row.Path, StringComparison.OrdinalIgnoreCase)))
        {
            list.SelectedItems.Clear();
            list.SelectedItem = row;
        }

        if (list.ContextFlyout is not MenuFlyout flyout)
        {
            return;
        }

        PopulateFileListContextFlyout(flyout);
        if (e.TryGetPosition(list, out var point))
        {
            flyout.ShowAt(list, new FlyoutShowOptions { Position = point });
        }
        else
        {
            flyout.ShowAt(view);
        }

        e.Handled = true;
    }

    private static T? FindAncestor<T>(DependencyObject start) where T : class
    {
        var current = VisualTreeHelper.GetParent(start);
        while (current is not null)
        {
            if (current is T match)
            {
                return match;
            }

            current = VisualTreeHelper.GetParent(current);
        }

        return null;
    }

    private void OnFileListContextOpening(object sender, object e)
    {
        if (sender is MenuFlyout flyout)
        {
            PopulateFileListContextFlyout(flyout);
        }
    }

    private void PopulateFileListContextFlyout(MenuFlyout flyout)
    {
        if (_workspace is null)
        {
            return;
        }

        var selected = ActiveSelectedRows;
        var request = new ContextMenuRequest
        {
            SelectionCount = selected.Count,
            HasClipboard = _workspace.Clipboard.HasItems,
            DualPaneEnabled = _workspace.DualPaneEnabled,
            OtherPaneHasPath = _workspace.OtherPanePath() is not null,
            SelectedIsDirectory = selected.Count == 1 && selected[0].IsDir,
            HasFolderSelection = selected.Any(row => row.IsDir),
            AllSelectedAreFiles = selected.Count > 0 && selected.All(row => !row.IsDir),
            SelectedIsArchive = selected.Count == 1 && !selected[0].IsDir && ArchivePaths.IsArchiveFile(selected[0].Path),
            ArchiveExtractFolderName = selected.Count == 1 ? ArchivePaths.ExtractFolderName(selected[0].Name) : null,
        };

        flyout.Items.Clear();
        foreach (var entry in ContextMenuBuilder.Build(request))
        {
            flyout.Items.Add(CreateMenuEntry(entry));
        }
    }

    private MenuFlyoutItemBase CreateMenuEntry(ContextMenuEntry entry)
    {
        if (entry.Kind == ContextMenuKind.Divider)
        {
            return new MenuFlyoutSeparator();
        }

        if (entry.Children.Count > 0)
        {
            var sub = new MenuFlyoutSubItem { Text = entry.Label, Tag = entry.Id };
            foreach (var child in entry.Children)
            {
                sub.Items.Add(CreateMenuEntry(child));
            }

            return sub;
        }

        var item = new MenuFlyoutItem
        {
            Text = entry.Label,
            Tag = entry.Id,
            Name = entry.Id,
        };
        item.Click += OnContextMenuItemClick;
        return item;
    }

    private async void OnContextMenuItemClick(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuFlyoutItem item || item.Tag is not string id)
        {
            return;
        }

        await RunContextCommandAsync(id);
    }

    private async Task RunContextCommandAsync(string id)
    {
        switch (id)
        {
            case "ctx-open":
                await OpenSelectedFile(ActiveFileList, _workspace?.ActivePane ?? PaneId.Primary);
                break;
            case "ctx-open-with":
                OnPreviewOpenWithClick(this, new RoutedEventArgs());
                break;
            case "ctx-preview":
                await ShowQuickLookAsync();
                break;
            case "ctx-compare":
                OnPreviewCompareClick(this, new RoutedEventArgs());
                break;
            case "ctx-terminal":
                OnOpenTerminalClicked(this, new RoutedEventArgs());
                break;
            case "ctx-powershell-admin":
                await OpenPowershellAdminAsync();
                break;
            case "ctx-color-label":
                OnSetColorLabelClicked(this, new RoutedEventArgs());
                break;
            case "ctx-folder-metrics":
                await ShowFolderMetricsAsync();
                break;
            case "ctx-cleanup":
                OnDiskCleanupClicked(this, new RoutedEventArgs());
                break;
            case "ctx-duplicates":
                OnDuplicateCheckerClicked(this, new RoutedEventArgs());
                break;
            case "ctx-rename":
                await PromptAndRename();
                break;
            case "ctx-advanced-rename":
                await PromptAdvancedRenameAsync();
                break;
            case "ctx-copy":
                CopyToClipboard();
                break;
            case "ctx-cut":
                CutToClipboard();
                break;
            case "ctx-paste":
                await PasteFromClipboard();
                break;
            case "ctx-copy-to-pane":
                await CopyOrMoveToOtherPaneAsync(move: false);
                break;
            case "ctx-move-to-pane":
                await CopyOrMoveToOtherPaneAsync(move: true);
                break;
            case "ctx-pack":
                await PromptPackIntoFolderAsync();
                break;
            case "ctx-unpack":
                await UnpackSelectedFolderAsync();
                break;
            case "ctx-compress":
                OnCreateArchiveClicked(this, new RoutedEventArgs());
                break;
            case "ctx-extract":
            case "ctx-extract-folder":
            case "ctx-extract-to":
                await ExtractSelectedArchiveAsync(id);
                break;
            case "ctx-delete":
                await TrashSelected();
                break;
            case "ctx-info":
                await ShowPropertiesAsync();
                break;
        }
    }

    private async void OnRootPreviewKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (_workspace is null)
        {
            return;
        }

        if (e.Key == VirtualKey.Escape)
        {
            if (_commandPaletteOpen)
            {
                e.Handled = true;
                CloseCommandPalette();
                return;
            }

            if (IsEditingPath)
            {
                e.Handled = true;
                EndPathEdit(_editingSecondaryPath ? PaneId.Secondary : PaneId.Primary, reset: true);
                return;
            }

            if (FileProgressPanel.Visibility == Visibility.Visible)
            {
                e.Handled = true;
                FileProgressPanel.Visibility = Visibility.Collapsed;
                return;
            }

            if (_searchMode)
            {
                e.Handled = true;
                await CancelActiveSearchAsync();
                ClearSearchState();
                SyncFromWorkspace();
                return;
            }

            if (!string.IsNullOrEmpty(QuickFilterBox.Text))
            {
                e.Handled = true;
                QuickFilterBox.Text = "";
                return;
            }

            if (ActiveFileList.SelectedItems.Count > 0)
            {
                e.Handled = true;
                ActiveFileList.SelectedItems.Clear();
                _workspace.SelectPath(null);
            }

            return;
        }

        if (IsEditingPath || IsTextInputFocused())
        {
            return;
        }

        if (e.Key == VirtualKey.Tab && _workspace.DualPaneEnabled)
        {
            e.Handled = true;
            _workspace.SwitchActivePane();
            return;
        }

        if (e.Key == VirtualKey.Back)
        {
            e.Handled = true;
            await _workspace.GoUpAsync();
            return;
        }

        if (e.Key == VirtualKey.Space)
        {
            e.Handled = true;
            await ShowQuickLookAsync();
        }
    }

    private bool IsTextInputFocused()
    {
        return FocusManager.GetFocusedElement(Content.XamlRoot) is TextBox;
    }

    private async Task ShowKeyboardHelpAsync()
    {
        var lines = KeyboardShortcutMap.Defaults.Select(item => $"{item.Keys,-22}  {item.Label}");
        var box = new TextBox
        {
            Text = string.Join(Environment.NewLine, lines),
            IsReadOnly = true,
            AcceptsReturn = true,
            FontFamily = new Microsoft.UI.Xaml.Media.FontFamily("Consolas"),
            FontSize = 12,
            MinWidth = 420,
            MaxHeight = 360,
        };
        var dialog = new ContentDialog
        {
            Title = "Keyboard shortcuts",
            Content = box,
            CloseButtonText = "Close",
            XamlRoot = Content.XamlRoot,
        };
        await dialog.ShowAsync();
    }

    private async Task ShowQuickLookAsync()
    {
        if (ActiveSelectedRow is not { } row)
        {
            return;
        }

        var body = new StackPanel { Spacing = 8, Width = 480 };
        body.Children.Add(new TextBlock { Text = row.Name, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        body.Children.Add(new TextBlock { Text = row.Path, TextWrapping = TextWrapping.Wrap, Opacity = 0.8 });
        body.Children.Add(new TextBlock { Text = $"{row.TypeText}  {row.SizeText}  {row.ModifiedText}" });
        if (_workspace?.FileOps is not null && !row.IsDir)
        {
            try
            {
                var preview = await _workspace.FileOps.ReadFilePreviewAsync(row.Path, 80_000);
                if (preview.FileType == "text" && preview.Content is not null)
                {
                    body.Children.Add(new TextBox
                    {
                        Text = preview.Content,
                        IsReadOnly = true,
                        AcceptsReturn = true,
                        FontFamily = new Microsoft.UI.Xaml.Media.FontFamily("Consolas"),
                        FontSize = 12,
                        MaxHeight = 280,
                    });
                }
                else
                {
                    body.Children.Add(new TextBlock { Text = preview.Content is null ? "No inline preview." : preview.FileType });
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                body.Children.Add(new TextBlock { Text = exception.Message });
            }
        }

        var dialog = new ContentDialog
        {
            Title = "Quick Look",
            Content = body,
            CloseButtonText = "Close",
            XamlRoot = Content.XamlRoot,
        };
        await dialog.ShowAsync();
    }

    private async Task ShowPropertiesAsync()
    {
        if (_workspace?.FileOps is null || ActiveSelectedRow is not { } row)
        {
            return;
        }

        var lines = new List<string>
        {
            $"Name: {row.Name}",
            $"Path: {row.Path}",
            $"Type: {row.TypeText}",
            $"Size: {row.SizeText}",
            $"Modified: {row.ModifiedText}",
        };
        try
        {
            var info = await _workspace.FileOps.GetEntryInfoAsync(row.Path);
            lines.Add($"Directory: {info.IsDir}");
            if (!string.IsNullOrEmpty(info.Permissions))
            {
                lines.Add($"Permissions: {info.Permissions}");
            }

            if (!string.IsNullOrEmpty(info.SymlinkTarget))
            {
                lines.Add($"Link: {info.SymlinkTarget}");
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            lines.Add(exception.Message);
        }

        var dialog = new ContentDialog
        {
            Title = "Properties",
            Content = new TextBlock { Text = string.Join(Environment.NewLine, lines), TextWrapping = TextWrapping.Wrap, Width = 420 },
            CloseButtonText = "Close",
            XamlRoot = Content.XamlRoot,
        };
        await dialog.ShowAsync();
    }

    private async Task ShowFolderMetricsAsync()
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        var folder = ActiveSelectedRows.FirstOrDefault(row => row.IsDir);
        var path = folder?.Path ?? _workspace.Active.Path;
        try
        {
            var size = await _workspace.FileOps.CalculateFolderSizeAsync(path);
            var count = await _workspace.FileOps.CountFolderItemsAsync(path);
            var dialog = new ContentDialog
            {
                Title = "Folder metrics",
                Content = $"{path}{Environment.NewLine}{EntryPresentation.FormatFileSize(size)} · {count} item(s)",
                CloseButtonText = "Close",
                XamlRoot = Content.XamlRoot,
            };
            await dialog.ShowAsync();
        }
        catch (Exception exception)
        {
            ShowMessage("Folder metrics", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task ShowOperationHistoryAsync()
    {
        var history = _workspace?.Undo.History ?? [];
        var text = history.Count == 0
            ? "No completed operations in this session."
            : string.Join(Environment.NewLine, history.Reverse());
        var dialog = new ContentDialog
        {
            Title = "Operation history",
            Content = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, Width = 420 },
            CloseButtonText = "Close",
            XamlRoot = Content.XamlRoot,
        };
        await dialog.ShowAsync();
    }

    private async Task RunGitAsync(bool pull)
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        try
        {
            if (pull)
            {
                await _workspace.FileOps.GitPullAsync(_workspace.Active.Path);
                ShowMessage("Git", "Pull completed.", InfoBarSeverity.Success);
            }
            else
            {
                await _workspace.FileOps.GitPushAsync(_workspace.Active.Path);
                ShowMessage("Git", "Push completed.", InfoBarSeverity.Success);
            }
        }
        catch (Exception exception)
        {
            ShowMessage(pull ? "Git pull" : "Git push", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task OpenPowershellAdminAsync()
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        try
        {
            await _workspace.FileOps.OpenPowershellAdminAsync(_workspace.Active.Path);
        }
        catch (Exception exception)
        {
            ShowMessage("PowerShell", exception.Message, InfoBarSeverity.Error);
        }
    }
}
