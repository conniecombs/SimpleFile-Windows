using System.Text.Json.Serialization;

namespace SimpleFile.Ipc;

public sealed class FileEntry
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("is_dir")]
    public bool IsDir { get; set; }

    [JsonPropertyName("is_symlink")]
    public bool IsSymlink { get; set; }

    [JsonPropertyName("size")]
    public ulong Size { get; set; }

    [JsonPropertyName("modified")]
    public string Modified { get; set; } = "";

    [JsonPropertyName("extension")]
    public string Extension { get; set; } = "";

    [JsonPropertyName("permissions")]
    public string? Permissions { get; set; }

    [JsonPropertyName("symlink_target")]
    public string? SymlinkTarget { get; set; }

    [JsonPropertyName("git_status")]
    public string? GitStatus { get; set; }
}

public sealed class DirectoryListing
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("parent")]
    public string? Parent { get; set; }

    [JsonPropertyName("entries")]
    public List<FileEntry> Entries { get; set; } = [];

    [JsonPropertyName("is_network")]
    public bool IsNetwork { get; set; }
}

public sealed class DirectoryListingChunk
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("parent")]
    public string? Parent { get; set; }

    [JsonPropertyName("entries")]
    public List<FileEntry> Entries { get; set; } = [];

    [JsonPropertyName("chunk_index")]
    public uint ChunkIndex { get; set; }

    [JsonPropertyName("done")]
    public bool Done { get; set; }

    [JsonPropertyName("is_network")]
    public bool IsNetwork { get; set; }
}

public sealed class DirectoryListingChunkNotification
{
    [JsonPropertyName("requestId")]
    public int RequestId { get; set; }

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("parent")]
    public string? Parent { get; set; }

    [JsonPropertyName("entries")]
    public List<FileEntry> Entries { get; set; } = [];

    [JsonPropertyName("chunk_index")]
    public uint ChunkIndex { get; set; }

    [JsonPropertyName("done")]
    public bool Done { get; set; }

    [JsonPropertyName("is_network")]
    public bool IsNetwork { get; set; }

    public DirectoryListingChunk ToChunk()
    {
        return new DirectoryListingChunk
        {
            Path = Path,
            Parent = Parent,
            Entries = Entries,
            ChunkIndex = ChunkIndex,
            Done = Done,
            IsNetwork = IsNetwork,
        };
    }
}

public sealed class DriveInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("drive_type")]
    public string DriveType { get; set; } = "";

    [JsonPropertyName("total_space")]
    public ulong TotalSpace { get; set; }

    [JsonPropertyName("free_space")]
    public ulong FreeSpace { get; set; }

    [JsonPropertyName("remote_path")]
    public string? RemotePath { get; set; }

    [JsonPropertyName("drive_status")]
    public string DriveStatus { get; set; } = "";

    [JsonPropertyName("status_detail")]
    public string? StatusDetail { get; set; }
}

public sealed class ProgressUpdate
{
    [JsonPropertyName("operation_id")]
    public string OperationId { get; set; } = "";

    [JsonPropertyName("operation_type")]
    public string OperationType { get; set; } = "";

    [JsonPropertyName("current")]
    public ulong Current { get; set; }

    [JsonPropertyName("total")]
    public ulong Total { get; set; }

    [JsonPropertyName("current_item")]
    public string CurrentItem { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

public sealed class FileChangeEvent
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";
}

public sealed class TreeNode
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";
    [JsonPropertyName("has_children")]
    public bool HasChildren { get; set; }
    [JsonPropertyName("children")]
    public List<TreeNode> Children { get; set; } = [];
}

public sealed class RenameRequest
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = "";
    [JsonPropertyName("new_name")]
    public string NewName { get; set; } = "";
}

public sealed class TransferResult
{
    [JsonPropertyName("source")]
    public string Source { get; set; } = "";
    [JsonPropertyName("destination")]
    public string Destination { get; set; } = "";
}
