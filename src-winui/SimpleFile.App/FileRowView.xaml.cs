using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using SimpleFile.Core;

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

        IconText.Text = Row.Icon;
        NameText.Text = Row.Name;
        ToolTipService.SetToolTip(NameText, Row.Name);
        SizeText.Text = Row.SizeText;
        DateText.Text = Row.ModifiedText;
        TypeText.Text = Row.TypeText;
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
}

public static class ColumnLayoutHost
{
    public static ColumnLayout Shared { get; private set; } = new();

    public static void Attach(ColumnLayout layout)
    {
        Shared = layout;
    }
}
