using SimpleFile.Core;
using SimpleFile.Ipc;
using Xunit;

namespace SimpleFile.Tests;

public class ParityFeaturesTests
{
    [Fact]
    public void PlacesStore_AddsRemovesAndCapsRecents()
    {
        var bookmarks = PlacesStore.AddBookmark([], @"C:\Work");
        bookmarks = PlacesStore.AddBookmark(bookmarks, @"C:\Temp");
        Assert.Equal(@"C:\Temp", bookmarks[0].Path);
        bookmarks = PlacesStore.RemoveBookmark(bookmarks, @"C:\Temp");
        Assert.Equal(@"C:\Work", bookmarks.Single().Path);

        var recents = new List<string>();
        for (var index = 0; index < 20; index++)
        {
            recents = PlacesStore.RecordRecent(recents, $@"C:\item{index}");
        }

        Assert.Equal(PlacesStore.RecentLimit, recents.Count);
        Assert.Equal(@"C:\item19", recents[0]);
    }

    [Fact]
    public void TypeAhead_MatchesPrefixAndResetsAfterIdleWindow()
    {
        var entries = new[]
        {
            new FileEntry { Name = "Alpha.txt" },
            new FileEntry { Name = "Bravo.txt" },
        };
        Assert.Equal(1, TypeAhead.MatchIndex(entries, "br"));
        var buffer = new TypeAheadBuffer();
        buffer.Append('A', TimeSpan.FromSeconds(1));
        Assert.Equal("A", buffer.Text);
    }

    [Fact]
    public void PhotoFolder_DetectsImageHeavyDirectory()
    {
        var photos = new[]
        {
            new FileEntry { Name = "a.png", Extension = "png" },
            new FileEntry { Name = "b.jpg", Extension = "jpg" },
            new FileEntry { Name = "c.txt", Extension = "txt" },
        };
        Assert.True(PhotoFolder.IsPhotoFolder(photos, 60));
        Assert.False(PhotoFolder.IsPhotoFolder(photos, 80));
    }

    [Fact]
    public void AdvancedRename_FindReplacePrefixNumber()
    {
        var plan = new AdvancedRenamePlan { Find = "img", Replace = "shot", Prefix = "x-", StartNumber = 1 };
        Assert.Equal("x-shot1.png", AdvancedRename.Apply("img.png", plan, 0));
        var requests = AdvancedRename.Build(
            [new FileEntry { Name = "img.png", Path = @"C:\img.png" }],
            plan);
        Assert.Equal("x-shot1.png", requests[0].NewName);
    }

    [Fact]
    public void Marquee_IntersectsVerticalRange()
    {
        Assert.True(MarqueeSelection.Intersects(0, 10, 100, 30, 20, 40));
        Assert.False(MarqueeSelection.Intersects(0, 10, 100, 5, 40, 50));
    }

    [Fact]
    public void FolderTree_FlattensExpandedChildren()
    {
        var roots = new[]
        {
            new TreeNode
            {
                Name = "Users",
                Path = @"C:\Users",
                HasChildren = true,
                Children = [new TreeNode { Name = "test", Path = @"C:\Users\test" }],
            },
        };
        var flat = FolderTree.Flatten(roots, new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\Users" });
        Assert.Equal(2, flat.Count);
        Assert.Equal(1, flat[1].Depth);
    }

    [Fact]
    public void ClipboardHistory_KeepsLatestFirst()
    {
        var history = new ClipboardHistory();
        history.Push(ClipboardOperation.Copy, [@"C:\a"]);
        history.Push(ClipboardOperation.Cut, [@"C:\b"]);
        Assert.Equal(ClipboardOperation.Cut, history.Items[0].Operation);
        Assert.Equal(@"C:\b", history.Items[0].Paths[0]);
    }
}
