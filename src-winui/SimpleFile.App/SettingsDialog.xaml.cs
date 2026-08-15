using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SimpleFile.Core;
using SimpleFile.Ipc;
using Windows.Storage.Pickers;

namespace SimpleFile.App;

public sealed partial class SettingsDialog : ContentDialog
{
    private FileOperationService? _fileOps;

    public SettingsDialog()
    {
        InitializeComponent();
        CategoryList.SelectedIndex = 0;
    }

    private void OnCategorySelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        AppearancePanel.Visibility = Visibility.Collapsed;
        NavigationPanel.Visibility = Visibility.Collapsed;
        BehaviorPanel.Visibility = Visibility.Collapsed;
        ToolsPanel.Visibility = Visibility.Collapsed;
        UpdatesPanel.Visibility = Visibility.Collapsed;
        AboutPanel.Visibility = Visibility.Collapsed;

        var selected = (ListViewItem)CategoryList.SelectedItem;
        if (selected == null) return;

        switch (selected.Content.ToString())
        {
            case "Appearance": AppearancePanel.Visibility = Visibility.Visible; break;
            case "Navigation": NavigationPanel.Visibility = Visibility.Visible; break;
            case "Behavior": BehaviorPanel.Visibility = Visibility.Visible; break;
            case "Tools": ToolsPanel.Visibility = Visibility.Visible; break;
            case "Updates": UpdatesPanel.Visibility = Visibility.Visible; break;
            case "About": AboutPanel.Visibility = Visibility.Visible; break;
        }
    }

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        var query = SearchBox.Text.Trim();
        foreach (var item in CategoryList.Items.OfType<ListViewItem>())
        {
            var label = item.Content?.ToString() ?? "";
            item.Visibility = query.Length == 0 || label.Contains(query, StringComparison.OrdinalIgnoreCase)
                ? Visibility.Visible
                : Visibility.Collapsed;
        }
    }

    public string Theme => ((ComboBoxItem?)ThemeComboBox.SelectedItem)?.Tag?.ToString() ?? "System";
    public bool ShowHidden => ShowHiddenSwitch.IsOn;
    public nint OwnerHwnd { get; set; }

    public void ApplyTo(UiSettings settings)
    {
        settings.Theme = UiSettings.NormalizeTheme(Theme);
        settings.ShowHidden = ShowHiddenSwitch.IsOn;
        settings.UseTrash = UseTrashSwitch.IsOn;
        settings.ConfirmDelete = ConfirmDeleteSwitch.IsOn;
        settings.StartLocation = UiSettings.NormalizeStartLocation(
            ((ComboBoxItem?)StartLocationComboBox.SelectedItem)?.Tag?.ToString());
        settings.CustomPath = CustomPathBox.Text.Trim();
        settings.OpenInNewTab = OpenInNewTabSwitch.IsOn;
        settings.EnableGitIntegration = EnableGitSwitch.IsOn;
        settings.ShowFolderSizes = ShowFolderSizesSwitch.IsOn;
    }

    public async Task LoadSettingsAsync(FileOperationService fileOps)
    {
        _fileOps = fileOps;
        
        var theme = await fileOps.GetSettingAsync("theme").ConfigureAwait(false) ?? "System";
        ThemeComboBox.SelectedIndex = theme.Equals("Light", StringComparison.OrdinalIgnoreCase)
            ? 1
            : theme.Equals("Dark", StringComparison.OrdinalIgnoreCase)
                ? 2
                : 0;
        
        var showHidden = await fileOps.GetSettingAsync("showHidden").ConfigureAwait(false);
        ShowHiddenSwitch.IsOn = showHidden == "true";
        
        var useTrash = await fileOps.GetSettingAsync("useTrash").ConfigureAwait(false);
        UseTrashSwitch.IsOn = useTrash != "false";
        
        var confirmDelete = await fileOps.GetSettingAsync("confirmDelete").ConfigureAwait(false);
        ConfirmDeleteSwitch.IsOn = confirmDelete != "false";
        
        var startLoc = await fileOps.GetSettingAsync("startLocation").ConfigureAwait(false) ?? "Home";
        StartLocationComboBox.SelectedIndex = startLoc == "Custom" ? 2 : (startLoc == "Last" ? 1 : 0);
        
        CustomPathBox.Text = await fileOps.GetSettingAsync("customPath").ConfigureAwait(false) ?? "";
        
        var openInNewTab = await fileOps.GetSettingAsync("openInNewTab").ConfigureAwait(false);
        OpenInNewTabSwitch.IsOn = openInNewTab == "true";

        var enableGit = await fileOps.GetSettingAsync("enableGitIntegration").ConfigureAwait(false);
        EnableGitSwitch.IsOn = enableGit != "false";
        var showSizes = await fileOps.GetSettingAsync("showFolderSizes").ConfigureAwait(false);
        ShowFolderSizesSwitch.IsOn = showSizes == "true";

        // Tools
        await CheckRarInstalledAsync().ConfigureAwait(true);
        
        // Updates
        var version = await fileOps.GetAppVersionAsync().ConfigureAwait(true);
        CurrentVersionText.Text = $"Current Version: {version}";
        AboutVersionText.Text = $"Version {version}";
    }

    public async Task SaveSettingsAsync(FileOperationService fileOps)
    {
        await fileOps.SetSettingAsync("theme", ((ComboBoxItem)ThemeComboBox.SelectedItem).Tag.ToString()!).ConfigureAwait(false);
        await fileOps.SetSettingAsync("showHidden", ShowHiddenSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
        await fileOps.SetSettingAsync("useTrash", UseTrashSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
        await fileOps.SetSettingAsync("confirmDelete", ConfirmDeleteSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
        
        var startLoc = ((ComboBoxItem)StartLocationComboBox.SelectedItem).Tag.ToString()!;
        await fileOps.SetSettingAsync("startLocation", startLoc).ConfigureAwait(false);
        await fileOps.SetSettingAsync("customPath", CustomPathBox.Text).ConfigureAwait(false);
        await fileOps.SetSettingAsync("openInNewTab", OpenInNewTabSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
        await fileOps.SetSettingAsync("enableGitIntegration", EnableGitSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
        await fileOps.SetSettingAsync("showFolderSizes", ShowFolderSizesSwitch.IsOn ? "true" : "false").ConfigureAwait(false);
    }

    private async Task CheckRarInstalledAsync()
    {
        if (_fileOps == null) return;
        var installed = await _fileOps.CheckRarInstalledAsync().ConfigureAwait(true);
        RarStatusText.Text = installed ? "Installed" : "Not Installed";
        InstallRarButton.IsEnabled = !installed;
    }

    private async void OnInstallRarClicked(object sender, RoutedEventArgs e)
    {
        if (_fileOps == null) return;
        InstallRarButton.IsEnabled = false;
        RarStatusText.Text = "Preparing install...";
        
        var prepResult = await _fileOps.PrepareRarInstallAsync().ConfigureAwait(true);
        if (prepResult != null)
        {
            var dialog = new ContentDialog
            {
                Title = "Install RAR Support",
                Content = "This will download and install third-party components to support RAR extraction. Do you agree to their terms?",
                PrimaryButtonText = "Install",
                CloseButtonText = "Cancel",
                XamlRoot = this.XamlRoot
            };
            
            if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            {
                RarStatusText.Text = "Installing...";
                await _fileOps.InstallRarAsync(prepResult.ConfirmationToken).ConfigureAwait(true);
                await CheckRarInstalledAsync().ConfigureAwait(true);
            }
            else
            {
                await _fileOps.DiscardRarInstallAsync(prepResult.ConfirmationToken).ConfigureAwait(true);
                await CheckRarInstalledAsync().ConfigureAwait(true);
            }
        }
        else
        {
            RarStatusText.Text = "Failed to prepare installation.";
            InstallRarButton.IsEnabled = true;
        }
    }

    private async void OnCheckUpdatesClicked(object sender, RoutedEventArgs e)
    {
        if (_fileOps == null) return;
        CheckUpdatesButton.IsEnabled = false;
        var hasUpdate = await _fileOps.CheckForUpdateAsync().ConfigureAwait(true);
        if (hasUpdate != null)
        {
            InstallUpdateButton.Visibility = Visibility.Visible;
        }
        CheckUpdatesButton.IsEnabled = true;
    }

    private async void OnInstallUpdateClicked(object sender, RoutedEventArgs e)
    {
        if (_fileOps == null) return;
        InstallUpdateButton.IsEnabled = false;
        await _fileOps.InstallUpdateAsync().ConfigureAwait(true);
    }

    private async void OnBrowseCustomPath(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker();
        picker.FileTypeFilter.Add("*");
        if (OwnerHwnd != 0)
        {
            WinRT.Interop.InitializeWithWindow.Initialize(picker, OwnerHwnd);
        }

        var folder = await picker.PickSingleFolderAsync();
        if (folder is not null)
        {
            CustomPathBox.Text = folder.Path;
        }
    }
}
