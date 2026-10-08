using System.Net;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SmartQueue.Api.Push;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// The VAPID identity rules. Outside Development no identity may be invented: the operator supplies the pair,
/// and an incomplete or malformed pair is refused at startup instead of silently disabling notifications or
/// generating a throwaway key. These assertions cover configuration only; the identity's runtime behaviour is
/// proven over HTTP by <see cref="VapidIdentityTests"/>.
/// </summary>
public sealed class VapidConfigurationTests
{
    [Fact]
    public void An_identity_outside_development_must_be_configured_explicitly_and_completely()
    {
        Assert.False(VapidKeys.Resolve(new PushOptions(), development: false).Configured);

        var pair = TestVapid.Pair();
        Assert.Throws<InvalidOperationException>(() => VapidKeys.Resolve(new PushOptions { PublicKey = pair.Public }, development: false));
        Assert.Throws<InvalidOperationException>(() => VapidKeys.Resolve(new PushOptions { PublicKey = "not-a-key", PrivateKey = pair.Private }, development: false));
        Assert.Throws<InvalidOperationException>(() => VapidKeys.Resolve(new PushOptions { PublicKey = pair.Public, PrivateKey = "short" }, development: false));

        var configured = VapidKeys.Resolve(new PushOptions { PublicKey = pair.Public, PrivateKey = pair.Private }, development: false);
        Assert.True(configured.Configured);
        Assert.Equal(pair.Public, configured.PublicKey);
        Assert.Equal(pair.Private, configured.PrivateKey);
    }
}

/// <summary>
/// Development must generate one real ECDSA P-256 pair, persist it with owner-only permissions and reuse that
/// same pair from every instance, because a browser subscription is bound to the application server key that
/// created it. Both instances here are real API hosts over one database, and the key is read back over HTTP.
/// </summary>
public sealed class VapidIdentityTests : IAsyncLifetime
{
    private readonly string path = Path.Combine(Path.GetTempPath(), $"smartqueue-vapid-{Guid.NewGuid():N}.json");
    private readonly TestPushSink sink = new();
    private readonly SmartQueueCluster cluster;

    public VapidIdentityTests()
    {
        cluster = new SmartQueueCluster(
            configureServices: services =>
            {
                services.RemoveAll<IPushDelivery>();
                services.AddSingleton<IPushDelivery>(sink);
            },
            settings: new Dictionary<string, string?> { ["Push:VapidKeyPath"] = path, ["Push:Subject"] = "mailto:push-tests@example.test" });
    }

    public Task InitializeAsync() => cluster.InitializeAsync();

    public async Task DisposeAsync()
    {
        await cluster.DisposeAsync();
        File.Delete(path);
    }

    [Fact]
    public async Task Development_generates_one_persisted_identity_that_every_instance_shares()
    {
        var first = await PublicKeyAsync(cluster.Host);
        Assert.True(File.Exists(path), "the generated VAPID identity must be persisted for the next instance");
        if (!OperatingSystem.IsWindows())
            Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(path));

        var second = await cluster.AddHostAsync();
        Assert.Equal(first, await PublicKeyAsync(second));

        // Reading the opt-in state is not a notification.
        Assert.Empty(sink.Captured);
    }

    private static async Task<string> PublicKeyAsync(SmartQueueFactory host)
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(host);
        var shop = await owner.Api.PostAsync("/api/shops", new { name = "VAPID shop" });
        Assert.Equal(HttpStatusCode.Created, shop.Status);
        var shopId = shop.Body.GetProperty("id").GetGuid();
        var service = await owner.Api.PostAsync($"/api/shops/{shopId}/services", new { name = "Cut", prefix = "A", callTimeoutMinutes = 10, nearTurnThreshold = 2 });
        Assert.Equal(HttpStatusCode.Created, service.Status);
        var queueId = service.Body.GetProperty("queue").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await owner.Api.PostAsync($"/api/queues/{queueId}/open", null)).Status);
        var guest = new SmartQueueClient(host.CreateClient());
        await guest.SessionAsync();
        var joined = await guest.PostAsync($"/api/queues/{queueId}/tickets", new { requestId = Guid.NewGuid(), confirmExtra = true });
        Assert.Equal(HttpStatusCode.Created, joined.Status);
        var link = joined.Body.GetProperty("link").GetString()!;

        var state = await guest.GetAsync($"/api{link}/push");
        var key = state.GetProperty("publicKey").GetString();
        Assert.NotNull(key);
        Assert.Equal(65, WebEncoders.Base64UrlDecode(key!).Length);
        return key!;
    }
}
