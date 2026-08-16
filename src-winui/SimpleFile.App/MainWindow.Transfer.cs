using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using Windows.Storage.Pickers;

namespace SimpleFile.App;

public sealed partial class MainWindow
{
    private const string InternalDragFormat = "simplefile-internal";
    private string[] _dragPaths = [];
    private bool _sidebarDragging;
    private bool _columnDragging;
    private string? _columnDragId;
    private double _columnDragStartX;
    private double _columnDragStartWidth;

    private void OnFileDragItemsStarting(object sender, DragItemsStartingEventArgs e)
    {
        _dragPaths = e.Items.OfType<FileRow>().Select(row => row.Path).ToArray();
        e.Data.SetText($"{InternalDragFormat}|{string.Join('\n', _dragPaths)}");
        e.Data.RequestedOperation = DataPackageOperation.Copy | DataPackageOperation.Move;
    }

    private void OnPrimaryFileDragOver(object sender, DragEventArgs e) => HandleFileDragOver(e, PaneId.Primary);

    private void OnSecondaryFileDragOver(object sender, DragEventArgs e) => HandleFileDragOver(e, PaneId.Secondary);

    private void OnFileDragLeave(object sender, DragEventArgs e)
    {
        e.AcceptedOperation = DataPackageOperation.None;
    }

    private async void OnPrimaryFileDrop(object sender, DragEventArgs e) =>
        await RunUiActionAsync("Drop files", () => HandleFileDropAsync(e, PaneId.Primary));

    private async void OnSecondaryFileDrop(object sender, DragEventArgs e) =>
        await RunUiActionAsync("Drop files", () => HandleFileDropAsync(e, PaneId.Secondary));

    private void HandleFileDragOver(DragEventArgs e, PaneId pane)
    {
        if (_workspace is null)
        {
            return;
        }

        _workspace.ActivatePane(pane);
        var hovered = HoveredFileRow(e, pane);
        var target = DropDestination.Resolve(_workspace.Pane(pane).Path, hovered?.Path, hovered?.IsDir == true);
        var sources = _dragPaths.Length > 0 ? _dragPaths : [];
        var valid = sources.Length == 0 || DropDestination.IsValidDrop(sources, target.Destination);
        var copy = (e.Modifiers & Windows.ApplicationModel.DataTransfer.DragDrop.DragDropModifiers.Control) != 0
            || sources.Length == 0;
        e.AcceptedOperation = valid
            ? (copy ? DataPackageOperation.Copy : DataPackageOperation.Move)
            : DataPackageOperation.None;
        e.DragUIOverride.Caption = $"{(copy ? "Copy" : "Move")} to {target.Destination}";
        e.Handled = true;
    }

    private async Task HandleFileDropAsync(DragEventArgs e, PaneId pane)
    {
        if (_workspace?.FileOps is null)
        {
            return;
        }

        _workspace.ActivatePane(pane);
        var hovered = HoveredFileRow(e, pane);
        var target = DropDestination.Resolve(_workspace.Pane(pane).Path, hovered?.Path, hovered?.IsDir == true);
        var sources = await ReadDroppedPathsAsync(e);
        if (sources.Count == 0 || !DropDestination.IsValidDrop(sources, target.Destination))
        {
            return;
        }

        var internalDrag = _dragPaths.Length > 0;
        var move = internalDrag
            && (e.Modifiers & Windows.ApplicationModel.DataTransfer.DragDrop.DragDropModifiers.Control) == 0;
        await TransferWithConflictAsync(sources.ToArray(), target.Destination, move);
        _dragPaths = [];
    }

    private FileRow? HoveredFileRow(DragEventArgs e, PaneId pane)
    {
        var list = pane == PaneId.Secondary ? SecondaryFileList : PrimaryFileList;
        var rows = pane == PaneId.Secondary ? SecondaryFiles : PrimaryFiles;
        var point = e.GetPosition(list);
        foreach (var row in rows)
        {
            if (list.ContainerFromItem(row) is not ListViewItem container)
            {
                continue;
            }

            var bounds = container.TransformToVisual(list)
                .TransformBounds(new Windows.Foundation.Rect(0, 0, container.ActualWidth, container.ActualHeight));
            if (bounds.Contains(point))
            {
                return row;
            }
        }

        return null;
    }

