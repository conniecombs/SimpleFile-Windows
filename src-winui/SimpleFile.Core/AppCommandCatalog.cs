namespace SimpleFile.Core;

public sealed class AppCommand
{
    public AppCommand(string id, string label, string group, string? shortcut = null)
    {
        Id = id;
        Label = label;
        Group = group;
        Shortcut = shortcut;
    }

    public string Id { get; }
    public string Label { get; }
    public string Group { get; }
    public string? Shortcut { get; }
}

/// <summary>
/// Command-palette catalog. IDs match
/// frontend/src/lib/components/layout-shell/CommandPalette.svelte.
/// </summary>
public static class AppCommandCatalog
{
    public static readonly IReadOnlyList<AppCommand> All =
    [
        new("go-home", "Go Home", "Navigation", "Alt+Home"),
        new("refresh", "Refresh", "Navigation", "F5"),
        new("copy", "Copy", "Clipboard", "Ctrl+C"),
        new("cut", "Cut", "Clipboard", "Ctrl+X"),
        new("paste", "Paste", "Clipboard", "Ctrl+V"),
        new("clipboard-history", "Clipboard History", "Clipboard", "Ctrl+Shift+V"),
        new("operation-history", "Operation History", "History"),
        new("undo", "Undo", "History", "Ctrl+Z"),
        new("redo", "Redo", "History", "Ctrl+Y"),
        new("delete", "Delete", "File", "Delete"),
        new("rename", "Rename", "File", "F2"),
        new("advanced-rename", "Advanced Rename", "File"),
        new("new-folder", "New Folder", "File", "Ctrl+Shift+N"),
        new("new-file", "New File", "File", "Ctrl+N"),
        new("create-archive", "Create Archive", "Archive"),
        new("terminal", "Open Terminal", "Tools", "F4"),
        new("preview", "Toggle Preview Pane", "View"),
        new("dual-pane", "Toggle Dual Pane", "View", "F6"),
        new("search", "Focus Search", "Search", "Ctrl+F"),
        new("quick-look", "Quick Look", "Inspection", "Space"),
        new("properties", "Properties", "Inspection"),
        new("color-label", "Set Color Label", "Organization"),
        new("folder-metrics", "Calculate Folder Metrics", "Tools"),
        new("disk-cleanup", "Analyze Cleanup", "Tools"),
        new("duplicate-checker", "Duplicate Checker", "Tools"),
        new("settings", "Settings", "App", "Ctrl+Shift+S"),
        new("keyboard-help", "Keyboard Shortcuts", "App", "F1"),
        new("git-pull", "Git: Pull (Current Directory)", "Git"),
        new("git-push", "Git: Push (Current Directory)", "Git"),
    ];

    public static IReadOnlyList<AppCommand> Filter(string? query)
    {
        var needle = (query ?? "").Trim();
        if (needle.Length == 0)
        {
            return All;
        }

        return All
            .Where(command =>
                command.Label.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || command.Id.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || command.Group.Contains(needle, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    public static AppCommand? Find(string id)
    {
        return All.FirstOrDefault(command => string.Equals(command.Id, id, StringComparison.Ordinal));
    }
}
