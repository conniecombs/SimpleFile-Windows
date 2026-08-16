namespace SimpleFile.Core;

public enum ContextMenuKind
{
    Item,
    Divider,
}

public sealed class ContextMenuEntry
{
    public ContextMenuKind Kind { get; init; } = ContextMenuKind.Item;
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public string? Shortcut { get; init; }
    public string? IconGlyph { get; init; }
    public bool Disabled { get; init; }
    public bool Hidden { get; init; }
    public IReadOnlyList<ContextMenuEntry> Children { get; init; } = [];
}

public sealed class ContextMenuRequest
{
    public int SelectionCount { get; init; }
    public bool HasClipboard { get; init; }
    public bool DualPaneEnabled { get; init; }
    public bool OtherPaneHasPath { get; init; }
    public bool SelectedIsDirectory { get; init; }
    public bool HasFolderSelection { get; init; }
    public bool AllSelectedAreFiles { get; init; }
    public bool SelectedIsArchive { get; init; }
    public string? ArchiveExtractFolderName { get; init; }
    public bool UseTrash { get; init; } = true;
}

/// <summary>
/// Shared menu IDs and visibility for the WinUI shell.
/// </summary>
public static class ContextMenuBuilder
{
    public static IReadOnlyList<ContextMenuEntry> Build(ContextMenuRequest request)
    {
        var hasOtherPane = request.DualPaneEnabled && request.OtherPaneHasPath;
        var canCompare = request.SelectionCount == 2 && request.AllSelectedAreFiles;
        var canUnpack = request.SelectionCount == 1 && request.SelectedIsDirectory;
        var extractFolder = string.IsNullOrEmpty(request.ArchiveExtractFolderName)
            ? "Extract to Folder"
            : $"Extract to {request.ArchiveExtractFolderName}/";
        var deleteLabel = request.UseTrash ? "Move to trash" : "Delete";

        var entries = new List<ContextMenuEntry>
        {
            Item("ctx-open", "Open", request.SelectionCount != 1, "Enter", "\uE8E5"),
            Item("ctx-open-with", "Open with...", request.SelectionCount != 1 || request.SelectedIsDirectory, null, "\uE8A7"),
            Item("ctx-preview", "Quick Look", request.SelectionCount != 1, "Space", "\uE890"),
            Item("ctx-compare", "Compare files", !canCompare, null, "\uE8AB"),
            Item("ctx-terminal", "Open terminal here", false, "F4", "\uE756"),
            Item("ctx-powershell-admin", "Open PowerShell as administrator", false, null, "\uE7EF"),
            Divider(),
            Item("ctx-color-label", "Set color label...", request.SelectionCount == 0, null, "\uE790"),
            Item("ctx-folder-metrics", "Folder metrics", !request.HasFolderSelection, null, "\uE9D2"),
            Item("ctx-cleanup", "Disk cleanup here...", false, null, "\uE75C"),
            Item("ctx-duplicates", "Find duplicates here...", false, null, "\uE8C8"),
            Divider(),
            Item("ctx-rename", "Rename", request.SelectionCount != 1, "F2", "\uE8AC"),
            Item("ctx-advanced-rename", "Advanced rename...", request.SelectionCount == 0, null, "\uE8AC"),
            Item("ctx-copy", "Copy", request.SelectionCount == 0, "Ctrl+C", "\uE8C8"),
            Item("ctx-cut", "Cut", request.SelectionCount == 0, "Ctrl+X", "\uE8C6"),
            Item("ctx-paste", "Paste", !request.HasClipboard, "Ctrl+V", "\uE77F"),
            Item("ctx-copy-to-pane", "Copy to other pane", request.SelectionCount == 0 || !hasOtherPane, "Ctrl+Alt+C", "\uE8C8"),
            Item("ctx-move-to-pane", "Move to other pane", request.SelectionCount == 0 || !hasOtherPane, "Ctrl+Alt+M", "\uE8B4"),
            Divider(),
            Item("ctx-pack", "Pack into folder...", request.SelectionCount == 0, null, "\uE8B7"),
            Item("ctx-unpack", "Unpack folder here", !canUnpack, null, "\uE8B7"),
            Item("ctx-compress", "Create archive...", request.SelectionCount == 0, null, "\uE8B7"),
            new ContextMenuEntry
            {
                Kind = ContextMenuKind.Item,
                Id = "ctx-extract-menu",
                Label = "Extract",
                Disabled = !request.SelectedIsArchive,
                IconGlyph = "\uE8B7",
                Children =
                [
                    Item("ctx-extract-folder", extractFolder, !request.SelectedIsArchive, null, "\uE8B7"),
                    Item("ctx-extract", "Extract here", !request.SelectedIsArchive, null, "\uE8B7"),
                    Item("ctx-extract-to", "Extract to...", !request.SelectedIsArchive, null, "\uE8B7"),
                ],
            },
            Divider(),
            Item("ctx-delete", deleteLabel, request.SelectionCount == 0, "Delete", "\uE74D"),
            Divider(),
            Item("ctx-info", "Properties", request.SelectionCount != 1, "Alt+Enter", "\uE946"),
        };

        return VisibleEntries(entries);
    }

