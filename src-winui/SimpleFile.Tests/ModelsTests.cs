using System.Text.Json;
using SimpleFile.Ipc;
using Xunit;
using DriveInfo = SimpleFile.Ipc.DriveInfo;

namespace SimpleFile.Tests;

public class ModelsTests
{
    [Fact]
    public void FileEntry_DeserializesSnakeCaseGolden()
    {
        const string json = """
            {
              "name": "notes.txt",
              "path": "C:\\Users\\Public\\notes.txt",
              "is_dir": false,
              "is_symlink": false,
              "size": 12,
              "modified": "2026-01-01T00:00:00.000Z",
              "extension": "txt"
            }
            """;

        var entry = JsonSerializer.Deserialize<FileEntry>(json, IpcJson.Options);
        Assert.NotNull(entry);
        Assert.Equal("notes.txt", entry.Name);
        Assert.Equal(@"C:\Users\Public\notes.txt", entry.Path);
        Assert.False(entry.IsDir);
        Assert.False(entry.IsSymlink);
        Assert.Equal(12ul, entry.Size);
        Assert.Equal("txt", entry.Extension);
        Assert.Null(entry.Permissions);
        Assert.Null(entry.GitStatus);
    }

    [Fact]
    public void DirectoryListingChunkNotification_DeserializesRequestIdAndSnakeCase()
    {
        const string json = """
            {
              "requestId": 7,
              "path": "C:\\Users\\Public",
              "parent": "C:\\Users",
              "entries": [],
              "chunk_index": 0,
              "done": true,
              "is_network": false
            }
            """;

        var notification = JsonSerializer.Deserialize<DirectoryListingChunkNotification>(json, IpcJson.Options);
        Assert.NotNull(notification);
        Assert.Equal(7, notification.RequestId);
        Assert.Equal(0u, notification.ChunkIndex);
        Assert.True(notification.Done);
        Assert.False(notification.IsNetwork);
        Assert.Equal(@"C:\Users", notification.Parent);

        var chunk = notification.ToChunk();
        Assert.Equal(notification.Path, chunk.Path);
        Assert.True(chunk.Done);
    }

    [Fact]
    public void HandshakeParams_SerializeCamelCase()
    {
        var request = new JsonRpcRequest
        {
            Id = 1,
            Method = Protocol.HandshakeMethod,
            Params = new HandshakeParams
            {
                AuthToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            },
        };

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(request, IpcJson.Options));
        var root = document.RootElement;
        Assert.Equal("2.0", root.GetProperty("jsonrpc").GetString());
        Assert.Equal(1, root.GetProperty("id").GetInt32());
        Assert.Equal("ipc.handshake", root.GetProperty("method").GetString());
        var parameters = root.GetProperty("params");
        Assert.Equal(1, parameters.GetProperty("protocolVersion").GetInt32());
        Assert.Equal(Protocol.ClientName, parameters.GetProperty("clientName").GetString());
        Assert.False(parameters.TryGetProperty("protocol_version", out _));
    }

    [Fact]
    public void DriveInfo_DeserializesSnakeCase()
    {
        const string json = """
            {
              "name": "Windows",
              "path": "C:\\",
              "drive_type": "fixed",
              "total_space": 100,
              "free_space": 40,
              "remote_path": null,
              "drive_status": "ready"
            }
            """;

        var drive = JsonSerializer.Deserialize<DriveInfo>(json, IpcJson.Options);
        Assert.NotNull(drive);
        Assert.Equal("Windows", drive.Name);
        Assert.Equal("fixed", drive.DriveType);
        Assert.Equal(100ul, drive.TotalSpace);
        Assert.Equal("ready", drive.DriveStatus);
        Assert.Null(drive.RemotePath);
    }
}
