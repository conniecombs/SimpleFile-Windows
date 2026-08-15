using Microsoft.UI.Xaml.Controls;
using SimpleFile.Core;
using SimpleFile.Ipc;

namespace SimpleFile.App;

public sealed partial class AboutDialog : ContentDialog
{
    public AboutDialog()
    {
        InitializeComponent();
    }

    public void SetInfo(AppAboutInfo info)
    {
        VersionText.Text = $"Version {info.Version}";
        OsText.Text = $"{info.Os} ({info.Arch})";
    }
}
