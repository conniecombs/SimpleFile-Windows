using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using SimpleFile.Core;
using Windows.UI;

namespace SimpleFile.App;

public sealed partial class FileRowView : UserControl
{
    private readonly Dictionary<string, TextBlock> _textCells = new(StringComparer.Ordinal);
    private string _renderedColumnKey = "";
    private Ellipse? _tagPip;
    private Image? _iconImage;
    private TextBlock? _nameText;

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
        ApplyColumns();
        ApplyRow();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        ColumnLayoutHost.Shared.Changed -= OnColumnsChanged;
    }

    private void OnColumnsChanged(object? sender, EventArgs e)
    {
        ApplyColumns();
        ApplyRow();
    }

    private void ApplyRow()
    {
        if (Row is null)
        {
            return;
        }

        ApplyColumns();
        if (_iconImage is not null)
        {
            _iconImage.Source = ShellIconLoader.ForEntry(Row.Path, Row.IsDir);
        }

        if (_nameText is not null)
        {
            _nameText.Text = Row.Name;
            ToolTipService.SetToolTip(_nameText, Row.Name);
        }

        foreach (var (id, text) in _textCells)
        {
            var value = Row.ColumnText(id);
            text.Text = value;
            ToolTipService.SetToolTip(text, string.IsNullOrWhiteSpace(value) ? null : value);
        }

        ApplyTagPip(Row.TagColor);
        Opacity = Row.IsCut ? 0.45 : 1.0;
        AutomationProperties.SetName(this, Row.AutomationName);
    }

    private void ApplyColumns()
    {
        var columns = ColumnLayoutHost.Shared;
        var visible = columns.VisibleColumns;
        var key = string.Join('\u001f', visible.Select(column => column.Id));
        if (!string.Equals(_renderedColumnKey, key, StringComparison.Ordinal))
        {
            RebuildColumns(visible);
            _renderedColumnKey = key;
        }

        for (var index = 0; index < visible.Count && index < RowGrid.ColumnDefinitions.Count; index++)
        {
            var column = visible[index];
            RowGrid.ColumnDefinitions[index].Width = column.Id == "name"
                ? new GridLength(1, GridUnitType.Star)
                : new GridLength(column.Width);
        }
    }

    private void RebuildColumns(IReadOnlyList<FileListColumn> columns)
    {
        RowGrid.ColumnDefinitions.Clear();
        RowGrid.Children.Clear();
        _textCells.Clear();
        _tagPip = null;
        _iconImage = null;
        _nameText = null;

        for (var index = 0; index < columns.Count; index++)
        {
            var column = columns[index];
            RowGrid.ColumnDefinitions.Add(new ColumnDefinition
            {
                Width = column.Id == "name"
                    ? new GridLength(1, GridUnitType.Star)
                    : new GridLength(column.Width),
            });

            FrameworkElement cell = column.Id == "name"
                ? CreateNameCell()
                : CreateTextCell(column.Id);
            Grid.SetColumn(cell, index);
            RowGrid.Children.Add(cell);
        }
    }

    private Grid CreateNameCell()
    {
        var cell = new Grid
        {
            ColumnSpacing = 9,
        };
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        _tagPip = new Ellipse
        {
            Width = 7,
            Height = 7,
            VerticalAlignment = VerticalAlignment.Center,
            Visibility = Visibility.Collapsed,
        };
        Grid.SetColumn(_tagPip, 0);
        cell.Children.Add(_tagPip);

        _iconImage = new Image
        {
            Width = 18,
            Height = 18,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(_iconImage, 1);
        cell.Children.Add(_iconImage);

        _nameText = new TextBlock
        {
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 13,
            Foreground = Brush("SfTextPrimaryBrush"),
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
        };
        Grid.SetColumn(_nameText, 2);
        cell.Children.Add(_nameText);
        return cell;
    }

    private TextBlock CreateTextCell(string id)
    {
        var text = new TextBlock
        {
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 12,
            Foreground = Brush("SfTextMutedBrush"),
            Opacity = 0.9,
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
        };
        _textCells[id] = text;
        return text;
    }

    private void ApplyTagPip(string color)
    {
        var brush = TryBrush(color);
        if (brush is null)
        {
            if (_tagPip is not null)
            {
                _tagPip.Visibility = Visibility.Collapsed;
            }

            return;
        }

        if (_tagPip is null)
        {
            return;
        }

        _tagPip.Fill = brush;
        _tagPip.Visibility = Visibility.Visible;
    }

    private static Brush Brush(string key)
    {
        return Application.Current.Resources.TryGetValue(key, out var value) && value is Brush brush
            ? brush
            : new SolidColorBrush(Microsoft.UI.Colors.Transparent);
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

    public static void Detach(ColumnLayout layout)
    {
        if (ReferenceEquals(Shared, layout))
        {
            Shared = new ColumnLayout();
        }
    }
}