    public static IReadOnlyList<ContextMenuEntry> BuildPaneMoreMenu(ContextMenuRequest request)
    {
        var hasSelection = request.SelectionCount > 0;
        var singleSelection = request.SelectionCount == 1;
        var deleteLabel = request.UseTrash ? "Move to trash" : "Delete";

        var entries = new List<ContextMenuEntry>
        {
            Item("ctx-close-dual-pane", "Close right pane", !request.DualPaneEnabled, "F6", "\uE711"),
            Divider(),
            Item("ctx-rename", "Rename", !singleSelection, "F2", "\uE8AC"),
            Item("ctx-delete", deleteLabel, !hasSelection, "Delete", "\uE74D"),
            Item("ctx-color-label", "Set color label...", !hasSelection, null, "\uE790"),
            Divider(),
            Item("ctx-view-archive", "View archive contents", !request.SelectedIsArchive, null, "\uE8B7"),
            Item("ctx-extract-to", "Extract archive...", !request.SelectedIsArchive, null, "\uE8B7"),
            Item("ctx-compress", "Create archive...", !hasSelection, null, "\uE8B7"),
            Divider(),
            Item("ctx-folder-metrics", "Folder metrics", !request.HasFolderSelection, null, "\uE9D2"),
            Item("ctx-duplicates", "Find duplicates here...", false, null, "\uE8C8"),
            Item("ctx-cleanup", "Disk cleanup here...", false, null, "\uE75C"),
            Divider(),
            Item("ctx-terminal", "Open terminal here", false, "F4", "\uE756"),
        };

        return VisibleEntries(entries);
    }

    public static IReadOnlyList<ContextMenuEntry> VisibleEntries(IEnumerable<ContextMenuEntry> source)
    {
        var visible = new List<ContextMenuEntry>();
        foreach (var entry in source)
        {
            if (entry.Kind == ContextMenuKind.Divider)
            {
                if (visible.Count > 0 && visible[^1].Kind != ContextMenuKind.Divider)
                {
                    visible.Add(entry);
                }

                continue;
            }

            if (entry.Hidden || entry.Disabled)
            {
                continue;
            }

            if (entry.Children.Count > 0)
            {
                var children = VisibleEntries(entry.Children);
                if (children.Count == 0)
                {
                    continue;
                }

                visible.Add(new ContextMenuEntry
                {
                    Kind = entry.Kind,
                    Id = entry.Id,
                    Label = entry.Label,
                    Shortcut = entry.Shortcut,
                    IconGlyph = entry.IconGlyph,
                    Children = children,
                });
                continue;
            }

            visible.Add(entry);
        }

        while (visible.Count > 0 && visible[^1].Kind == ContextMenuKind.Divider)
        {
            visible.RemoveAt(visible.Count - 1);
        }

        return visible;
    }

    private static ContextMenuEntry Item(
        string id,
        string label,
        bool disabled = false,
        string? shortcut = null,
        string? iconGlyph = null)
    {
        return new ContextMenuEntry
        {
            Kind = ContextMenuKind.Item,
            Id = id,
            Label = label,
            Shortcut = shortcut,
            IconGlyph = iconGlyph,
            Disabled = disabled,
        };
    }

    private static ContextMenuEntry Divider()
    {
        return new ContextMenuEntry { Kind = ContextMenuKind.Divider };
    }
}
