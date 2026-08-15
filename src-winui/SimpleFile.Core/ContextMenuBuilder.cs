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
}

/// <summary>
/// Context-menu IDs and visibility match
/// frontend/src/lib/components/context-menus/ContextMenu.svelte.
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

        var entries = new List<ContextMenuEntry>
        {
            Item("ctx-open", "Open", request.SelectionCount != 1),
            Item("ctx-open-with", "Open With...", request.SelectionCount != 1 || request.SelectedIsDirectory),
            Item("ctx-preview", "Quick Look", request.SelectionCount != 1),
            Item("ctx-compare", "Compare Files", !canCompare),
            Item("ctx-terminal", "Open Terminal Here"),
            Item("ctx-powershell-admin", "Open PowerShell as Administrator"),
            Divider(),
            Item("ctx-color-label", "Color Label...", request.SelectionCount == 0),
            Item("ctx-folder-metrics", "Calculate Folder Metrics", !request.HasFolderSelection),
            Item("ctx-cleanup", "Analyze Cleanup Here"),
            Item("ctx-duplicates", "Find Duplicates Here"),
            Divider(),
            Item("ctx-rename", "Rename", request.SelectionCount != 1),
            Item("ctx-advanced-rename", "Advanced Rename...", request.SelectionCount == 0),
            Item("ctx-copy", "Copy", request.SelectionCount == 0),
            Item("ctx-cut", "Cut", request.SelectionCount == 0),
            Item("ctx-paste", "Paste", !request.HasClipboard),
            Item("ctx-copy-to-pane", "Copy to Other Pane", request.SelectionCount == 0 || !hasOtherPane),
            Item("ctx-move-to-pane", "Move to Other Pane", request.SelectionCount == 0 || !hasOtherPane),
            Divider(),
            Item("ctx-pack", "Pack into Folder...", request.SelectionCount == 0),
            Item("ctx-unpack", "Unpack Folder Here", !canUnpack),
            Item("ctx-compress", "Compress...", request.SelectionCount == 0),
            new ContextMenuEntry
            {
                Kind = ContextMenuKind.Item,
                Id = "ctx-extract-menu",
                Label = "Extract",
                Disabled = !request.SelectedIsArchive,
                Children =
                [
                    Item("ctx-extract-folder", extractFolder, !request.SelectedIsArchive),
                    Item("ctx-extract", "Extract Here", !request.SelectedIsArchive),
                    Item("ctx-extract-to", "Extract To...", !request.SelectedIsArchive),
                ],
            },
            Divider(),
            Item("ctx-delete", "Delete", request.SelectionCount == 0),
            Divider(),
            Item("ctx-info", "Properties", request.SelectionCount != 1),
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

    private static ContextMenuEntry Item(string id, string label, bool disabled = false)
    {
        return new ContextMenuEntry
        {
            Kind = ContextMenuKind.Item,
            Id = id,
            Label = label,
            Disabled = disabled,
        };
    }

    private static ContextMenuEntry Divider()
    {
        return new ContextMenuEntry { Kind = ContextMenuKind.Divider };
    }
}
