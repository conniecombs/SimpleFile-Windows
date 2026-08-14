using SimpleFile.Ipc;

namespace SimpleFile.Core;

/// <summary>
/// Per-pane listing, history, and tabs. Mirrors primary vs secondary fields
/// in frontend/src/lib/app/core.ts.
/// </summary>
public sealed class ExplorerPane
{
    public ExplorerPane(PaneId id)
    {
        Id = id;
    }

    public PaneId Id { get; }

    public string Path { get; set; } = "";
    public List<FileEntry> Entries { get; set; } = [];
    public List<string> History { get; } = [];
    public int HistoryIndex { get; set; } = -1;
    public List<FileTab> Tabs { get; } = [];
    public string? ActiveTabId { get; set; }
    public string? SelectedPath { get; set; }
    public bool IsNavigating { get; set; }
    public bool ListingInProgress { get; set; }
    public bool PathIsNetwork { get; set; }
    private int _navigationToken;

    public int NextNavigationToken() => Interlocked.Increment(ref _navigationToken);

    public int NavigationToken => Volatile.Read(ref _navigationToken);

    public bool CanGoBack => HistoryIndex > 0;
    public bool CanGoForward => HistoryIndex >= 0 && HistoryIndex < History.Count - 1;
    public bool CanGoUp => PathRules.GetParentPath(Path) is not null;

    public IReadOnlyList<BreadcrumbSegment> Breadcrumbs => BreadcrumbBuilder.FromPath(Path);

    public IReadOnlyList<FileEntry> VisibleEntries(string sortBy, bool sortAscending, bool showHidden, string filterQuery)
    {
        return EntryPresentation.VisibleEntries(Entries, filterQuery, showHidden, sortBy, sortAscending);
    }

    public void RecordHistory(string path, HistoryMode mode)
    {
        if (mode == HistoryMode.None)
        {
            return;
        }

        if (mode == HistoryMode.ReplaceCurrent && HistoryIndex >= 0)
        {
            History[HistoryIndex] = path;
            return;
        }

        if (HistoryIndex >= 0 && HistoryIndex < History.Count && History[HistoryIndex] == path)
        {
            return;
        }

        if (HistoryIndex + 1 < History.Count)
        {
            History.RemoveRange(HistoryIndex + 1, History.Count - HistoryIndex - 1);
        }

        History.Add(path);
        HistoryIndex = History.Count - 1;
    }

    public void SyncActiveTab()
    {
        if (string.IsNullOrEmpty(Path))
        {
            return;
        }

        var tabId = ActiveTabId ?? $"tab-{Id.ToString().ToLowerInvariant()}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        var tab = new FileTab
        {
            Id = tabId,
            Path = Path,
            Title = PathRules.Basename(Path),
            History = [.. History],
            HistoryIndex = HistoryIndex,
        };

        var index = Tabs.FindIndex(candidate => candidate.Id == tabId);
        if (index >= 0)
        {
            Tabs[index] = tab;
        }
        else
        {
            Tabs.Add(tab);
        }

        ActiveTabId = tabId;
    }

    public static FileTab CreateTab(string path)
    {
        return new FileTab
        {
            Id = $"tab-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Random.Shared.Next():x}",
            Path = path,
            Title = PathRules.Basename(path),
            History = [path],
            HistoryIndex = 0,
        };
    }

    public void ApplyTabHistory(FileTab tab)
    {
        History.Clear();
        History.AddRange(tab.History.Count > 0 ? tab.History : [tab.Path]);
        HistoryIndex = tab.HistoryIndex >= 0 && tab.HistoryIndex < History.Count
            ? tab.HistoryIndex
            : History.Count - 1;
        ActiveTabId = tab.Id;
    }
}
