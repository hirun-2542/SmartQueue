using System.Net;
using System.Text.Json;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Public-boundary tests for the Queue close and Business day rules against a real PostgreSQL database and a
/// controllable server clock. Time is moved only through <see cref="SmartQueueCluster"/> and every assertion
/// is read over HTTP, so the tests prove what a Customer and an Owner can actually observe: a number that does
/// not restart at Bangkok midnight, a Business day that ends when the Queue closes, and a closing timestamp
/// taken from the server's own clock.
/// </summary>
public sealed class ClosingBusinessDayTests : IAsyncLifetime
{
    // 16:30 UTC is 23:30 in Asia/Bangkok, so a two hour jump crosses the Bangkok midnight boundary.
    private static readonly DateTimeOffset Evening = new(2027, 2, 4, 16, 30, 0, TimeSpan.Zero);

    private readonly SmartQueueCluster cluster = new(now: Evening);

    public Task InitializeAsync() => cluster.InitializeAsync();
    public Task DisposeAsync() => cluster.DisposeAsync();

    [Fact]
    public async Task An_overnight_shift_keeps_one_business_day_and_counter_until_the_queue_closes_and_reopens()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Overnight shop");
        var queueId = await OpenQueueAsync(owner.Api, shopId, "A");
        var firstDay = await BusinessDayAsync(owner.Api, shopId);
        Assert.Equal(Evening, cluster.Clock.GetUtcNow());

        var first = await JoinAsync(owner.Api, queueId);
        Assert.Equal("A001", Text(first, "ticket", "number"));

        // 23:30 becomes 01:30 the next Bangkok calendar day with no Owner action at all.
        cluster.Jump(TimeSpan.FromHours(2));
        var afterMidnight = await JoinAsync(owner.Api, queueId);
        Assert.Equal("A002", Text(afterMidnight, "ticket", "number"));
        Assert.Equal(firstDay, await BusinessDayAsync(owner.Api, shopId));
        Assert.Equal("Open", await QueueStatusAsync(owner.Api, shopId));

        var stopped = await owner.Api.PostAsync($"/api/queues/{queueId}/stop", new { version = await ConsoleVersionAsync(owner.Api, shopId, queueId) });
        Assert.Equal(HttpStatusCode.OK, stopped.Status);
        Assert.Equal("Closing", Text(stopped.Body, "status"));
        Assert.Equal(JsonValueKind.Null, stopped.Body.GetProperty("businessDayClosedAt").ValueKind);

        await CompleteNextAsync(owner.Api, shopId, queueId);
        Assert.Equal("Closing", await QueueStatusAsync(owner.Api, shopId));
        await CompleteNextAsync(owner.Api, shopId, queueId);
        Assert.Equal("Closed", await QueueStatusAsync(owner.Api, shopId));

        var reopened = await owner.Api.PostAsync($"/api/queues/{queueId}/open", null);
        Assert.Equal(HttpStatusCode.OK, reopened.Status);
        var secondDay = reopened.Body.GetProperty("businessDayId").GetGuid();
        Assert.NotEqual(firstDay, secondDay);

        var third = await JoinAsync(owner.Api, queueId);
        Assert.Equal("A001", Text(third, "ticket", "number"));
        Assert.NotEqual(Text(first, "ticket", "id"), Text(third, "ticket", "id"));
    }

    [Fact]
    public async Task Ending_a_closed_queue_stamps_the_business_day_with_the_controlled_server_clock()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Clock shop");
        var queueId = await OpenQueueAsync(owner.Api, shopId, "B");

        cluster.Jump(TimeSpan.FromMinutes(7));
        var expected = cluster.Clock.GetUtcNow();
        var stopped = await owner.Api.PostAsync($"/api/queues/{queueId}/stop", new { version = await ConsoleVersionAsync(owner.Api, shopId, queueId) });
        Assert.Equal(HttpStatusCode.OK, stopped.Status);
        Assert.Equal("Closed", Text(stopped.Body, "status"));
        Assert.Equal(expected, stopped.Body.GetProperty("businessDayClosedAt").GetDateTimeOffset());
    }

    private static async Task<Guid> CreateShopAsync(SmartQueueClient owner, string name)
    {
        var shop = await owner.PostAsync("/api/shops", new { name });
        Assert.Equal(HttpStatusCode.Created, shop.Status);
        return shop.Body.GetProperty("id").GetGuid();
    }

    private static async Task<Guid> OpenQueueAsync(SmartQueueClient owner, Guid shopId, string prefix)
    {
        var service = await owner.PostAsync($"/api/shops/{shopId}/services", new { name = "Cut", prefix, callTimeoutMinutes = 600, nearTurnThreshold = 2 });
        Assert.Equal(HttpStatusCode.Created, service.Status);
        var queueId = service.Body.GetProperty("queue").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/queues/{queueId}/open", null)).Status);
        return queueId;
    }

    /// <summary>Joins from the Owner's own device, so the extra-Ticket confirmation is always supplied.</summary>
    private static async Task<JsonElement> JoinAsync(SmartQueueClient owner, Guid queueId)
    {
        var joined = await owner.PostAsync($"/api/queues/{queueId}/tickets", new { requestId = Guid.NewGuid(), confirmExtra = true });
        Assert.Equal(HttpStatusCode.Created, joined.Status);
        return joined.Body;
    }

    private static async Task CompleteNextAsync(SmartQueueClient owner, Guid shopId, Guid queueId)
    {
        var call = await owner.PostAsync($"/api/queues/{queueId}/call",new{});
        Assert.Equal(HttpStatusCode.OK, call.Status);
        var ticketId = call.Body.GetProperty("id").GetGuid();
        var start = await owner.PostAsync($"/api/tickets/{ticketId}/start", new { version = call.Body.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, start.Status);
        var complete = await owner.PostAsync($"/api/tickets/{ticketId}/complete", new { version = start.Body.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, complete.Status);
    }

    private static async Task<long> ConsoleVersionAsync(SmartQueueClient owner, Guid shopId, Guid queueId)
        => (await owner.GetAsync($"/api/shops/{shopId}/console?queueId={queueId}")).GetProperty("version").GetInt64();

    private static async Task<string> QueueStatusAsync(SmartQueueClient owner, Guid shopId)
        => (await owner.GetAsync($"/api/shops/{shopId}")).GetProperty("services")[0].GetProperty("queue").GetProperty("status").GetString()!;

    private static async Task<Guid?> BusinessDayAsync(SmartQueueClient owner, Guid shopId)
        => (await owner.GetAsync($"/api/shops/{shopId}")).GetProperty("services")[0].GetProperty("queue").GetProperty("businessDayId").GetGuid();

    private static string? Text(JsonElement element, params string[] path)
    {
        foreach (var name in path) element = element.GetProperty(name);
        return element.ValueKind == JsonValueKind.Null ? null : element.GetString();
    }
}
