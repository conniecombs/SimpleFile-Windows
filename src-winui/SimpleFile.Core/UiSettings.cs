namespace SimpleFile.Core;

public sealed class UiSettings
{
    public string Theme { get; set; } = "dark";
    public string DefaultView { get; set; } = "list";
    public int DefaultIconSize { get; set; } = 64;
    public bool ShowHidden { get; set; }
    public bool UseTrash { get; set; } = true;
    public bool ConfirmDelete { get; set; } = true;
    public bool OpenInNewTab { get; set; }
    public bool AutoCollapseTree { get; set; }
    public bool ShowRecentLocations { get; set; } = true;
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

    public static string NormalizeTheme(string? theme)
    {
        return string.Equals(theme, "light", StringComparison.OrdinalIgnoreCase) ? "light" : "dark";
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
}
