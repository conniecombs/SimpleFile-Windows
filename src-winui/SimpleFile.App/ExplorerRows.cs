using SimpleFile.Core;
using SimpleFile.Ipc;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.App;

public sealed class FileRow
{
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public bool IsDir { get; set; }
    public string Icon { get; set; } = "";
    public string SizeText { get; set; } = "";
    public string ModifiedText { get; set; } = "";
    public string TypeText { get; set; } = "";
    public bool IsCut { get; set; }
    public ulong Size { get; set; }
    public string Extension { get; set; } = "";
    public string GitText { get; set; } = "";
    public string TagColor { get; set; } = "";
    public string TagName { get; set; } = "";
    public string AutomationName => IsDir ? $"Folder {Name}" : $"File {Name}";

    public static FileRow From(FileEntry entry, bool isCut = false, Tag? tag = null)
    {
        return new FileRow
        {
            Name = entry.Name,
            Path = entry.Path,
            IsDir = entry.IsDir,
            Icon = EntryPresentation.EntryIcon(entry),
            SizeText = EntryPresentation.FormatFileSize(entry.Size, entry.IsDir),
            ModifiedText = EntryPresentation.FormatModified(entry.Modified),
            TypeText = EntryPresentation.FileType(entry),
            IsCut = isCut,
            Size = entry.Size,
            Extension = entry.Extension ?? "",
            GitText = entry.GitStatus ?? "",
            TagColor = tag?.Color ?? "",
            TagName = tag?.Name ?? "",
        };
    }
}

public sealed class DriveRow
{
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Badge { get; set; } = "";
    public string Description { get; set; } = "";
    public bool IsActive { get; set; }
    public DriveInfo Source { get; set; } = new();

    public static DriveRow From(DriveInfo drive, string currentPath)
    {
        return new DriveRow
        {
            Name = string.IsNullOrEmpty(drive.Name) ? drive.Path : drive.Name,
            Path = drive.Path,
            Icon = DrivePresentation.Icon(drive),
            Badge = DrivePresentation.Badge(drive),
            Description = DrivePresentation.Description(drive),
            IsActive = PathRules.PathContains(drive.Path, currentPath)
                || PathRules.PathsEqual(drive.Path, currentPath),
            Source = drive,
        };
    }
}

public sealed class QuickAccessRow
{
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Command { get; set; } = "";
}
