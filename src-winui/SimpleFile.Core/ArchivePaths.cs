namespace SimpleFile.Core;

public static class ArchivePaths
{
    public static bool IsArchiveFile(string? path)
    {
        var name = PathRules.Basename(path ?? "").ToLowerInvariant();
        return name.EndsWith(".tar.gz", StringComparison.Ordinal)
            || name.EndsWith(".tgz", StringComparison.Ordinal)
            || name.EndsWith(".zip", StringComparison.Ordinal)
            || name.EndsWith(".tar", StringComparison.Ordinal)
            || name.EndsWith(".gz", StringComparison.Ordinal)
            || name.EndsWith(".rar", StringComparison.Ordinal);
    }

    public static string ExtractFolderName(string? archiveName)
    {
        var trimmed = (archiveName ?? "").Trim();
        var lower = trimmed.ToLowerInvariant();
        if (lower.EndsWith(".tar.gz", StringComparison.Ordinal))
        {
            return trimmed[..^7];
        }

        if (lower.EndsWith(".tgz", StringComparison.Ordinal))
        {
            return trimmed[..^4];
        }

        var dot = trimmed.LastIndexOf('.');
        return dot > 0 ? trimmed[..dot] : trimmed;
    }
}
