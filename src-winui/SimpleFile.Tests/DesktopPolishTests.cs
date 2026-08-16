using SimpleFile.Core;
using SimpleFile.Ipc;
using Xunit;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Tests;

public class DesktopPolishTests
{
    [Fact]
    public void CommandPalette_ContainsSvelteIdsAndFilters()
    {
        Assert.Contains(AppCommandCatalog.All, command => command.Id == "go-home");
        Assert.Contains(AppCommandCatalog.All, command => command.Id == "git-pull");
        Assert.Contains(AppCommandCatalog.All, command => command.Id == "keyboard-help");
        Assert.Equal(AppCommandCatalog.All.Count, AppCommandCatalog.Filter("").Count);
        var git = AppCommandCatalog.Filter("git");
        Assert.Equal(2, git.Count);
        Assert.All(git, command => Assert.StartsWith("git-", command.Id, StringComparison.Ordinal));
        Assert.Equal("settings", AppCommandCatalog.Find("settings")?.Id);
        Assert.Null(AppCommandCatalog.Find("missing"));
    }

    [Fact]
    public void ContextMenu_HidesDisabledItemsAndKeepsSvelteIds()
    {
        var empty = ContextMenuBuilder.Build(new ContextMenuRequest());
        Assert.Contains(empty, entry => entry.Id == "ctx-terminal");
        Assert.DoesNotContain(empty, entry => entry.Id == "ctx-open");
        Assert.DoesNotContain(empty, entry => entry.Id == "ctx-delete");
        Assert.DoesNotContain(empty, entry => entry.Kind == ContextMenuKind.Divider && empty.Last() == entry);

        var selected = ContextMenuBuilder.Build(new ContextMenuRequest
        {
            SelectionCount = 1,
            SelectedIsDirectory = false,
            SelectedIsArchive = true,
            ArchiveExtractFolderName = "pack",
            DualPaneEnabled = true,
            OtherPaneHasPath = true,
            HasClipboard = true,
            AllSelectedAreFiles = true,
        });

        Assert.Contains(selected, entry => entry.Id == "ctx-open");
        Assert.Contains(selected, entry => entry.Id == "ctx-open-with");
        Assert.Contains(selected, entry => entry.Id == "ctx-copy-to-pane");
        var extract = Assert.Single(selected, entry => entry.Id == "ctx-extract-menu");
        Assert.Contains(extract.Children, child => child.Id == "ctx-extract-folder" && child.Label.Contains("pack/", StringComparison.Ordinal));
        Assert.Contains(selected, entry => entry.Id == "ctx-info");
    }

    [Fact]
    public void ContextMenu_CompareRequiresTwoFiles()
    {
        var oneFile = ContextMenuBuilder.Build(new ContextMenuRequest
        {
            SelectionCount = 1,
            AllSelectedAreFiles = true,
        });
        Assert.DoesNotContain(oneFile, entry => entry.Id == "ctx-compare");

        var twoFiles = ContextMenuBuilder.Build(new ContextMenuRequest
        {
            SelectionCount = 2,
            AllSelectedAreFiles = true,
        });
        Assert.Contains(twoFiles, entry => entry.Id == "ctx-compare");
    }

    [Fact]
    public void ColumnLayout_ClampsResizeAndAppliesPresets()
    {
        var columns = new ColumnLayout();
        columns.Resize("size", 10);
        Assert.Equal(72, columns.WidthOf("size"));
        columns.Resize("size", 1000);
        Assert.Equal(220, columns.WidthOf("size"));
        columns.ApplyPreset("developer");
        Assert.Contains("git", columns.VisibleIds);
        columns.RestoreWidths(new Dictionary<string, double> { ["name"] = 300 });
        Assert.Equal(300, columns.WidthOf("name"));
    }

    [Fact]
    public void DropDestination_ResolvesFolderHoverAndRejectsSelf()
    {
        var ontoFolder = DropDestination.Resolve(@"C:\Users\test", @"C:\Users\test\Desktop", hoveredIsDirectory: true);
        Assert.Equal(@"C:\Users\test\Desktop", ontoFolder.Destination);
        Assert.True(ontoFolder.OntoFolder);

        var ontoPane = DropDestination.Resolve(@"C:\Users\test", @"C:\Users\test\notes.txt", hoveredIsDirectory: false);
        Assert.Equal(@"C:\Users\test", ontoPane.Destination);

        Assert.False(DropDestination.IsValidDrop([@"C:\Users\test\Desktop"], @"C:\Users\test\Desktop"));
        Assert.False(DropDestination.IsValidDrop([@"C:\Users\test\Desktop"], @"C:\Users\test\Desktop\nested"));
        Assert.False(DropDestination.IsValidDrop([@"C:\Users\test\notes.txt"], @"C:\Users\test"));
        Assert.True(DropDestination.IsValidDrop([@"C:\Users\test\notes.txt"], @"C:\Users\test\Desktop"));

        var conflicts = DropDestination.ConflictingNames(
            [@"C:\src\notes.txt", @"C:\src\other.txt"],
            ["notes.txt", "readme.md"]);
        Assert.Equal(["notes.txt"], conflicts);
    }

