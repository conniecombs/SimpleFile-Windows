using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SimpleFile.Ipc;

namespace SimpleFile.App;

public sealed partial class ProgressPanel : UserControl
{
    public event EventHandler? CancelRequested;

    public ProgressPanel()
    {
        InitializeComponent();
        CancelButton.Click += (_, _) => CancelRequested?.Invoke(this, EventArgs.Empty);
    }

    public void UpdateProgress(ProgressUpdate update)
    {
        OperationLabel.Text = $"{update.OperationType}: {update.Current} / {update.Total}";
        if (update.Total > 0)
        {
            ProgressBar.IsIndeterminate = false;
            ProgressBar.Value = (double)update.Current / update.Total * 100;
        }
        else
        {
            ProgressBar.IsIndeterminate = true;
        }
        CurrentItemLabel.Text = update.CurrentItem;
    }

    public void SetCompleted()
    {
        OperationLabel.Text = "Operation complete";
        ProgressBar.Value = 100;
        ProgressBar.IsIndeterminate = false;
        CancelButton.IsEnabled = false;
    }
}
