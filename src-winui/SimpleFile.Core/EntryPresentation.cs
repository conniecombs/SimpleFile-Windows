using System.Globalization;
using SimpleFile.Ipc;

namespace SimpleFile.Core;

/// <summary>
/// Listing presentation ported from frontend/src/lib/coreFileManager.ts.
/// </summary>
public static class EntryPresentation
{
    public static string FormatFileSize(ulong bytes, bool isDirectory = false)
    {
        if (isDirectory)
        {
            return "";
        }

        if (bytes == 0)
        {
            return "0 B";
        }

        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double size = bytes;
        var unitIndex = 0;
        while (size >= 1024 && unitIndex < units.Length - 1)
        {
            size /= 1024;
            unitIndex += 1;
        }

        return unitIndex == 0
            ? $"{size:0} {units[unitIndex]}"
            : $"{size:0.0} {units[unitIndex]}";
    }

    public static string FormatModified(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "";
        }

        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var date)
            && !DateTimeOffset.TryParse(value, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out date))
        {
            return value;
        }

        return date.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
    }

    public static string FileType(FileEntry entry)
    {
        if (entry.IsDir)
        {
            return "Folder";
        }

        return string.IsNullOrEmpty(entry.Extension)
            ? "File"
            : $"{entry.Extension.ToUpperInvariant()} File";
    }

    public static string EntryIcon(FileEntry entry)
    {
        return entry.IsDir ? "\uE8B7" : "\uE8A5";
    }

    public static IReadOnlyList<FileEntry> FilterEntries(
        IEnumerable<FileEntry> entries,
        string query = "",
        bool showHidden = false)
    {
        var normalizedQuery = query.Trim().ToLowerInvariant();
        return entries.Where(entry =>
        {
            if (!showHidden && entry.Name.StartsWith('.'))
            {
                return false;
            }

            return normalizedQuery.Length == 0
                || entry.Name.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase);
        }).ToList();
    }

    public static IReadOnlyList<FileEntry> SortEntries(
        IEnumerable<FileEntry> entries,
        string sortBy = "name",
        bool sortAsc = true)
    {
        var direction = sortAsc ? 1 : -1;
        return entries
            .OrderBy(entry => entry.IsDir ? 0 : 1)
            .ThenBy(entry => SortValue(entry, sortBy), Comparer<object>.Create((left, right) =>
            {
                var compared = Comparer<object>.Default.Compare(left, right);
                return compared * direction;
            }))
            .ThenBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    public static IReadOnlyList<FileEntry> VisibleEntries(
        IEnumerable<FileEntry> entries,
        string filterQuery = "",
        bool showHidden = false,
        string sortBy = "name",
        bool sortAsc = true)
    {
        return SortEntries(FilterEntries(entries, filterQuery, showHidden), sortBy, sortAsc);
    }

    private static object SortValue(FileEntry entry, string sortBy)
    {
        switch (sortBy)
        {
            case "size":
                return entry.Size;
            case "modified":
            case "date":
                return DateTimeOffset.TryParse(entry.Modified, out var date) ? date.ToUnixTimeMilliseconds() : 0L;
            case "extension":
            case "type":
                return entry.IsDir ? "folder" : (entry.Extension ?? "").ToLowerInvariant();
            case "git":
                return (entry.GitStatus ?? "").ToLowerInvariant();
            case "path":
                return (entry.Path ?? "").ToLowerInvariant();
            case "parent":
                return (PathRules.GetParentPath(entry.Path) ?? "").ToLowerInvariant();
            case "symlink":
                return (entry.SymlinkTarget ?? "").ToLowerInvariant();
            default:
                return entry.Name.ToLowerInvariant();
        }
    }
}
