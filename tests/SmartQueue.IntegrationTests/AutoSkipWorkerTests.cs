using System.Net;
using System.Text.Json;
using SmartQueue.Api.Tickets;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Public-boundary tests for the durable auto-Skip worker: real PostgreSQL, real HTTP endpoints, the real
/// <see cref="AutoSkipWorker"/> and a controllable server clock. No internal status setter is used, so the
/// assertions describe what an Owner console and a Customer Ticket link actually observe.
/// </summary>
public sealed class AutoSkipWorkerTests : IAsyncLifetime
{
    private const double OneSecond = 1d / 60d;
    private const double ThreeSeconds = 0.05d;

    private readonly SmartQueueCluster cluster = new();

    public Task InitializeAsync() => cluster.InitializeAsync();
    public Task DisposeAsync() => cluster.DisposeAsync();

    [Fact]
    public async Task Called_ticket_is_auto_skipped_only_when_its_deadline_arrives()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var ticket = await CallTicketAsync(owner.Api, "Deadline shop", ThreeSeconds);
        var guest = cluster.Host.CreateClient();

        var called = await CustomerAsync(guest, ticket.Link);
        Assert.Equal("Called", Text(called, "status"));
        // The countdown anchors on the server: server time is the test host's clock and the deadline is the
        // Service's Call timeout after it, never the device clock.
        var serverTime = called.GetProperty("serverTime").GetDateTimeOffset();
        Assert.Equal(cluster.Clock.GetUtcNow(), serverTime);
        Assert.InRange(called.GetProperty("deadline").GetDateTimeOffset() - serverTime, TimeSpan.FromSeconds(2.5), TimeSpan.FromSeconds(3.5));
        Assert.Equal(JsonValueKind.Null, called.GetProperty("endReason").ValueKind);

        // One and two intervals before the deadline a sweep has completed, and the Ticket is still Called.
        await cluster.AdvanceAsync();
        Assert.Equal("Called", Text(await CustomerAsync(guest, ticket.Link), "status"));
        await cluster.AdvanceAsync();
        Assert.Equal("Called", Text(await CustomerAsync(guest, ticket.Link), "status"));

        // At its deadline the same sweep decides the single committed transition.
        await cluster.AdvanceAsync();
        var skipped = await CustomerAsync(guest, ticket.Link);
        Assert.Equal("Skipped", Text(skipped, "status"));
        Assert.Equal(AutoSkipWorker.Reason, Text(skipped, "endReason"));
        Assert.Equal(ticket.Version + 1, skipped.GetProperty("version").GetInt64());
        Assert.Equal(JsonValueKind.String, skipped.GetProperty("endedAt").ValueKind);

