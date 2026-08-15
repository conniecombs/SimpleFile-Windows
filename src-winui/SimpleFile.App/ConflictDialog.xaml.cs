using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace SimpleFile.App;

public enum ConflictResolution
{
    Cancel,
    Skip,
    Replace,
    KeepBoth,
}

public sealed partial class ConflictDialog : ContentDialog
{
    public ConflictResolution Result { get; private set; } = ConflictResolution.Cancel;
    public bool ApplyToAllChecked => ApplyToAll.IsChecked == true;

    public ConflictDialog()
    {
        InitializeComponent();
        PrimaryButtonClick += (_, _) => Result = ConflictResolution.Replace;
        SecondaryButtonClick += (_, _) => Result = ConflictResolution.Skip;
        CloseButtonClick += (_, _) => Result = ConflictResolution.Cancel;
        KeepBothButton.Click += (_, _) =>
        {
            Result = ConflictResolution.KeepBoth;
            Hide();
        };
    }

    public void SetConflictPath(string path)
    {
        ConflictMessage.Text = $"A file or folder with the same name already exists at:\n{path}\n\nWhat would you like to do?";
    }
}
