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
        CancelButton.IsEnabled = update.Status == "running";
        OperationLabel.Text = update.Status switch
        {
            "completed" => "Operation complete",
            "cancelled" => "Operation cancelled",
            "error" => $"Operation failed: {update.Error}",
            _ => $"{update.OperationType}: {update.Current} / {update.Total}",
        };
        if (update.Total > 0)
        {
            ProgressBar.IsIndeterminate = false;
            ProgressBar.Value = (double)update.Current / update.Total * 100;
        }
        else
        {
            ProgressBar.IsIndeterminate = true;
        }
        CurrentItemLabel.Text = update.Error ?? update.CurrentItem;
    }

    public void Start(string label)
    {
        Visibility = Visibility.Visible;
        OperationLabel.Text = label;
        CurrentItemLabel.Text = "";
        ProgressBar.Value = 0;
        ProgressBar.IsIndeterminate = true;
        CancelButton.IsEnabled = true;
    }

    public void SetCancelling()
    {
        OperationLabel.Text = "Cancelling...";
        CancelButton.IsEnabled = false;
    }

    public void SetCompleted()
    {
        OperationLabel.Text = "Operation complete";
        ProgressBar.Value = 100;
        ProgressBar.IsIndeterminate = false;
        CancelButton.IsEnabled = false;
    }
}
