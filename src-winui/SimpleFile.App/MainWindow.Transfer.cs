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

    private async void OnPrimaryFileDrop(object sender, DragEventArgs e) => await HandleFileDropAsync(e, PaneId.Primary);

    private async void OnSecondaryFileDrop(object sender, DragEventArgs e) => await HandleFileDropAsync(e, PaneId.Secondary);

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
        if (_workspace?.FileOps is null || sources.Length == 0)
        {
            return;
        }

        var action = await ChooseConflictActionAsync(sources, destination);
        if (action is null)
        {
            return;
        }

        try
        {
            var progress = new Progress<ProgressUpdate>(OnTransferProgress);
            if (move)
            {
                var results = await _workspace.FileOps.MoveAsync(
                    sources,
                    destination,
                    action,
                    progress,
                    operationId => StartTransferProgress(operationId, "Moving..."));
                _workspace.Undo.PushMove(results, _workspace.FileOps);
            }
            else
            {
                var results = await _workspace.FileOps.CopyAsync(
                    sources,
                    destination,
                    action,
                    progress,
                    operationId => StartTransferProgress(operationId, "Copying..."));
                _workspace.Undo.PushCopy(results, _workspace.FileOps);
            }

            await _workspace.RefreshAsync();
        }
        catch (IpcException exception)
        {
            ShowMessage(move ? "Move" : "Copy", exception.Message, InfoBarSeverity.Error);
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
        var paths = SelectedPaths;
        if (_workspace is null || paths is null || paths.Length == 0)
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

        try
        {
            await _workspace.PackIntoFolderAsync(paths, input.Text.Trim());
        }
        catch (Exception exception)
        {
            ShowMessage("Pack into folder", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task UnpackSelectedFolderAsync()
    {
        if (_workspace is null || ActiveSelectedRow is not { IsDir: true } row)
        {
            return;
        }

        try
        {
            await _workspace.UnpackFolderAsync(row.Path);
        }
        catch (Exception exception)
        {
            ShowMessage("Unpack folder", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task ExtractSelectedArchiveAsync(string mode)
    {
        if (_workspace?.FileOps is null || ActiveSelectedRow is not { } row || !ArchivePaths.IsArchiveFile(row.Path))
        {
            return;
        }

        try
        {
            var info = await _workspace.FileOps.ListArchiveAsync(row.Path);
            var destination = _workspace.Active.Path;
            if (mode == "ctx-extract-folder")
            {
                destination = PathRules.JoinPath(_workspace.Active.Path, ArchivePaths.ExtractFolderName(row.Name));
            }
            else if (mode == "ctx-extract-to")
            {
                var picked = await PickFolderAsync(_workspace.Active.Path);
                if (picked is null)
                {
                    return;
                }

                destination = picked;
            }

            await _workspace.FileOps.ExtractArchiveAsync(info.Path, destination);
            await _workspace.RefreshAsync();
        }
        catch (Exception exception)
        {
            ShowMessage("Extract archive", exception.Message, InfoBarSeverity.Error);
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
        var selected = ActiveSelectedRows;
        if (_workspace?.FileOps is null || selected.Count == 0)
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

        try
        {
            await _workspace.FileOps.BatchRenameAsync(requests);
            await _workspace.RefreshAsync();
        }
        catch (Exception exception)
        {
            ShowMessage("Advanced rename", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task UndoLastAsync()
    {
        if (_workspace is null || !_workspace.Undo.CanUndo)
        {
            StatusText.Text = "Nothing to undo";
            return;
        }

        try
        {
            await _workspace.Undo.UndoAsync();
            await _workspace.RefreshAsync();
            StatusText.Text = "Undone";
        }
        catch (Exception exception)
        {
            ShowMessage("Undo", exception.Message, InfoBarSeverity.Error);
        }
    }

    private async Task RedoLastAsync()
    {
        if (_workspace is null || !_workspace.Undo.CanRedo)
        {
            StatusText.Text = "Nothing to redo";
            return;
        }

        try
        {
            await _workspace.Undo.RedoAsync();
            await _workspace.RefreshAsync();
            StatusText.Text = "Redone";
        }
        catch (Exception exception)
        {
            ShowMessage("Redo", exception.Message, InfoBarSeverity.Error);
        }
    }

    private void OnSidebarDividerPressed(object sender, PointerRoutedEventArgs e)
    {
        _sidebarDragging = true;
        SidebarDivider.CapturePointer(e.Pointer);
    }

    private void OnSidebarDividerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (!_sidebarDragging)
        {
            return;
        }

        var x = e.GetCurrentPoint(RootGrid).Position.X;
        SidebarColumn.Width = new GridLength(Math.Clamp(x, 150, 600));
    }

    private void OnSidebarDividerReleased(object sender, PointerRoutedEventArgs e)
    {
        _sidebarDragging = false;
        SidebarDivider.ReleasePointerCapture(e.Pointer);
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
