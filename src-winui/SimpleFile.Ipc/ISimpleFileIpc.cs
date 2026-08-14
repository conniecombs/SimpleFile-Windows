namespace SimpleFile.Ipc;

public interface ISimpleFileIpc : IAsyncDisposable
{
    bool IsConnected { get; }

    event EventHandler<Exception?>? Disconnected;

    Task<HandshakeResult> HandshakeAsync(string authToken, CancellationToken cancellationToken = default);

    Task<TResult> InvokeAsync<TResult>(
        string method,
        object? args,
        CancellationToken cancellationToken = default);

    Task InvokeAsync(string method, object? args, CancellationToken cancellationToken = default);

    IDisposable On<T>(string eventName, Action<T> handler);

    Task<DirectoryListing> ListDirectoryAsync(
        string path,
        Action<DirectoryListingChunk>? onChunk = null,
        CancellationToken cancellationToken = default);

    Task<HealthResult> HealthAsync(CancellationToken cancellationToken = default);

    Task<string> GetAppVersionAsync(CancellationToken cancellationToken = default);

    Task<string> GetHomeDirAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DriveInfo>> ListDrivesAsync(CancellationToken cancellationToken = default);

    Task SelectDirectoryAsync(string? defaultPath = null, CancellationToken cancellationToken = default);

    Task ShowMainWindowAsync(CancellationToken cancellationToken = default);

    Task ShutdownAsync(CancellationToken cancellationToken = default);
}