        // The Shop-wide hold and the device quota are released, so the Owner can Call and the Customer can rejoin.
        Assert.Equal(JsonValueKind.Null, (await ConsoleAsync(owner.Api, ticket)).GetProperty("held").ValueKind);
        var rejoined = await owner.Api.PostAsync($"/api/queues/{ticket.QueueId}/tickets", new { requestId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Created, rejoined.Status);

        var ready = await ConsoleAsync(owner.Api, ticket);
        var next = await owner.Api.PostAsync($"/api/queues/{ticket.QueueId}/call", new { version = ready.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, next.Status);
        Assert.Equal("Called", Text(next.Body, "status"));
    }

    [Fact]
    public async Task A_due_called_ticket_is_skipped_after_the_worker_process_restarts()
    {
        var host = cluster.Host;
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(host);
        var ticket = await CallTicketAsync(owner.Api, "Restart shop", ThreeSeconds);
        Assert.Equal("Called", Text(await CustomerAsync(host.CreateClient(), ticket.Link), "status"));

        // Restart before the deadline: the new process must find the durable Called Ticket on its own.
        await cluster.RemoveHostAsync(host);
        var restarted = await cluster.AddHostAsync();

        await cluster.AdvanceAsync(3);
        var skipped = await CustomerAsync(restarted.CreateClient(), ticket.Link);
        Assert.Equal("Skipped", Text(skipped, "status"));
        Assert.Equal(AutoSkipWorker.Reason, Text(skipped, "endReason"));
        Assert.Equal(ticket.Version + 1, skipped.GetProperty("version").GetInt64());

        // The restarted process also released the Shop, so the Owner signs back in and Calls the next Ticket.
        var api = await SmartQueueScenario.SignInAsync(restarted, owner.Email);
        Assert.Equal(JsonValueKind.Null, (await ConsoleAsync(api, ticket)).GetProperty("held").ValueKind);
    }

    [Fact]
    public async Task Two_workers_over_one_database_skip_a_due_ticket_exactly_once()
    {
        var first = cluster.Host;
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(first);
        var ticket = await CallTicketAsync(owner.Api, "Two worker shop", ThreeSeconds);
        var second = await cluster.AddHostAsync();

        await cluster.AdvanceAsync(3);

        // Both instances swept the same database; the loser must have committed no transition or side effect.
        var skipped = await CustomerAsync(second.CreateClient(), ticket.Link);
        Assert.Equal("Skipped", Text(skipped, "status"));
        Assert.Equal(AutoSkipWorker.Reason, Text(skipped, "endReason"));
        Assert.Equal(ticket.Version + 1, skipped.GetProperty("version").GetInt64());

        await cluster.AdvanceAsync(2);
        var settled = await CustomerAsync(second.CreateClient(), ticket.Link);
        Assert.Equal(ticket.Version + 1, settled.GetProperty("version").GetInt64());
        Assert.Equal(AutoSkipWorker.Reason, Text(settled, "endReason"));
        Assert.Equal(JsonValueKind.Null, (await ConsoleAsync(owner.Api, ticket)).GetProperty("held").ValueKind);
    }

    [Fact]
    public async Task A_ticket_that_reached_inservice_is_never_skipped_by_the_deadline()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var ticket = await CallTicketAsync(owner.Api, "Started service shop", ThreeSeconds);
        var guest = cluster.Host.CreateClient();

        await cluster.AdvanceAsync();
        var start = await owner.Api.PostAsync($"/api/tickets/{ticket.Id}/start", new { version = ticket.Version });
        Assert.Equal(HttpStatusCode.OK, start.Status);
        Assert.Equal("InService", Text(start.Body, "status"));
        var startedVersion = start.Body.GetProperty("version").GetInt64();

        // Sweeps continue well past the Call deadline; service work must survive all of them.
        await cluster.AdvanceAsync(4);
        var settled = await CustomerAsync(guest, ticket.Link);
        Assert.Equal("InService", Text(settled, "status"));
        Assert.Equal(startedVersion, settled.GetProperty("version").GetInt64());
        Assert.Equal(JsonValueKind.Null, settled.GetProperty("endReason").ValueKind);

        // There is no automatic Complete either: the Owner still finishes the work explicitly.
        var complete = await owner.Api.PostAsync($"/api/tickets/{ticket.Id}/complete", new { version = startedVersion });
        Assert.Equal(HttpStatusCode.OK, complete.Status);
        Assert.Equal("Completed", Text(complete.Body, "status"));
    }

    [Fact]
    public async Task A_start_that_loses_to_the_deadline_is_refused_with_fresh_state()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var ticket = await CallTicketAsync(owner.Api, "Timeout wins shop", ThreeSeconds);
        var guest = cluster.Host.CreateClient();

        await cluster.AdvanceAsync(3);
        Assert.Equal("Skipped", Text(await CustomerAsync(guest, ticket.Link), "status"));

        var start = await owner.Api.PostAsync($"/api/tickets/{ticket.Id}/start", new { version = ticket.Version });
        Assert.Equal(HttpStatusCode.Conflict, start.Status);
        Assert.Equal("ticket_changed", Text(start.Body, "code"));
        Assert.Equal("Skipped", Text(start.Body, "current", "status"));

