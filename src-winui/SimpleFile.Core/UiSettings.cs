namespace SimpleFile.Core;

public sealed class UiSettings
{
    public const double SidebarDefaultWidth = 232;
    public const double SidebarMinWidth = 180;
    public const double SidebarMaxWidth = 520;

    public string Theme { get; set; } = "system";
    public string DefaultView { get; set; } = "details";
    public int DefaultIconSize { get; set; } = 16;
    public bool ShowHidden { get; set; }
    public bool UseTrash { get; set; } = true;
    public bool ConfirmDelete { get; set; } = true;
    public bool OpenInNewTab { get; set; }
    public bool AutoCollapseTree { get; set; }
    public bool ShowQuickAccess { get; set; } = true;
    public bool ShowFolderTree { get; set; }
    public bool ShowBookmarks { get; set; } = true;
    public bool ShowRecentLocations { get; set; } = true;
    public bool ShowSmartFolders { get; set; } = true;
    public bool SidebarVisible { get; set; } = true;
    public double SidebarWidth { get; set; } = SidebarDefaultWidth;
    public bool ShowFolderSizes { get; set; }
    public bool EnableGitIntegration { get; set; } = true;
    public string StartLocation { get; set; } = "home";
    public string CustomPath { get; set; } = "";
    public string LastPath { get; set; } = "";
    public bool PreviewVisible { get; set; } = true;
    public bool QuickAccessCollapsed { get; set; }
    public bool MyPcCollapsed { get; set; }
    public int PhotoFolderImageThreshold { get; set; } = 70;
    public string ColumnPreset { get; set; } = "default";
    public Dictionary<string, double> ColumnWidths { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, string> ShortcutOverrides { get; set; } = new(StringComparer.Ordinal);

    public static UiSettings CreateDefault() => new();

    public static readonly IReadOnlyList<(string Id, string Label)> ViewOptions =
    [
        ("details", "Details"),
        ("list", "List"),
        ("tiles", "Tiles"),
        ("content", "Content"),
    ];

    public static readonly IReadOnlyList<(int Size, string Label)> IconSizeOptions =
    [
        (16, "Small icons"),
        (32, "Medium icons"),
        (48, "Large icons"),
        (96, "Extra large icons"),
    ];

    public static string NormalizeTheme(string? theme)
    {
        if (string.Equals(theme, "light", StringComparison.OrdinalIgnoreCase))
        {
            return "light";
        }

        if (string.Equals(theme, "system", StringComparison.OrdinalIgnoreCase)
            || string.Equals(theme, "windows", StringComparison.OrdinalIgnoreCase)
            || string.Equals(theme, "default", StringComparison.OrdinalIgnoreCase))
        {
            return "system";
        }

        return "dark";
    }

    public static string NormalizeStartLocation(string? startLocation)
    {
        return startLocation?.Trim().ToLowerInvariant() switch
        {
            "last" => "last",
            "custom" => "custom",
            _ => "home",
        };
    }

    public static string NormalizeColumnPreset(string? preset)
    {
        var normalized = (preset ?? "").Trim().ToLowerInvariant();
        return ColumnLayout.Presets.ContainsKey(normalized) ? normalized : "default";
    }

    public static string NormalizeDefaultView(string? view)
    {
        var normalized = (view ?? "").Trim().ToLowerInvariant();
        return ViewOptions.Any(option => string.Equals(option.Id, normalized, StringComparison.Ordinal))
            ? normalized
            : "details";
    }

    public static int NormalizeIconSize(int? iconSize)
    {
        if (iconSize is null)
        {
            return 16;
        }

        return IconSizeOptions
            .OrderBy(option => Math.Abs(option.Size - iconSize.Value))
            .ThenBy(option => option.Size)
            .First()
            .Size;
    }

    public static int NormalizeIconSize(string? iconSize)
    {
        return int.TryParse(iconSize, out var parsed)
            ? NormalizeIconSize(parsed)
            : NormalizeIconSize((int?)null);
    }

    public static double NormalizeSidebarWidth(double width)
    {
        if (double.IsNaN(width) || double.IsInfinity(width))
        {
            return SidebarDefaultWidth;
        }

        return Math.Clamp(width, SidebarMinWidth, SidebarMaxWidth);
    }

    public static double NormalizeSidebarWidth(string? width)
    {
        return double.TryParse(width, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var parsed)
            ? NormalizeSidebarWidth(parsed)
            : SidebarDefaultWidth;
    }
}
