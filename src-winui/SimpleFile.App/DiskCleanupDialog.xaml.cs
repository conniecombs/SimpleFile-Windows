using System;
using System.Linq;
using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SimpleFile.Core;
using SimpleFile.Ipc;
namespace SimpleFile.App;

public sealed partial class DiskCleanupDialog : ContentDialog
{
    public string Directory { get; set; } = string.Empty;
    public ulong ThresholdBytes => (ulong)(ThresholdInput.Value * 1024 * 1024);
    public bool AnalyzeRequested { get; private set; }

    public ObservableCollection<LargeFileViewModel> LargeFiles { get; } = new();
    public ObservableCollection<CleanupDuplicateGroupViewModel> Duplicates { get; } = new();

    public DiskCleanupDialog()
    {
        InitializeComponent();
        LargeFilesList.ItemsSource = LargeFiles;
        DuplicatesList.ItemsSource = Duplicates;
    }

    public void ShowConfiguration()
    {
        PhaseConfig.Visibility = Visibility.Visible;
        PhaseScan.Visibility = Visibility.Collapsed;
        PhaseResults.Visibility = Visibility.Collapsed;
    }

    public void ShowScanning()
    {
        PhaseConfig.Visibility = Visibility.Collapsed;
        PhaseScan.Visibility = Visibility.Visible;
        PhaseResults.Visibility = Visibility.Collapsed;
    }

    public void ShowResults(CleanupResult result)
    {
        PhaseConfig.Visibility = Visibility.Collapsed;
        PhaseScan.Visibility = Visibility.Collapsed;
        PhaseResults.Visibility = Visibility.Visible;
        
        LargeFiles.Clear();
        foreach (var lf in result.LargeFiles.Take(50))
        {
            LargeFiles.Add(new LargeFileViewModel(lf));
        }

        Duplicates.Clear();
        foreach (var g in result.Duplicates.Take(25))
        {
            Duplicates.Add(new CleanupDuplicateGroupViewModel(g));
        }

        SummaryText.Text = $"{result.LargeFiles.Count} large file(s) at or above {ThresholdInput.Value} MB | {result.Duplicates.Count} duplicate group(s)";
    }

    public void UpdateProgress(ProgressUpdate update)
    {
        if (update.Total > 0)
        {
            ScanProgress.IsIndeterminate = false;
            ScanProgress.Maximum = (double)update.Total;
            ScanProgress.Value = (double)update.Current;
        }
        else
        {
            ScanProgress.IsIndeterminate = true;
        }
        ScanCurrentItem.Text = update.CurrentItem ?? "";
    }

    private void AnalyzeButton_Click(object sender, RoutedEventArgs e)
    {
        AnalyzeRequested = true;
        Hide(); // Parent handles logic after dialog closes or awaits it
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        AnalyzeRequested = false;
        Hide();
    }

    public static string FormatSize(long bytes)
    {
        string[] sizes = { "B", "KB", "MB", "GB", "TB" };
        double len = bytes;
        int order = 0;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len = len / 1024;
        }
        return $"{len:0.##} {sizes[order]}";
    }
}

public class LargeFileViewModel
{
    public string Path { get; }
    public long Size { get; }
    public string FormattedSize => DiskCleanupDialog.FormatSize(Size);

    public LargeFileViewModel(CleanupFile lf)
    {
        Path = lf.Path;
        Size = (long)lf.Size;
    }
}

public class CleanupDuplicateGroupViewModel
{
    public string HashPrefix { get; }
    public int FileCount { get; }
    public string[] Paths { get; }
    
    public string HeaderText => $"Hash: {HashPrefix}... ({FileCount} files)";

    public CleanupDuplicateGroupViewModel(DuplicateGroup group)
    {
        HashPrefix = string.IsNullOrEmpty(group.Hash) ? "Unknown" : (group.Hash.Length > 8 ? group.Hash.Substring(0, 8) : group.Hash);
        FileCount = group.Files.Count;
        Paths = group.Files.ToArray();
    }
}

// Dummy classes
// public class CleanupResult { public List<LargeFile> LargeFiles { get; set; } = new(); public List<CleanupDuplicateGroup> DuplicateGroups { get; set; } = new(); }
// public class LargeFile { public string Path { get; set; } = ""; public long Size { get; set; } }
// public class CleanupDuplicateGroup { public string Hash { get; set; } = ""; public List<string> Paths { get; set; } = new(); }
