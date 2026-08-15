namespace SimpleFile.Core;

internal sealed class WorkspaceLayout
{
    public int Version { get; set; } = 1;
    public bool DualPaneEnabled { get; set; }
    public PaneId ActivePane { get; set; } = PaneId.Primary;
    public string SortBy { get; set; } = "name";
    public bool SortAscending { get; set; } = true;
    public WorkspacePaneLayout Primary { get; set; } = new();
    public WorkspacePaneLayout Secondary { get; set; } = new();
}

internal sealed class WorkspacePaneLayout
{
    public string Path { get; set; } = "";
    public string? ActiveTabId { get; set; }
    public List<WorkspaceTabLayout> Tabs { get; set; } = [];
}

internal sealed class WorkspaceTabLayout
{
    public string Id { get; set; } = "";
    public string Path { get; set; } = "";
    public string Title { get; set; } = "";
    public List<string> History { get; set; } = [];
    public int HistoryIndex { get; set; } = -1;
}
