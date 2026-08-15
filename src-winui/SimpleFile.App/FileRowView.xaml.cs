using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SimpleFile.Core;
using Windows.UI;

namespace SimpleFile.App;

public sealed partial class FileRowView : UserControl
{
    public static readonly DependencyProperty RowProperty = DependencyProperty.Register(
        nameof(Row),
        typeof(FileRow),
        typeof(FileRowView),
        new PropertyMetadata(null, OnRowChanged));

    public FileRowView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    public FileRow? Row
    {
        get => (FileRow?)GetValue(RowProperty);
        set => SetValue(RowProperty, value);
    }

    private static void OnRowChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args)
    {
        if (sender is FileRowView view)
        {
            view.ApplyRow();
        }
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        ColumnLayoutHost.Shared.Changed += OnColumnsChanged;
        ApplyWidths();
        ApplyRow();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        ColumnLayoutHost.Shared.Changed -= OnColumnsChanged;
    }

    private void OnColumnsChanged(object? sender, EventArgs e) => ApplyWidths();

    private void ApplyRow()
    {
        if (Row is null)
        {
            return;
        }

        IconImage.Source = ShellIconLoader.ForEntry(Row.Path, Row.IsDir);
        NameText.Text = Row.Name;
        ToolTipService.SetToolTip(NameText, Row.Name);
        SizeText.Text = Row.SizeText;
        DateText.Text = Row.ModifiedText;
        TypeText.Text = Row.TypeText;
        ApplyTagPip(Row.TagColor);
        Opacity = Row.IsCut ? 0.45 : 1.0;
        AutomationProperties.SetName(this, Row.AutomationName);
    }

    private void ApplyWidths()
    {
        var columns = ColumnLayoutHost.Shared;
        SizeColumn.Width = new GridLength(columns.WidthOf("size"));
        DateColumn.Width = new GridLength(columns.WidthOf("date"));
        TypeColumn.Width = new GridLength(columns.WidthOf("type"));
    }

    private void ApplyTagPip(string color)
    {
        var brush = TryBrush(color);
        if (brush is null)
        {
            TagPip.Visibility = Visibility.Collapsed;
            return;
        }

        TagPip.Fill = brush;
        TagPip.Visibility = Visibility.Visible;
    }

    private static Brush? TryBrush(string color)
    {
        if (string.IsNullOrWhiteSpace(color))
        {
            return null;
        }

        try
        {
            var hex = color.Trim().TrimStart('#');
            if (hex.Length != 6)
            {
                return null;
            }

            var r = Convert.ToByte(hex[..2], 16);
            var g = Convert.ToByte(hex[2..4], 16);
            var b = Convert.ToByte(hex[4..6], 16);
            return new SolidColorBrush(Color.FromArgb(255, r, g, b));
        }
        catch
        {
            return null;
        }
    }
}

public static class ColumnLayoutHost
{
    public static ColumnLayout Shared { get; private set; } = new();

    public static void Attach(ColumnLayout layout)
    {
        Shared = layout;
    }
}
