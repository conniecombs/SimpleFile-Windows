namespace SimpleFile.Core;

/// <summary>
/// Decides which pane-toolbar commands move into the More menu when the pane
/// is too narrow. Uses intrinsic item widths so the set is stable while
/// collapsing (no show/hide oscillation).
/// </summary>
public static class ToolbarOverflowPlanner
{
    public const string Filter = "filter";
    public const string Search = "search";
    public const string Settings = "settings";
    public const string DualPane = "dual-pane";
    public const string ViewOptions = "view-options";
    public const string NewFile = "new-file";
    public const string NewFolder = "new-folder";

    public const double PathMinWidth = 140;
    public const double ColumnSpacing = 8;

    /// <summary>Hide first as the pane shrinks. Nav, path, and More stay.</summary>
    public static readonly string[] PrimaryHideOrder =
    [
        Filter,
        Search,
        Settings,
        DualPane,
        ViewOptions,
        NewFile,
        NewFolder,
    ];

    public static readonly string[] SecondaryHideOrder =
    [
        DualPane,
        ViewOptions,
        NewFile,
        NewFolder,
    ];

    public static HashSet<string> OverflowIds(
        double availableWidth,
        double reservedWidth,
        IReadOnlyDictionary<string, double> itemWidths,
        IReadOnlyList<string> hideOrder)
    {
        var overflowed = new HashSet<string>(StringComparer.Ordinal);
        if (double.IsNaN(availableWidth) || availableWidth <= 0 || hideOrder.Count == 0)
        {
            return overflowed;
        }

        var needed = reservedWidth;
        foreach (var id in hideOrder)
        {
            if (itemWidths.TryGetValue(id, out var width) && width > 0)
            {
                needed += width;
            }
        }

        foreach (var id in hideOrder)
        {
            if (needed <= availableWidth)
            {
                break;
            }

            if (!itemWidths.TryGetValue(id, out var width) || width <= 0)
            {
                continue;
            }

            overflowed.Add(id);
            needed -= width;
        }

        return overflowed;
    }
}
