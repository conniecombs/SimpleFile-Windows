using Microsoft.UI.Input;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace SimpleFile.App;

/// <summary>
/// Vertical splitter hit target. Subclassed so <see cref="Microsoft.UI.Xaml.UIElement.ProtectedCursor"/>
/// can show the west-east resize pointer.
/// </summary>
public sealed class PaneResizeGrip : Grid
{
    public PaneResizeGrip()
    {
        Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeWestEast);
    }
}
