using System.Text.Json;
using SimpleFile.Ipc;
using Xunit;

namespace SimpleFile.Tests;

public class NamedPipeJsonClientTests
{
    [Fact]
    public async Task HandshakeAndHealth_RoundTrip()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var handshakeTask = client.HandshakeAsync("secret-token");
        var request = await server.ReadRequestAsync();
        Assert.Equal(Protocol.HandshakeMethod, request.Method);
        Assert.Equal(1, request.Id);
        var parameters = Assert.IsType<JsonElement>(request.Params);
        Assert.Equal("secret-token", parameters.GetProperty("authToken").GetString());

        await server.SendResultAsync(
            request.Id,
            new HandshakeResult
            {
                ProtocolVersion = 1,
                AppVersion = "1.1.0",
                Identifier = Protocol.Identifier,
                MethodCount = 74,
            });

        var handshake = await handshakeTask;
        Assert.Equal(Protocol.Identifier, handshake.Identifier);
        Assert.Equal(74, handshake.MethodCount);

        var healthTask = client.HealthAsync();
        var healthRequest = await server.ReadRequestAsync();
        Assert.Equal(Protocol.HealthMethod, healthRequest.Method);
        await server.SendResultAsync(healthRequest.Id, new HealthResult
        {
            Ok = true,
            ProtocolVersion = 1,
            AppVersion = "1.1.0",
        });