        var settled = await CustomerAsync(guest, ticket.Link);
        Assert.Equal("Skipped", Text(settled, "status"));
        Assert.Equal(ticket.Version + 1, settled.GetProperty("version").GetInt64());
    }

    [Fact]
    public async Task A_start_racing_the_deadline_leaves_exactly_one_winning_transition()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var ticket = await CallTicketAsync(owner.Api, "Race shop", OneSecond);
        var guest = cluster.Host.CreateClient();

        // The next sweep fires at the deadline while the Start uses the version observed before it.
        var start = await cluster.AdvanceWhileAsync(() => owner.Api.PostAsync($"/api/tickets/{ticket.Id}/start", new { version = ticket.Version }));

        if (start.Status == HttpStatusCode.OK)
        {
            Assert.Equal("InService", Text(start.Body, "status"));
            await cluster.AdvanceAsync(3);
            var settled = await CustomerAsync(guest, ticket.Link);
            Assert.Equal("InService", Text(settled, "status"));
            Assert.Equal(start.Body.GetProperty("version").GetInt64(), settled.GetProperty("version").GetInt64());
            Assert.Equal(JsonValueKind.Null, settled.GetProperty("endReason").ValueKind);
        }
        else
        {
            Assert.Equal(HttpStatusCode.Conflict, start.Status);
            var settled = await CustomerAsync(guest, ticket.Link);
            Assert.Equal("Skipped", Text(settled, "status"));
            Assert.Equal(ticket.Version + 1, settled.GetProperty("version").GetInt64());
        }
    }

    private static async Task<JsonElement> ConsoleAsync(SmartQueueClient owner, CalledTicket ticket) =>
        await owner.GetAsync($"/api/shops/{ticket.ShopId}/console?queueId={ticket.QueueId}");

    /// <summary>Creates a Shop with one Service, opens its Queue, joins a Ticket and Calls it.</summary>
    private static async Task<CalledTicket> CallTicketAsync(SmartQueueClient owner, string shopName, double timeoutMinutes)
    {
        var shop = await owner.PostAsync("/api/shops", new { name = shopName });
        Assert.Equal(HttpStatusCode.Created, shop.Status);
        var shopId = shop.Body.GetProperty("id").GetGuid();

        var service = await owner.PostAsync($"/api/shops/{shopId}/services", new { name = "Cut", prefix = "A", callTimeoutMinutes = timeoutMinutes, nearTurnThreshold = 2 });
        Assert.Equal(HttpStatusCode.Created, service.Status);
        var queueId = service.Body.GetProperty("queue").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/queues/{queueId}/open", null)).Status);

        var joined = await owner.PostAsync($"/api/queues/{queueId}/tickets", new { requestId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Created, joined.Status);
        var link = joined.Body.GetProperty("link").GetString()!;

        var console = await owner.GetAsync($"/api/shops/{shopId}/console?queueId={queueId}");
        var call = await owner.PostAsync($"/api/queues/{queueId}/call", new { version = console.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, call.Status);
        Assert.Equal("Called", Text(call.Body, "status"));
        Assert.NotEqual(JsonValueKind.Null, call.Body.GetProperty("deadline").ValueKind);
        return new CalledTicket(
            call.Body.GetProperty("id").GetGuid(),
            shopId,
            queueId,
            link,
            call.Body.GetProperty("version").GetInt64());
    }

    private static async Task<JsonElement> CustomerAsync(HttpClient guest, string link)
    {
        using var response = await guest.GetAsync($"/api{link}");
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"Customer Ticket view returned {(int)response.StatusCode}: {text}");
        using var document = JsonDocument.Parse(text);
        return document.RootElement.Clone();
    }

    private static string? Text(JsonElement element, params string[] path)
    {
        foreach (var name in path) element = element.GetProperty(name);
        return element.ValueKind == JsonValueKind.Null ? null : element.GetString();
    }

    private sealed record CalledTicket(Guid Id, Guid ShopId, Guid QueueId, string Link, long Version);
}
