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
    private TextBlock? _metadataText;
    private TextBlock? _secondaryText;

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
        FileListViewHost.Changed += OnViewSettingsChanged;
        ApplyColumns();
        ApplyRow();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        ColumnLayoutHost.Shared.Changed -= OnColumnsChanged;
        FileListViewHost.Changed -= OnViewSettingsChanged;
    }

    private void OnColumnsChanged(object? sender, EventArgs e)
    {
        ApplyColumns();
        ApplyRow();
    }

    private void OnViewSettingsChanged(object? sender, EventArgs e)
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
            var iconSize = FileListViewHost.IconSize;
            _iconImage.Width = iconSize;
            _iconImage.Height = iconSize;
            _iconImage.Source = ShellIconLoader.ForEntry(Row.Path, Row.IsDir, iconSize);
        }

        if (_nameText is not null)
        {
            _nameText.Text = Row.Name;
            ToolTipService.SetToolTip(_nameText, Row.Name);
        }

        if (_metadataText is not null)
        {
            var value = MetadataText(Row);
            _metadataText.Text = value;
            ToolTipService.SetToolTip(_metadataText, string.IsNullOrWhiteSpace(value) ? null : value);
        }

        if (_secondaryText is not null)
        {
            var value = SecondaryText(Row);
            _secondaryText.Text = value;
            ToolTipService.SetToolTip(_secondaryText, string.IsNullOrWhiteSpace(value) ? null : value);
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
        var view = FileListViewHost.View;
        var iconSize = FileListViewHost.IconSize;
        var columnKey = view == "details"
            ? string.Join('\u001f', visible.Select(column => column.Id))
            : "";
        var key = $"{view}:{iconSize}:{columnKey}";
        if (!string.Equals(_renderedColumnKey, key, StringComparison.Ordinal))
        {
            RebuildLayout(view, iconSize, visible);
            _renderedColumnKey = key;
        }

        if (view != "details")
        {
            return;
        }

        for (var index = 0; index < visible.Count && index < RowGrid.ColumnDefinitions.Count; index++)
        {
            var column = visible[index];
            RowGrid.ColumnDefinitions[index].Width = column.Id == "name"
                ? new GridLength(1, GridUnitType.Star)
                : new GridLength(column.Width);
        }
    }

    private void RebuildLayout(string view, int iconSize, IReadOnlyList<FileListColumn> columns)
    {
        ResetLayout();
        switch (view)
        {
            case "list":
                RebuildListLayout(iconSize);
                break;
            case "tiles":
                RebuildTileLayout(iconSize);
                break;
            case "content":
                RebuildContentLayout(iconSize);
                break;
            default:
                RebuildDetailsLayout(columns, iconSize);
                break;
        }
    }

    private void ResetLayout()
    {
        RowGrid.ColumnDefinitions.Clear();
        RowGrid.RowDefinitions.Clear();
        RowGrid.Children.Clear();
        RowGrid.Width = double.NaN;
        RowGrid.MinHeight = 28;
        RowGrid.ColumnSpacing = 10;
        RowGrid.RowSpacing = 0;
        _textCells.Clear();
        _tagPip = null;
        _iconImage = null;
        _nameText = null;
        _metadataText = null;
        _secondaryText = null;
    }

    private void RebuildDetailsLayout(IReadOnlyList<FileListColumn> columns, int iconSize)
    {
        RowGrid.MinHeight = Math.Max(28, iconSize + 10);
        RowGrid.ColumnSpacing = 10;

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
                ? CreateNameCell(iconSize, wrapName: false)
                : CreateTextCell(column.Id);
            Grid.SetColumn(cell, index);
            RowGrid.Children.Add(cell);
        }
    }

    private void RebuildListLayout(int iconSize)
    {
        RowGrid.MinHeight = Math.Max(30, iconSize + 10);
        RowGrid.ColumnSpacing = 8;
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        _tagPip = CreateTagPip();
        Grid.SetColumn(_tagPip, 0);
        RowGrid.Children.Add(_tagPip);

        _iconImage = CreateIcon(iconSize);
        Grid.SetColumn(_iconImage, 1);
        RowGrid.Children.Add(_iconImage);

        var text = new Grid { ColumnSpacing = 10 };
        text.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        text.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        _nameText = CreateNameText(wrapName: false);
        _metadataText = CreateMetadataText();
        Grid.SetColumn(_nameText, 0);
        Grid.SetColumn(_metadataText, 1);
        text.Children.Add(_nameText);
        text.Children.Add(_metadataText);
        Grid.SetColumn(text, 2);
        RowGrid.Children.Add(text);
    }

    private void RebuildTileLayout(int iconSize)
    {
        RowGrid.Width = Math.Max(188, iconSize + 140);
        RowGrid.MinHeight = Math.Max(72, iconSize + 24);
        RowGrid.ColumnSpacing = 10;
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var iconHost = new Grid();
        _iconImage = CreateIcon(iconSize);
        iconHost.Children.Add(_iconImage);
        _tagPip = CreateTagPip();
        _tagPip.HorizontalAlignment = HorizontalAlignment.Right;
        _tagPip.VerticalAlignment = VerticalAlignment.Top;
        iconHost.Children.Add(_tagPip);
        Grid.SetColumn(iconHost, 0);
        RowGrid.Children.Add(iconHost);

        var stack = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Spacing = 2,
        };
        _nameText = CreateNameText(wrapName: true);
        _metadataText = CreateMetadataText();
        stack.Children.Add(_nameText);
        stack.Children.Add(_metadataText);
        Grid.SetColumn(stack, 1);
        RowGrid.Children.Add(stack);
    }

    private void RebuildContentLayout(int iconSize)
    {
        RowGrid.MinHeight = Math.Max(54, iconSize + 14);
        RowGrid.ColumnSpacing = 12;
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        RowGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var iconHost = new Grid();
        _iconImage = CreateIcon(iconSize);
        iconHost.Children.Add(_iconImage);
        _tagPip = CreateTagPip();
        _tagPip.HorizontalAlignment = HorizontalAlignment.Right;
        _tagPip.VerticalAlignment = VerticalAlignment.Top;
        iconHost.Children.Add(_tagPip);
        Grid.SetColumn(iconHost, 0);
        RowGrid.Children.Add(iconHost);

        var stack = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Spacing = 2,
        };
        _nameText = CreateNameText(wrapName: false);
        _metadataText = CreateMetadataText();
        _secondaryText = CreateMetadataText(opacity: 0.74);
        stack.Children.Add(_nameText);
        stack.Children.Add(_metadataText);
        stack.Children.Add(_secondaryText);
        Grid.SetColumn(stack, 1);
        RowGrid.Children.Add(stack);
    }

    private Grid CreateNameCell(int iconSize, bool wrapName)
    {
        var cell = new Grid
        {
            ColumnSpacing = 9,
        };
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        cell.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        _tagPip = CreateTagPip();
        Grid.SetColumn(_tagPip, 0);
        cell.Children.Add(_tagPip);

        _iconImage = CreateIcon(iconSize);
        Grid.SetColumn(_iconImage, 1);
        cell.Children.Add(_iconImage);

        _nameText = CreateNameText(wrapName);
        Grid.SetColumn(_nameText, 2);
        cell.Children.Add(_nameText);
        return cell;
    }

    private static Ellipse CreateTagPip()
    {
        return new Ellipse
        {
            Width = 7,
            Height = 7,
            VerticalAlignment = VerticalAlignment.Center,
            Visibility = Visibility.Collapsed,
        };
    }

    private static Image CreateIcon(int iconSize)
    {
        return new Image
        {
            Width = iconSize,
            Height = iconSize,
            VerticalAlignment = VerticalAlignment.Center,
            Stretch = Stretch.Uniform,
        };
    }

    private TextBlock CreateNameText(bool wrapName)
    {
        return new TextBlock
        {
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 13,
            Foreground = Brush("SfTextPrimaryBrush"),
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = wrapName ? TextWrapping.Wrap : TextWrapping.NoWrap,
            MaxLines = wrapName ? 2 : 1,
        };
    }

    private TextBlock CreateTextCell(string id)
    {
        var text = CreateMetadataText();
        _textCells[id] = text;
        return text;
    }

    private TextBlock CreateMetadataText(double opacity = 0.9)
    {
        return new TextBlock
        {
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 12,
            Foreground = Brush("SfTextMutedBrush"),
            Opacity = opacity,
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
        };
    }

    private static string MetadataText(FileRow row)
    {
        var sizeOrItems = row.IsDir && !string.IsNullOrWhiteSpace(row.ItemsText) ? row.ItemsText : row.SizeText;
        return string.Join("  ", new[] { sizeOrItems, row.TypeText, row.ModifiedText }
            .Where(part => !string.IsNullOrWhiteSpace(part)));
    }

    private static string SecondaryText(FileRow row)
    {
        return string.Join("  ", new[] { row.PathText, row.GitText, row.SymlinkText }
            .Where(part => !string.IsNullOrWhiteSpace(part)));
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

public static class FileListViewHost
{
    public static event EventHandler? Changed;

    public static string View { get; private set; } = UiSettings.NormalizeDefaultView(null);

    public static int IconSize { get; private set; } = UiSettings.NormalizeIconSize((int?)null);

    public static void Apply(string? view, int iconSize)
    {
        var nextView = UiSettings.NormalizeDefaultView(view);
        var nextIconSize = UiSettings.NormalizeIconSize(iconSize);
        if (string.Equals(View, nextView, StringComparison.Ordinal) && IconSize == nextIconSize)
        {
            return;
        }

        View = nextView;
        IconSize = nextIconSize;
        Changed?.Invoke(null, EventArgs.Empty);
    }
}