    private async Task<List<string>> ReadDroppedPathsAsync(DragEventArgs e)
    {
        if (_dragPaths.Length > 0)
        {
            return [.. _dragPaths];
        }

        if (!e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            if (e.DataView.Contains(StandardDataFormats.Text))
            {
                var text = await e.DataView.GetTextAsync();
                if (text.StartsWith(InternalDragFormat, StringComparison.Ordinal))
                {
                    return text.Split('\n').Skip(1).Where(path => path.Length > 0).ToList();
                }
            }

            return [];
        }

        var items = await e.DataView.GetStorageItemsAsync();
        return items.Select(item => item.Path).Where(path => !string.IsNullOrWhiteSpace(path)).ToList();
    }

    private async Task TransferWithConflictAsync(string[] sources, string destination, bool move)
    {
        var workspace = _workspace;
        var fileOps = workspace?.FileOps;
        if (workspace is null || fileOps is null || sources.Length == 0)
        {
            return;
        }

        var action = await ChooseConflictActionAsync(sources, destination);
        if (action is null)
        {
            return;
        }

        using var transferCts = new CancellationTokenSource();
        _transferCts = transferCts;
        try
        {
            var progress = new Progress<ProgressUpdate>(OnTransferProgress);
            if (move)
            {
                var results = await fileOps.MoveAsync(
                    sources,
                    destination,
                    action,
                    progress,
                    operationId => StartTransferProgress(operationId, "Moving..."),
                    transferCts.Token);
                if (ReferenceEquals(_workspace, workspace) && !transferCts.IsCancellationRequested)
                {
                    workspace.Undo.PushMove(results, fileOps);
                }
            }
            else
            {
                var results = await fileOps.CopyAsync(
                    sources,
                    destination,
                    action,
                    progress,
                    operationId => StartTransferProgress(operationId, "Copying..."),
                    transferCts.Token);
                if (ReferenceEquals(_workspace, workspace) && !transferCts.IsCancellationRequested)
                {
                    workspace.Undo.PushCopy(results, fileOps);
                }
            }

            if (ReferenceEquals(_workspace, workspace) && !transferCts.IsCancellationRequested)
            {
                await workspace.RefreshAsync(transferCts.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage(move ? "Move" : "Copy", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            if (ReferenceEquals(_transferCts, transferCts))
            {
                _transferCts = null;
            }
        }
    }

    private async Task<string?> ChooseConflictActionAsync(string[] sources, string destination)
    {
        if (_workspace is null)
        {
            return null;
        }

        try
        {
            var listing = await _workspace.FileOps!.GetEntryInfoAsync(destination);
            _ = listing;
        }
        catch
        {
            // Destination probe uses the current pane listing when available.
        }

        var names = _workspace.Pane(_workspace.ActivePane).Entries.Select(entry => entry.Name).ToList();
        if (PathRules.PathsEqual(_workspace.Active.Path, destination) is false)
        {
            names = [];
        }

        var conflicts = DropDestination.ConflictingNames(sources, names);
        if (conflicts.Count == 0)
        {
            return "keep-both";
        }

        var dialog = new ConflictDialog { XamlRoot = Content.XamlRoot };
        dialog.SetConflictPath(PathRules.JoinPath(destination, conflicts[0]));
        var result = await dialog.ShowAsync();
        if (dialog.Result == ConflictResolution.KeepBoth)
        {
            return "keep-both";
        }

        return result switch
        {
            ContentDialogResult.Primary => "replace",
            ContentDialogResult.Secondary => "skip",
            _ => null,
        };
    }

    private async Task CopyOrMoveToOtherPaneAsync(bool move)
    {
        var paths = SelectedPaths;
        if (_workspace is null || paths is null || paths.Length == 0)
        {
            return;
        }

        var destination = _workspace.OtherPanePath();
        if (destination is null)
        {
            ShowMessage("Dual pane", "Enable dual pane to copy or move to the other pane.", InfoBarSeverity.Informational);
            return;
        }

        await TransferWithConflictAsync(paths, destination, move);
        await _workspace.NavigatePaneAsync(_workspace.OtherPane().Id, destination, HistoryMode.None, activate: false);
    }

    private async Task PromptPackIntoFolderAsync()
    {
        var workspace = _workspace;
        var paths = SelectedPaths;
        if (workspace is null || paths is null || paths.Length == 0)
        {
            return;
        }

        var input = new TextBox { PlaceholderText = "Folder name" };
        var dialog = new ContentDialog
        {
            Title = "Pack into Folder",
            Content = input,
            PrimaryButtonText = "Pack",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary || string.IsNullOrWhiteSpace(input.Text))
        {
            return;
        }
        if (!ReferenceEquals(_workspace, workspace))
        {
            return;
        }

        var utilityCts = BeginUtilityOperation();
        try
        {
            await workspace.PackIntoFolderAsync(paths, input.Text.Trim(), utilityCts.Token);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Pack into folder", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishUtilityOperation(utilityCts);
        }
    }

    private async Task UnpackSelectedFolderAsync()
    {
        var workspace = _workspace;
        if (workspace is null || ActiveSelectedRow is not { IsDir: true } row)
        {
            return;
        }

        var utilityCts = BeginUtilityOperation();
        try
        {
            await workspace.UnpackFolderAsync(row.Path, utilityCts.Token);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Unpack folder", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishUtilityOperation(utilityCts);
        }
    }

    private async Task ExtractSelectedArchiveAsync(string mode)
    {
        var workspace = _workspace;
        var fileOps = workspace?.FileOps;
        if (workspace is null || fileOps is null || ActiveSelectedRow is not { } row || !ArchivePaths.IsArchiveFile(row.Path))
        {
            return;
        }

        var archiveCts = BeginArchiveOperation();
        try
        {
            var info = await fileOps.ListArchiveAsync(row.Path, archiveCts.Token);
            if (!ReferenceEquals(_workspace, workspace) || archiveCts.IsCancellationRequested)
            {
                return;
            }

            var destination = workspace.Active.Path;
            if (mode == "ctx-extract-folder")
            {
                destination = PathRules.JoinPath(workspace.Active.Path, ArchivePaths.ExtractFolderName(row.Name));
            }
            else if (mode == "ctx-extract-to")
            {
                var picked = await PickFolderAsync(workspace.Active.Path);
                if (picked is null
                    || !ReferenceEquals(_workspace, workspace)
                    || archiveCts.IsCancellationRequested)
                {
                    return;
                }

                destination = picked;
            }

            await fileOps.ExtractArchiveAsync(info.Path, destination, archiveCts.Token);
            if (ReferenceEquals(_workspace, workspace) && !archiveCts.IsCancellationRequested)
            {
                await workspace.RefreshAsync(archiveCts.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Extract archive", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishArchiveOperation(archiveCts);
        }
    }

    private async Task<string?> PickFolderAsync(string? defaultPath)
    {
        var picker = new FolderPicker();
        picker.FileTypeFilter.Add("*");
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
        if (!string.IsNullOrWhiteSpace(defaultPath))
        {
            picker.SuggestedStartLocation = PickerLocationId.ComputerFolder;
        }

        var folder = await picker.PickSingleFolderAsync();
        return folder?.Path;
    }

    private async Task PromptAdvancedRenameAsync()
    {
        var workspace = _workspace;
        var fileOps = workspace?.FileOps;
        var selected = ActiveSelectedRows;
        if (workspace is null || fileOps is null || selected.Count == 0)
        {
            return;
        }

        var prefix = new TextBox { Header = "Prefix", PlaceholderText = "optional" };
        var suffix = new TextBox { Header = "Suffix", PlaceholderText = "optional" };
        var start = new NumberBox { Header = "Start number (0 = off)", Value = 0, Minimum = 0, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Inline };
        var body = new StackPanel { Spacing = 8, Children = { prefix, suffix, start } };
        var dialog = new ContentDialog
        {
            Title = "Advanced Rename",
            Content = body,
            PrimaryButtonText = "Rename",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = Content.XamlRoot,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary)
        {
            return;
        }
        if (!ReferenceEquals(_workspace, workspace))
        {
            return;
        }

        var number = (int)start.Value;
        var useNumber = number > 0;
        var requests = selected.Select((row, index) =>
        {
            var ext = Path.GetExtension(row.Name);
            var stem = Path.GetFileNameWithoutExtension(row.Name);
            var next = $"{prefix.Text}{stem}{suffix.Text}";
            if (useNumber)
            {
                next = $"{prefix.Text}{stem}{suffix.Text}{number + index}";
            }

            return new RenameRequest { Path = row.Path, NewName = next + ext };
        }).ToArray();

        var utilityCts = BeginUtilityOperation();
        try
        {
            await fileOps.BatchRenameAsync(requests, utilityCts.Token);
            if (ReferenceEquals(_workspace, workspace) && !utilityCts.IsCancellationRequested)
            {
                await workspace.RefreshAsync(utilityCts.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Advanced rename", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishUtilityOperation(utilityCts);
        }
    }

    private async Task UndoLastAsync()
    {
        var workspace = _workspace;
        if (workspace is null || !workspace.Undo.CanUndo)
        {
            StatusText.Text = "Nothing to undo";
            return;
        }

        var utilityCts = BeginUtilityOperation();
        try
        {
            await workspace.Undo.UndoAsync(utilityCts.Token);
            if (ReferenceEquals(_workspace, workspace) && !utilityCts.IsCancellationRequested)
            {
                await workspace.RefreshAsync(utilityCts.Token);
                StatusText.Text = "Undone";
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Undo", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishUtilityOperation(utilityCts);
        }
    }

    private async Task RedoLastAsync()
    {
        var workspace = _workspace;
        if (workspace is null || !workspace.Undo.CanRedo)
        {
            StatusText.Text = "Nothing to redo";
            return;
        }

        var utilityCts = BeginUtilityOperation();
        try
        {
            await workspace.Undo.RedoAsync(utilityCts.Token);
            if (ReferenceEquals(_workspace, workspace) && !utilityCts.IsCancellationRequested)
            {
                await workspace.RefreshAsync(utilityCts.Token);
                StatusText.Text = "Redone";
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            ShowMessage("Redo", exception.Message, InfoBarSeverity.Error);
        }
        finally
        {
            FinishUtilityOperation(utilityCts);
        }
    }

    private void OnSidebarDividerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (_workspace?.Settings.SidebarVisible != true)
        {
            return;
        }

        _sidebarDragging = true;
        SidebarDivider.CapturePointer(e.Pointer);
        e.Handled = true;
    }

    private void OnSidebarDividerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_sidebarDragging || _workspace is null)
        {
            return;
        }

        _workspace.Settings.SidebarWidth = UiSettings.NormalizeSidebarWidth(e.GetCurrentPoint(RootGrid).Position.X);
        ApplySidebarLayout();
        e.Handled = true;
    }

    private async void OnSidebarDividerReleased(object sender, PointerRoutedEventArgs e)
    {
        var wasDragging = _sidebarDragging;
        _sidebarDragging = false;
        SidebarDivider.ReleasePointerCapture(e.Pointer);
        e.Handled = true;
        if (wasDragging && _workspace is not null)
        {
            await RunUiActionAsync("Resize side menu", () => _workspace.SaveUiSettingsAsync());
        }
    }

    private void OnColumnThumbPressed(object sender, PointerRoutedEventArgs e)
    {
        if (sender is not FrameworkElement element || element.Tag is not string id)
        {
            return;
        }

        _columnDragging = true;
        _columnDragId = id;
        _columnDragStartX = e.GetCurrentPoint(RootGrid).Position.X;
        _columnDragStartWidth = ColumnLayoutHost.Shared.WidthOf(_columnDragId);
        element.CapturePointer(e.Pointer);
    }

    private void OnColumnThumbMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_columnDragging || _columnDragId is null)
        {
            return;
        }

        var delta = e.GetCurrentPoint(RootGrid).Position.X - _columnDragStartX;
        var columns = _workspace?.Columns ?? ColumnLayoutHost.Shared;
        columns.Resize(_columnDragId, _columnDragStartWidth + delta);
        ApplyColumnWidths();
    }

    private void OnColumnThumbReleased(object sender, PointerRoutedEventArgs e)
    {
        _columnDragging = false;
        _columnDragId = null;
        if (sender is FrameworkElement element)
        {
            element.ReleasePointerCapture(e.Pointer);
        }
    }

    private void ApplyColumnWidths()
    {
        var columns = _workspace?.Columns ?? ColumnLayoutHost.Shared;
        ApplyColumnHeader(PrimaryColumnHeader, columns, ref _primaryColumnHeaderKey);
        ApplyColumnHeader(SecondaryColumnHeader, columns, ref _secondaryColumnHeaderKey);
    }
}
