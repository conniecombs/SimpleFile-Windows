namespace SimpleFile.Core;

public sealed class FileListColumn
{
    public FileListColumn(string id, string label, string sort, double width, double minWidth, double maxWidth)
    {
        Id = id;
        Label = label;
        Sort = sort;
        Width = width;
        MinWidth = minWidth;
        MaxWidth = maxWidth;
    }

    public string Id { get; }
    public string Label { get; }
    public string Sort { get; }
    public double Width { get; set; }
    public double MinWidth { get; }
    public double MaxWidth { get; }
}

/// <summary>
/// Default widths/presets match frontend/src/lib/fileListColumns.ts.
/// </summary>
public sealed class ColumnLayout
{
    public static readonly string[] DefaultVisible = ["name", "size", "date", "type"];

    public static readonly IReadOnlyDictionary<string, string[]> Presets = new Dictionary<string, string[]>(StringComparer.Ordinal)
    {
        ["default"] = ["name", "size", "date", "type"],
        ["details"] = ["name", "size", "items", "date", "type", "extension"],
        ["media"] = ["name", "size", "date", "extension", "type"],
        ["developer"] = ["name", "size", "date", "extension", "git", "symlink", "path"],
        ["photo"] = ["name", "date", "size", "extension", "type"],
    };

    public ColumnLayout()
    {
        Columns =
        [
            new("name", "Name", "name", 240, 120, 720),
            new("size", "Size", "size", 100, 72, 220),
            new("items", "Items", "items", 86, 64, 160),
            new("date", "Modified", "date", 160, 112, 260),
            new("type", "Type", "type", 100, 84, 260),
            new("extension", "Ext", "extension", 72, 56, 120),
            new("git", "Git", "git", 92, 72, 180),
            new("symlink", "Link target", "symlink", 180, 100, 420),
            new("path", "Path", "path", 220, 140, 640),
            new("parent", "Parent", "parent", 180, 120, 480),
        ];
        VisibleIds = [.. DefaultVisible];
    }

    public event EventHandler? Changed;

    public List<FileListColumn> Columns { get; }

    public List<string> VisibleIds { get; }

    public IReadOnlyList<FileListColumn> VisibleColumns =>
        VisibleIds
            .Select(id => Columns.FirstOrDefault(column => column.Id == id))
            .Where(column => column is not null)
            .Cast<FileListColumn>()
            .ToList();

    public bool IsVisible(string id)
    {
        return VisibleIds.Any(visible => string.Equals(visible, id, StringComparison.Ordinal));
    }

    public FileListColumn? Find(string id)
    {
        return Columns.FirstOrDefault(column => string.Equals(column.Id, id, StringComparison.Ordinal));
    }

    public double WidthOf(string id)
    {
        return Find(id)?.Width ?? 100;
    }

    public void Resize(string id, double width)
    {
        var column = Find(id);
        if (column is null)
        {
            return;
        }

        column.Width = Math.Clamp(width, column.MinWidth, column.MaxWidth);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void ApplyPreset(string preset)
    {
        if (!Presets.TryGetValue(preset, out var ids))
        {
            ids = DefaultVisible;
        }

        VisibleIds.Clear();
        VisibleIds.AddRange(ids.Where(id => Find(id) is not null));
        if (VisibleIds.Count == 0)
        {
            VisibleIds.AddRange(DefaultVisible);
        }

        Changed?.Invoke(this, EventArgs.Empty);
    }

    public Dictionary<string, double> SnapshotWidths()
    {
        return Columns.ToDictionary(column => column.Id, column => column.Width, StringComparer.Ordinal);
    }

    public void RestoreWidths(IReadOnlyDictionary<string, double>? widths)
    {
        if (widths is null)
        {
            return;
        }

        foreach (var (id, width) in widths)
        {
            var column = Find(id);
            if (column is not null)
            {
                column.Width = Math.Clamp(width, column.MinWidth, column.MaxWidth);
            }
        }

        Changed?.Invoke(this, EventArgs.Empty);
    }
}
