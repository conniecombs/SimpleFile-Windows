using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using Microsoft.UI.Xaml.Media.Imaging;

namespace SimpleFile.App;

internal static class ShellIconLoader
{
    private const uint ShgfiIcon = 0x000000100;
    private const uint ShgfiSmallIcon = 0x000000001;
    private const uint ShgfiUseFileAttributes = 0x000000010;
    private const uint FileAttributeDirectory = 0x00000010;
    private const uint FileAttributeNormal = 0x00000080;

    private static readonly ConcurrentDictionary<string, BitmapImage> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static BitmapImage? ForEntry(string path, bool isDirectory)
    {
        var key = isDirectory
            ? "dir"
            : System.IO.Path.GetExtension(path) is { Length: > 0 } extension
                ? extension
                : "file";
        return Cache.GetOrAdd(key, _ => Load(path, isDirectory) ?? new BitmapImage());
    }

    public static BitmapImage? ForPath(string path)
    {
        return Cache.GetOrAdd("path:" + path, _ => Load(path, isDirectory: false, useAttributes: false) ?? new BitmapImage());
    }

    private static BitmapImage? Load(string path, bool isDirectory, bool useAttributes = true)
    {
        var info = new ShFileInfo();
        var attributes = isDirectory ? FileAttributeDirectory : FileAttributeNormal;
        var flags = ShgfiIcon | ShgfiSmallIcon;
        if (useAttributes)
        {
            flags |= ShgfiUseFileAttributes;
        }

        SHGetFileInfo(string.IsNullOrWhiteSpace(path) ? "file" : path, attributes, ref info, (uint)Marshal.SizeOf<ShFileInfo>(), flags);
        if (info.hIcon == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            using var icon = Icon.FromHandle(info.hIcon);
            using var bitmap = icon.ToBitmap();
            using var memory = new MemoryStream();
            bitmap.Save(memory, ImageFormat.Png);
            memory.Position = 0;
            var image = new BitmapImage();
            image.SetSource(memory.AsRandomAccessStream());
            return image;
        }
        catch
        {
            return null;
        }
        finally
        {
            _ = DestroyIcon(info.hIcon);
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ShFileInfo
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref ShFileInfo psfi, uint cbFileInfo, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);
}