        var health = await healthTask;
        Assert.True(health.Ok);
        Assert.Equal("1.1.0", health.AppVersion);
    }

    [Fact]
    public async Task Invoke_MatchesResponsesByIdOutOfOrder()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var first = client.InvokeAsync<int>("alpha", new { });
        var firstRequest = await server.ReadRequestAsync();
        var second = client.InvokeAsync<int>("beta", new { });
        var secondRequest = await server.ReadRequestAsync();

        Assert.Equal("alpha", firstRequest.Method);
        Assert.Equal("beta", secondRequest.Method);
        Assert.Equal(2, client.InFlightCount);

        await server.SendResultAsync(secondRequest.Id, 20);
        await server.SendResultAsync(firstRequest.Id, 10);

        Assert.Equal(10, await first);
        Assert.Equal(20, await second);
        Assert.Equal(0, client.InFlightCount);
    }

    [Fact]
    public async Task ListDirectory_FiltersChunksByRequestId()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var seen = new List<DirectoryListingChunk>();
        var listingTask = client.ListDirectoryAsync(@"C:\Users\Public", seen.Add);
        var request = await server.ReadRequestAsync();
        Assert.Equal(Protocol.ListDirectoryMethod, request.Method);
        var parameters = Assert.IsType<JsonElement>(request.Params);
        Assert.Equal(@"C:\Users\Public", parameters.GetProperty("path").GetString());

        await server.SendNotificationAsync(
            Protocol.ListDirectoryChunkEvent,
            new DirectoryListingChunkNotification
            {
                RequestId = request.Id + 99,
                Path = @"C:\other",
                Entries = [],
                ChunkIndex = 0,
                Done = true,
            });
        await server.SendNotificationAsync(
            Protocol.ListDirectoryChunkEvent,
            new DirectoryListingChunkNotification
            {
                RequestId = request.Id,
                Path = @"C:\Users\Public",
                Parent = @"C:\Users",
                Entries =
                [
                    new FileEntry { Name = "notes.txt", Path = @"C:\Users\Public\notes.txt", Extension = "txt" },
                ],
                ChunkIndex = 0,
                Done = true,
            });
        await server.SendResultAsync(
            request.Id,
            new DirectoryListing
            {
                Path = @"C:\Users\Public",
                Parent = @"C:\Users",
                Entries =
                [
                    new FileEntry { Name = "notes.txt", Path = @"C:\Users\Public\notes.txt", Extension = "txt" },
                ],
            });

        var listing = await listingTask;
        Assert.Equal(@"C:\Users\Public", listing.Path);
        Assert.Single(listing.Entries);
        Assert.Single(seen);
        Assert.True(seen[0].Done);
        Assert.Equal("notes.txt", seen[0].Entries[0].Name);
    }

    [Fact]
    public async Task On_DeliversNotificationsAndUnsubscribeStopsThem()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var seen = new List<string>();
        using (client.On<FileChangeEvent>(Protocol.FileChangeEvent, change => seen.Add(change.Path)))
        {
            var invoke = client.HealthAsync();
            var request = await server.ReadRequestAsync();
            await server.SendNotificationAsync(
                Protocol.FileChangeEvent,
                new FileChangeEvent { Path = @"C:\a.txt", Kind = "create" });
            await server.SendResultAsync(request.Id, new HealthResult { Ok = true, ProtocolVersion = 1 });
            await invoke;
        }

        var after = client.HealthAsync();
        var afterRequest = await server.ReadRequestAsync();
        await server.SendNotificationAsync(
            Protocol.FileChangeEvent,
            new FileChangeEvent { Path = @"C:\b.txt", Kind = "modify" });
        await server.SendResultAsync(afterRequest.Id, new HealthResult { Ok = true, ProtocolVersion = 1 });
        await after;

        Assert.Equal([@"C:\a.txt"], seen);
    }

    [Fact]
    public async Task Cancellation_AbandonsAwaitWithoutSendingCancel()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        using var cancelled = new CancellationTokenSource();
        var invoke = client.GetHomeDirAsync(cancelled.Token);
        var request = await server.ReadRequestAsync();
        Assert.Equal(Protocol.GetHomeDirMethod, request.Method);

        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => invoke);
        Assert.Equal(0, client.InFlightCount);

        await server.SendResultAsync(request.Id, @"C:\Users\test");

        var next = client.GetAppVersionAsync();
        var nextRequest = await server.ReadRequestAsync();
        Assert.Equal(Protocol.GetAppVersionMethod, nextRequest.Method);
        Assert.NotEqual(request.Id, nextRequest.Id);
        await server.SendResultAsync(nextRequest.Id, "1.1.0");
        Assert.Equal("1.1.0", await next);
    }

    [Fact]
    public async Task TypedErrors_PreserveCodeAndMessage()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var conflict = client.InvokeAsync<string>("copy_entry", new { });
        var conflictRequest = await server.ReadRequestAsync();
        await server.SendErrorAsync(
            conflictRequest.Id,
            Protocol.ErrApplication,
            "CONFLICT: destination already exists: C:\\dest\\copy.txt");
        var conflictError = await Assert.ThrowsAsync<IpcException>(() => conflict);
        Assert.True(conflictError.IsConflict);
        Assert.Equal(Protocol.ErrApplication, conflictError.Code);
        Assert.StartsWith("CONFLICT:", conflictError.Message, StringComparison.Ordinal);

        var hostOwned = client.SelectDirectoryAsync();
        var hostRequest = await server.ReadRequestAsync();
        Assert.Equal(Protocol.SelectDirectoryMethod, hostRequest.Method);
        await server.SendErrorAsync(hostRequest.Id, Protocol.ErrHostOwned, "HOST_OWNED: select_directory");
        var hostError = await Assert.ThrowsAsync<IpcException>(() => hostOwned);
        Assert.True(hostError.IsHostOwned);
        Assert.Equal(Protocol.ErrHostOwned, hostError.Code);
    }

    [Fact]
    public async Task Disconnect_FailsInFlightAndRaisesEvent()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;

        var disconnected = new TaskCompletionSource<Exception?>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.Disconnected += (_, error) => disconnected.TrySetResult(error);

        var invoke = client.GetHomeDirAsync();
        _ = await server.ReadRequestAsync();
        await server.DisposeAsync();

        var error = await Assert.ThrowsAsync<IpcException>(() => invoke);
        Assert.Equal(IpcErrorKind.Transport, error.Kind);
        Assert.False(client.IsConnected);
        await disconnected.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await client.DisposeAsync();
    }

    [Fact]
    public async Task ShutdownAndShowMainWindow_AcceptNullResult()
    {
        var (server, client) = await FakeIpcServer.ConnectAsync();
        await using var serverLifetime = server;
        await using var clientLifetime = client;

        var shutdown = client.ShutdownAsync();
        var shutdownRequest = await server.ReadRequestAsync();
        Assert.Equal(Protocol.ShutdownMethod, shutdownRequest.Method);
        await server.SendResultAsync(shutdownRequest.Id, null);
        await shutdown;

        var show = client.ShowMainWindowAsync();
        var showRequest = await server.ReadRequestAsync();
        Assert.Equal(Protocol.ShowMainWindowMethod, showRequest.Method);
        await server.SendResultAsync(showRequest.Id, null);
        await show;
    }
}