    [Fact]
    public void StatusBar_IncludesSelectionSizeAndEmptyLoading()
    {
        var loading = StatusBarFormatter.Format(0, [], @"C:\", "Left pane", listingInProgress: true);
        Assert.Equal("Loading…", loading.ItemText);
        Assert.Contains("Left pane", loading.Combined, StringComparison.Ordinal);

        var empty = StatusBarFormatter.Format(0, [], @"C:\", null, isEmpty: true);
        Assert.Equal("Empty folder", empty.ItemText);

        var selected = StatusBarFormatter.Format(
            3,
            [
                new FileEntry { Name = "a.txt", Path = @"C:\a.txt", Size = 1024 },
                new FileEntry { Name = "b", Path = @"C:\b", IsDir = true },
            ],
            @"C:\",
            null);
        Assert.Equal("3 items", selected.ItemText);
        Assert.Equal("2 selected (1.0 KB)", selected.SelectionText);
    }

    [Fact]
    public void DrivePresentation_DescribesNetworkStateForSidebar()
    {
        var offline = new DriveInfo
        {
            Name = "Projects (Z:)",
            Path = @"Z:\",
            DriveType = "network",
            DriveStatus = "offline",
            StatusDetail = "The operation timed out.",
            RemotePath = @"\\nas\projects",
        };
        Assert.Equal("Offline", DrivePresentation.Badge(offline));
        Assert.Equal("Timed out · Retry to reconnect", DrivePresentation.Description(offline));
        Assert.False(DrivePresentation.IsAvailable(offline));

        var connected = new DriveInfo
        {
            Path = @"Y:\",
            DriveType = "network",
            DriveStatus = "available",
            RemotePath = @"\\nas\media",
        };
        Assert.Equal("", DrivePresentation.Badge(connected));
        Assert.Equal(@"\\nas\media", DrivePresentation.Description(connected));
        Assert.True(DrivePresentation.IsAvailable(connected));
    }

    [Fact]
    public void KeyboardShortcuts_IncludePaletteAndAllowOverrides()
    {
        Assert.Contains(KeyboardShortcutMap.Defaults, item => item.Id == "commandPalette.open" && item.Keys == "Ctrl+Shift+P");
        Assert.Contains(KeyboardShortcutMap.Defaults, item => item.Id == "pane.switch" && item.Keys == "Tab");
        var remapped = KeyboardShortcutMap.ApplyOverrides(new Dictionary<string, string>
        {
            ["search.focus"] = "Ctrl+K",
        });
        Assert.Equal("Ctrl+K", remapped.Single(item => item.Id == "search.focus").Keys);
        Assert.Equal("F5", remapped.Single(item => item.Id == "directory.refresh").Keys);
    }

    [Fact]
    public void ArchivePaths_RecognizeCompoundExtensions()
    {
        Assert.True(ArchivePaths.IsArchiveFile(@"C:\pack.tar.gz"));
        Assert.True(ArchivePaths.IsArchiveFile(@"D:\a.tgz"));
        Assert.True(ArchivePaths.IsArchiveFile("bundle.rar"));
        Assert.False(ArchivePaths.IsArchiveFile("notes.txt"));
        Assert.Equal("pack", ArchivePaths.ExtractFolderName("pack.tar.gz"));
        Assert.Equal("bundle", ArchivePaths.ExtractFolderName("bundle.zip"));
    }

    [Fact]
    public void UiSettings_NormalizeThemeAndStartLocation()
    {
        Assert.Equal("light", UiSettings.NormalizeTheme("Light"));
        Assert.Equal("system", UiSettings.NormalizeTheme("system"));
        Assert.Equal("dark", UiSettings.NormalizeTheme("nope"));
        Assert.Equal("last", UiSettings.NormalizeStartLocation("Last"));
        Assert.Equal("custom", UiSettings.NormalizeStartLocation("custom"));
        Assert.Equal("home", UiSettings.NormalizeStartLocation(null));
    }

    [Fact]
    public async Task UndoStack_UndoThenRedo_InvokesInOrder()
    {
        var log = new List<string>();
        var stack = new UndoStack();
        stack.Push(new UndoEntry
        {
            Description = "Copy 1 item(s)",
            Undo = _ => { log.Add("undo"); return Task.CompletedTask; },
            Redo = _ => { log.Add("redo"); return Task.CompletedTask; },
        });

        Assert.True(stack.CanUndo);
        Assert.False(stack.CanRedo);
        await stack.UndoAsync();
        Assert.False(stack.CanUndo);
        Assert.True(stack.CanRedo);
        await stack.RedoAsync();
        Assert.Equal(["undo", "redo"], log);
        Assert.Equal("Copy 1 item(s)", stack.History.Single());
    }

    [Fact]
    public void ResolveStartPath_UsesHomeLastAndCustom()
    {
        var backend = FakeExplorerBackend.Typical();
        var workspace = new ExplorerWorkspace(backend);
        workspace.ApplyUiSettings(new UiSettings { StartLocation = "home" });
        // HomePath is empty until Initialize; ResolveStartPath still returns HomePath/primary.
        Assert.Equal("", workspace.ResolveStartPath());

        workspace.ApplyUiSettings(new UiSettings { StartLocation = "custom", CustomPath = @"D:\Work" });
        Assert.Equal(@"D:\Work", workspace.ResolveStartPath());

        workspace.ApplyUiSettings(new UiSettings { StartLocation = "last", LastPath = @"D:\Last" });
        Assert.Equal(@"D:\Last", workspace.ResolveStartPath());
    }
}
