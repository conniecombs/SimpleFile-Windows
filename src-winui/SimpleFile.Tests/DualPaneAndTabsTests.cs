using SimpleFile.Core;
using Xunit;

namespace SimpleFile.Tests;

public class DualPaneAndTabsTests
{
    [Fact]
    public async Task ToggleDualPane_CopiesPrimaryPathAndKeepsPrimaryActive()
    {
        var workspace = await Started();
        await workspace.NavigateToAsync(@"C:\Users\test\Desktop");
        await workspace.ToggleDualPaneAsync();

        Assert.True(workspace.DualPaneEnabled);
        Assert.Equal(PaneId.Primary, workspace.ActivePane);
        Assert.Equal(PaneId.Primary, workspace.SidebarTarget);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.Primary.Path);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.Secondary.Path);
        Assert.Equal("Left pane", workspace.ActivePaneLabel);
        Assert.Single(workspace.Secondary.Tabs);
    }

    [Fact]
    public async Task SidebarTarget_FollowsActivePaneOnlyWhenDual()
    {
        var workspace = await Started();
        Assert.Equal(PaneId.Primary, workspace.SidebarTarget);
        workspace.ActivatePane(PaneId.Secondary);
        Assert.Equal(PaneId.Primary, workspace.SidebarTarget);

        await workspace.ToggleDualPaneAsync();
        workspace.ActivatePane(PaneId.Secondary);
        Assert.Equal(PaneId.Secondary, workspace.SidebarTarget);
        Assert.Equal("Right pane", workspace.ActivePaneLabel);
    }

    [Fact]
    public async Task Normalize_RoutesSecondaryToPrimaryWhenSinglePane()
    {
        var workspace = await Started();
        Assert.Equal(PaneId.Primary, workspace.Normalize(PaneId.Secondary));
        await workspace.ToggleDualPaneAsync();
        Assert.Equal(PaneId.Secondary, workspace.Normalize(PaneId.Secondary));
    }

    [Fact]
    public async Task SecondaryNavigation_DoesNotChangePrimaryHistory()
    {
        var workspace = await Started();
        await workspace.NavigateToAsync(@"C:\Users\test\Desktop");
        var primaryHistory = workspace.Primary.History.ToArray();
        await workspace.ToggleDualPaneAsync();
        await workspace.NavigatePaneAsync(PaneId.Secondary, @"C:\");

        Assert.Equal(@"C:\Users\test\Desktop", workspace.Primary.Path);
        Assert.Equal(primaryHistory, workspace.Primary.History);
        Assert.Equal(@"C:\", workspace.Secondary.Path);
        Assert.True(workspace.Primary.CanGoBack);
        Assert.True(workspace.Secondary.CanGoBack);
    }

    [Fact]
    public async Task SecondaryBack_IsIndependent()
    {
        var workspace = await Started();
        await workspace.ToggleDualPaneAsync();
        await workspace.NavigatePaneAsync(PaneId.Secondary, @"C:\Users\test\Desktop");
        await workspace.GoBackAsync(PaneId.Secondary);
        Assert.Equal(@"C:\Users\test", workspace.Secondary.Path);
        Assert.Equal(@"C:\Users\test", workspace.Primary.Path);
    }

    [Fact]
    public async Task NewTab_IsPaneLocal()
    {
        var workspace = await Started();
        await workspace.ToggleDualPaneAsync();
        await workspace.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        await workspace.OpenNewTabAsync(PaneId.Secondary, @"C:\");

        Assert.Equal(2, workspace.Primary.Tabs.Count);
        Assert.Equal(2, workspace.Secondary.Tabs.Count);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.Primary.Path);
        Assert.Equal(@"C:\", workspace.Secondary.Path);
        Assert.NotEqual(workspace.Primary.ActiveTabId, workspace.Secondary.ActiveTabId);
    }

    [Fact]
    public async Task SwitchTab_RestoresThatTabsHistory()
    {
        var workspace = await Started();
        var firstTab = workspace.Primary.ActiveTabId;
        await workspace.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        Assert.Equal(@"C:\Users\test\Desktop", workspace.Primary.Path);
        Assert.True(workspace.Primary.CanGoBack is false);

        await workspace.SwitchToTabAsync(firstTab!, PaneId.Primary);
        Assert.Equal(@"C:\Users\test", workspace.Primary.Path);
        Assert.Equal(firstTab, workspace.Primary.ActiveTabId);
        Assert.Contains(@"C:\Users\test", workspace.Primary.History);
    }

    [Fact]
    public async Task CloseActiveTab_SelectsNeighbor()
    {
        var workspace = await Started();
        var first = workspace.Primary.ActiveTabId;
        await workspace.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        var second = workspace.Primary.ActiveTabId;
        await workspace.CloseTabAsync(second!, PaneId.Primary);

        Assert.Equal(first, workspace.Primary.ActiveTabId);
        Assert.Single(workspace.Primary.Tabs);
        Assert.Equal(@"C:\Users\test", workspace.Primary.Path);
    }

    [Fact]
    public async Task CloseLastTab_OpensHome()
    {
        var workspace = await Started();
        await workspace.NavigateToAsync(@"C:\Users\test\Desktop");
        var only = workspace.Primary.ActiveTabId;
        await workspace.CloseTabAsync(only!, PaneId.Primary);

        Assert.Single(workspace.Primary.Tabs);
        Assert.Equal(@"C:\Users\test", workspace.Primary.Path);
        Assert.NotEqual(only, workspace.Primary.ActiveTabId);
    }

    [Fact]
    public async Task Initialize_CreatesPrimaryTab()
    {
        var workspace = await Started();
        Assert.Single(workspace.Primary.Tabs);
        Assert.Equal(@"C:\Users\test", workspace.Primary.Tabs[0].Path);
        Assert.Equal("test", workspace.Primary.Tabs[0].Title);
        Assert.Empty(workspace.Secondary.Tabs);
    }

    [Fact]
    public async Task ToggleOff_KeepsSecondaryPathForNextToggle()
    {
        var workspace = await Started();
        await workspace.ToggleDualPaneAsync();
        await workspace.NavigatePaneAsync(PaneId.Secondary, @"C:\");
        await workspace.ToggleDualPaneAsync();
        Assert.False(workspace.DualPaneEnabled);
        Assert.Equal(PaneId.Primary, workspace.ActivePane);
        await workspace.ToggleDualPaneAsync();
        Assert.Equal(@"C:\", workspace.Secondary.Path);
    }

    [Fact]
    public async Task FocusSecondary_EnablesDualPane()
    {
        var workspace = await Started();
        await workspace.FocusSecondaryAsync();
        Assert.True(workspace.DualPaneEnabled);
        Assert.Equal(PaneId.Secondary, workspace.ActivePane);
        Assert.Equal(PaneId.Secondary, workspace.SidebarTarget);
    }

    [Fact]
    public async Task ActivatePane_DoesNotRaiseWhenAlreadyActive()
    {
        var workspace = await Started();
        var raises = 0;
        workspace.Changed += (_, _) => raises++;

        workspace.ActivatePane(PaneId.Primary);
        workspace.ActivatePane(PaneId.Secondary);
        Assert.Equal(0, raises);

        await workspace.ToggleDualPaneAsync();
        raises = 0;
        workspace.ActivatePane(PaneId.Primary);
        Assert.Equal(0, raises);
        workspace.ActivatePane(PaneId.Secondary);
        Assert.Equal(1, raises);
        workspace.ActivatePane(PaneId.Secondary);
        Assert.Equal(1, raises);
    }

    [Fact]
    public async Task SelectPath_DoesNotRaiseForSelectionOnly()
    {
        var workspace = await Started();
        var file = workspace.VisibleEntries.First(entry => !entry.IsDir);
        var raises = 0;
        workspace.Changed += (_, _) => raises++;

        workspace.SelectPath(file.Path);
        workspace.SelectPath(null);
        workspace.SelectPath(file.Path, PaneId.Primary);
        Assert.Equal(0, raises);
        Assert.Equal(file.Path, workspace.SelectedPath);
    }

    [Fact]
    public async Task Refresh_KeepsSelectionAndDoesNotClearListing()
    {
        var workspace = await Started();
        var file = workspace.VisibleEntries.First(entry => !entry.IsDir);
        workspace.SelectPath(file.Path);
        var raises = 0;
        workspace.Changed += (_, _) =>
        {
            raises++;
            Assert.NotEmpty(workspace.VisibleEntries);
            Assert.Equal(file.Path, workspace.SelectedPath);
        };

        await workspace.RefreshAsync();

        Assert.True(raises >= 1);
        Assert.Equal(file.Path, workspace.SelectedPath);
        Assert.Contains(workspace.VisibleEntries, entry => entry.Path == file.Path);
    }

    [Fact]
    public async Task SwitchTabBy_Wraps()
    {
        var workspace = await Started();
        var first = workspace.Primary.ActiveTabId;
        await workspace.OpenNewTabAsync(PaneId.Primary, @"C:\Users\test\Desktop");
        await workspace.SwitchTabByAsync(1);
        Assert.Equal(first, workspace.Primary.ActiveTabId);
        await workspace.SwitchTabByAsync(-1);
        Assert.Equal(@"C:\Users\test\Desktop", workspace.Primary.Path);
    }

    private static async Task<ExplorerWorkspace> Started()
    {
        var workspace = new ExplorerWorkspace(FakeExplorerBackend.Typical());
        await workspace.InitializeAsync();
        return workspace;
    }
}
