using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SmartQueue.Api.Push;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Public-boundary tests for optional Web Push: the real API over real PostgreSQL with a controllable server
/// clock, driven only through HTTP. Delivery is observed through the test sink, which proves the notification
/// policy — when an event is produced, what it carries, what it must never carry and what happens when the
/// push service refuses it. The sink proves policy, not arrival: real device delivery is a separate browser
/// smoke on a supported platform.
/// </summary>
public sealed class WebPushTests : IAsyncLifetime
{
    private const int Threshold = 2;

    private readonly TestPushSink sink = new();
    private readonly SmartQueueCluster cluster;

    public WebPushTests()
    {
        cluster = new SmartQueueCluster(
            configureServices: services =>
            {
                services.RemoveAll<IPushDelivery>();
                services.AddSingleton<IPushDelivery>(sink);
            },
            settings: TestVapid.Settings());
    }

    public Task InitializeAsync() => cluster.InitializeAsync();
    public Task DisposeAsync() => cluster.DisposeAsync();

    [Fact]
    public async Task Opt_in_requires_a_valid_ticket_link_trusted_provider_keys_and_never_changes_the_ticket()
    {
        var (_, _, queueId) = await OpenShopAsync("Opt-in shop");
        var guest = await JoinAsync(queueId);

        var state = await guest.Client.GetAsync($"/api{guest.Link}/push");
        Assert.False(state.GetProperty("enabled").GetBoolean());
        Assert.Equal(guest.TicketId, state.GetProperty("ticketId").GetGuid());
        var point = WebEncoders.Base64UrlDecode(state.GetProperty("publicKey").GetString()!);
        Assert.Equal(65, point.Length);
        Assert.Equal(0x04, point[0]);

        // The endpoint is an outbound destination, so every untrusted shape is refused before it is stored.
        var keys = TestPushClient.Keys();
        foreach (var endpoint in new[]
        {
            "http://fcm.googleapis.com/fcm/send/x",
            "https://user:pass@fcm.googleapis.com/fcm/send/x",
            "https://fcm.googleapis.com:8443/fcm/send/x",
            "https://evil.example/fcm/send/x",
            "https://127.0.0.1/fcm/send/x",
            "https://fcm.googleapis.com.evil.example/fcm/send/x",
        })
        {
            var refused = await guest.Client.PostAsync($"/api{guest.Link}/push", new { endpoint, p256dh = keys.P256dh, auth = keys.Auth, language = "th" });
            Assert.Equal(HttpStatusCode.BadRequest, refused.Status);
            Assert.Equal("push_endpoint_invalid", refused.Body.GetProperty("code").GetString());
        }

        var badKeys = await guest.Client.PostAsync($"/api{guest.Link}/push", new { endpoint = TestPushClient.Endpoint(), p256dh = "AAAA", auth = "AAAA", language = "th" });
        Assert.Equal(HttpStatusCode.BadRequest, badKeys.Status);
        Assert.Equal("push_keys_invalid", badKeys.Body.GetProperty("code").GetString());

        var unknown = await guest.Client.PostAsync($"/api/t/{new string('a', 43)}/push", new { endpoint = TestPushClient.Endpoint(), p256dh = keys.P256dh, auth = keys.Auth, language = "th" });
        Assert.Equal(HttpStatusCode.NotFound, unknown.Status);

        Assert.Equal(HttpStatusCode.OK, await SubscribeAsync(guest, TestPushClient.Endpoint()));
        Assert.True(await PushEnabledAsync(guest));

        // Opt-in is not a Ticket change and not a notification: it only records the association.
        var ticket = await SmartQueueScenario.TicketViewAsync(cluster.Host.CreateClient(), guest.Link);
        Assert.Equal("Waiting", ticket.GetProperty("status").GetString());
        Assert.Empty(await sink.SettleAsync());
    }

    [Fact]
    public async Task Near_turn_fires_once_on_the_threshold_crossing_and_never_for_a_ticket_that_joined_inside_it()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Near turn shop");
        var first = await JoinAndSubscribeAsync(queueId);
        var second = await JoinAndSubscribeAsync(queueId);
        var third = await JoinAndSubscribeAsync(queueId);
        var fourth = await JoinAndSubscribeAsync(queueId);

        // None of them joined outside the threshold, and none of them is notified just for being issued.
        Assert.Empty(await sink.SettleAsync());

        // Calling the head moves every position down one and crosses the threshold for the fourth Ticket only.
        await CallAsync(owner, shopId, queueId);
        var delivered = await sink.WaitAsync(2);
        Assert.Equal(2, delivered.Length);
        Assert.Contains(delivered, x => x.TicketId == first.TicketId && x.Event == PushEvents.Called);
        Assert.Contains(delivered, x => x.TicketId == fourth.TicketId && x.Event == PushEvents.NearTurn);
        Assert.DoesNotContain(delivered, x => x.TicketId == second.TicketId || x.TicketId == third.TicketId);

        // Moving the same Ticket through several further positions is not several notifications.
        await CompleteAsync(owner, first);
        await CancelAsync(second);
        await CancelAsync(third);
        var after = await sink.SettleAsync();
        Assert.Equal(2, after.Length);
        Assert.Single(after, x => x.TicketId == fourth.TicketId && x.Event == PushEvents.NearTurn);

        var view = await SmartQueueScenario.TicketViewAsync(cluster.Host.CreateClient(), fourth.Link);
        Assert.Equal("Waiting", view.GetProperty("status").GetString());
        Assert.Equal(0, view.GetProperty("ticketsAhead").GetInt32());
    }

    [Fact]
    public async Task Terminal_withdraws_only_its_own_association_and_a_shared_endpoint_keeps_notifying_the_other_ticket()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Shared endpoint shop");
        var endpoint = TestPushClient.Endpoint();
        var held = await JoinAndSubscribeAsync(queueId, endpoint);
        var other = await JoinAndSubscribeAsync(queueId, endpoint);

        await CallAsync(owner, shopId, queueId);
        var called = await sink.WaitAsync(1);
        Assert.Single(called);
        Assert.Equal((held.TicketId, PushEvents.Called), (called[0].TicketId, called[0].Event));
        Assert.Equal(endpoint, called[0].Target.Endpoint);

        // Cancelling the Called Ticket withdraws only that Ticket's association.
        await CancelAsync(held);
        Assert.False(await PushEnabledAsync(held));
        Assert.True(await PushEnabledAsync(other));
        Assert.Single(await sink.SettleAsync());

        // The Ticket still on that endpoint keeps being notified.
        await CallAsync(owner, shopId, queueId);
        var remaining = await sink.WaitAsync(2);
        Assert.Equal(2, remaining.Length);
        Assert.Equal((other.TicketId, PushEvents.Called), (remaining[1].TicketId, remaining[1].Event));
        Assert.Equal(endpoint, remaining[1].Target.Endpoint);
    }

    [Fact]
    public async Task Drop_notifies_from_the_captured_subscription_then_leaves_no_association_to_notify_again()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Drop shop");
        var called = await JoinAndSubscribeAsync(queueId);
        var waiting = await JoinAndSubscribeAsync(queueId);

        await CallAsync(owner, shopId, queueId);
        Assert.Single(await sink.WaitAsync(1));

        var console = await owner.Api.GetAsync($"/api/shops/{shopId}/console?queueId={queueId}");
        var drop = await owner.Api.PostAsync($"/api/queues/{queueId}/drop", new { version = console.GetProperty("version").GetInt64(), confirm = true });
        Assert.Equal(HttpStatusCode.OK, drop.Status);

        var delivered = await sink.WaitAsync(2);
        Assert.Equal(2, delivered.Length);
        Assert.Contains(delivered, x => x.TicketId == waiting.TicketId && x.Event == PushEvents.Dropped);
        Assert.Equal(called.TicketId, delivered[0].TicketId);

        // The Dropped Ticket no longer has anything left to notify, and cannot opt in again.
        Assert.False(await PushEnabledAsync(waiting));
        var again = await waiting.Client.PostAsync($"/api{waiting.Link}/push", new { endpoint = waiting.Endpoint, p256dh = waiting.P256dh, auth = waiting.Auth, language = "th" });
        Assert.Equal(HttpStatusCode.Conflict, again.Status);
        Assert.Equal("ticket_ended", again.Body.GetProperty("code").GetString());

        var held = await PushEnabledAsync(called);
        Assert.True(held);
        Assert.Equal(2, (await sink.SettleAsync()).Length);
    }

    [Fact]
    public async Task A_rolled_back_or_conflicting_operation_delivers_nothing()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Rollback shop");
        var ticket = await JoinAndSubscribeAsync(queueId);

        // A stale Shop version is refused, so the transition never committed and nothing may be notified.
        var version = await ConsoleVersionAsync(owner, shopId, queueId);
        var stale = await owner.Api.PostAsync($"/api/queues/{queueId}/call", new { version = version - 1 });
        Assert.Equal(HttpStatusCode.Conflict, stale.Status);
        Assert.Equal("state_changed", stale.Body.GetProperty("code").GetString());
        Assert.Empty(await sink.SettleAsync());
        Assert.Equal("Waiting", (await SmartQueueScenario.TicketViewAsync(cluster.Host.CreateClient(), ticket.Link)).GetProperty("status").GetString());

        var committed = await owner.Api.PostAsync($"/api/queues/{queueId}/call", new { version });
        Assert.Equal(HttpStatusCode.OK, committed.Status);
        var delivered = await sink.WaitAsync(1);
        Assert.Single(delivered);
        Assert.Equal((ticket.TicketId, PushEvents.Called), (delivered[0].TicketId, delivered[0].Event));
        Assert.Single(await sink.SettleAsync());
    }

    [Fact]
    public async Task A_failed_delivery_or_an_explicit_unsubscribe_never_rolls_back_the_ticket()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Failure shop");
        var ticket = await JoinAndSubscribeAsync(queueId);

        // The push service rejects the delivery while the Ticket transition must still commit.
        sink.Fail = true;
        var calledId = await CallAsync(owner, shopId, queueId);
        Assert.Equal(ticket.TicketId, calledId);
        var called = await SmartQueueScenario.TicketViewAsync(cluster.Host.CreateClient(), ticket.Link);
        Assert.Equal("Called", called.GetProperty("status").GetString());
        Assert.Single(await sink.SettleAsync());

        sink.Fail = false;

        // Turning notifications off is a normal Ticket operation and leaves the Ticket usable.
        var removed = await ticket.Client.PostAsync($"/api{ticket.Link}/push/remove", new { endpoint = ticket.Endpoint });
        Assert.Equal(HttpStatusCode.OK, removed.Status);
        Assert.False(await PushEnabledAsync(ticket));
        var started = await owner.Api.PostAsync($"/api/tickets/{ticket.TicketId}/start", new { version = called.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, started.Status);
        var completed = await owner.Api.PostAsync($"/api/tickets/{ticket.TicketId}/complete", new { version = started.Body.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, completed.Status);

        // A Customer who never opted in keeps using the Queue normally.
        var quiet = await JoinAsync(queueId);
        var quietCalled = await CallAsync(owner, shopId, queueId);
        Assert.Equal(quiet.TicketId, quietCalled);
        Assert.Equal("Called", (await SmartQueueScenario.TicketViewAsync(cluster.Host.CreateClient(), quiet.Link)).GetProperty("status").GetString());
        Assert.False(await PushEnabledAsync(quiet));
        Assert.Single(sink.Captured);
    }

    [Fact]
    public async Task The_payload_carries_only_the_public_ticket_reference_and_follows_the_subscription_language()
    {
        const string note = "ตัดสั้นสองเซนติเมตร";
        var (owner, shopId, queueId) = await OpenShopAsync("Payload shop");
        var thai = await JoinAndSubscribeAsync(queueId, note: note, language: "th");
        var english = await JoinAndSubscribeAsync(queueId, language: "en");

        await CallAsync(owner, shopId, queueId);
        var first = await sink.WaitAsync(1);
        Assert.Single(first);
        Assert.Equal((thai.TicketId, "th"), (first[0].TicketId, first[0].Language));
        Assert.Equal(thai.Endpoint, first[0].Target.Endpoint);
        Assert.False(string.IsNullOrEmpty(first[0].Target.P256dh));
        Assert.False(string.IsNullOrEmpty(first[0].Target.Auth));
        using (var payload = JsonDocument.Parse(first[0].Payload))
        {
            var names = payload.RootElement.EnumerateObject().Select(x => x.Name).OrderBy(x => x).ToArray();
            Assert.Equal(new[] { "event", "language", "number", "ticketId" }, names);
            Assert.Equal(thai.TicketId, payload.RootElement.GetProperty("ticketId").GetGuid());
            Assert.Equal(PushEvents.Called, payload.RootElement.GetProperty("event").GetString());
            Assert.Equal(thai.Number, payload.RootElement.GetProperty("number").GetString());
        }
        Assert.DoesNotContain(thai.Secret, first[0].Payload);
        Assert.DoesNotContain(note, first[0].Payload);

        await CompleteAsync(owner, thai);
        await CallAsync(owner, shopId, queueId);
        var second = await sink.WaitAsync(2);
        Assert.Equal((english.TicketId, "en"), (second[1].TicketId, second[1].Language));
        using (var payload = JsonDocument.Parse(second[1].Payload))
            Assert.Equal("en", payload.RootElement.GetProperty("language").GetString());
    }

    [Fact]
    public async Task A_near_turn_is_sent_once_per_ticket_even_after_the_service_threshold_changes_or_the_customer_reopts_in()
    {
        var (owner, shopId, queueId) = await OpenShopAsync("Threshold edit shop");
        var first = await JoinAndSubscribeAsync(queueId);
        var second = await JoinAndSubscribeAsync(queueId);
        var third = await JoinAndSubscribeAsync(queueId);
        var fourth = await JoinAndSubscribeAsync(queueId);
        var fifth = await JoinAndSubscribeAsync(queueId);

        // Calling the head crosses the threshold for the fourth Ticket; that is its one near-turn.
        Assert.Equal(first.TicketId, await CallAsync(owner, shopId, queueId));
        var opening = await sink.WaitAsync(2);
        Assert.Equal(2, opening.Length);
        Assert.Contains(opening, x => x.TicketId == fourth.TicketId && x.Event == PushEvents.NearTurn);
        Assert.DoesNotContain(opening, x => x.Event == PushEvents.NearTurn && x.TicketId != fourth.TicketId);

        // The Customer turns notifications off and on again, so the association is replaced before the position moves.
        Assert.Equal(HttpStatusCode.OK, (await fourth.Client.PostAsync($"/api{fourth.Link}/push/remove", new { endpoint = fourth.Endpoint })).Status);
        var rekeys = TestPushClient.Keys();
        Assert.Equal(HttpStatusCode.OK, (await fourth.Client.PostAsync($"/api{fourth.Link}/push", new { endpoint = fourth.Endpoint, p256dh = rekeys.P256dh, auth = rekeys.Auth, language = "th" })).Status);

        // The Owner lowers the Service threshold through the ordinary edit endpoint.
        var shopView = await owner.Api.GetAsync($"/api/shops/{shopId}");
        var serviceId = shopView.GetProperty("services")[0].GetProperty("id").GetGuid();
        var edited = await owner.Api.PutAsync($"/api/services/{serviceId}", new { name = "Cut", prefix = "A", callTimeoutMinutes = 600, nearTurnThreshold = 0 });
        Assert.Equal(HttpStatusCode.OK, edited.Status);
        Assert.Equal(0, edited.Body.GetProperty("nearTurnThreshold").GetInt32());

        // Ordinary Call/Start/Complete walks the Queue forward. The fourth Ticket crosses the new threshold
        // once more and must stay silent, while the fifth Ticket's first crossing still fires.
        await CompleteAsync(owner, first);
        Assert.Equal(second.TicketId, await CallAsync(owner, shopId, queueId));
        await CompleteAsync(owner, second);
        Assert.Equal(third.TicketId, await CallAsync(owner, shopId, queueId));
        await CompleteAsync(owner, third);
        Assert.Equal(fourth.TicketId, await CallAsync(owner, shopId, queueId));

        var delivered = await sink.SettleAsync();
        Assert.Single(delivered, x => x.TicketId == third.TicketId && x.Event == PushEvents.NearTurn);
        Assert.Equal(4, delivered.Count(x => x.Event == PushEvents.Called));
        Assert.Single(delivered, x => x.TicketId == fourth.TicketId && x.Event == PushEvents.NearTurn);
        Assert.Single(delivered, x => x.TicketId == fifth.TicketId && x.Event == PushEvents.NearTurn);
    }

    private async Task<(OwnerSession Owner, Guid ShopId, Guid QueueId)> OpenShopAsync(string name)
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shop = await owner.Api.PostAsync("/api/shops", new { name });
        Assert.Equal(HttpStatusCode.Created, shop.Status);
        var shopId = shop.Body.GetProperty("id").GetGuid();
        var service = await owner.Api.PostAsync($"/api/shops/{shopId}/services", new { name = "Cut", prefix = "A", callTimeoutMinutes = 600, nearTurnThreshold = Threshold });
        Assert.Equal(HttpStatusCode.Created, service.Status);
        var queueId = service.Body.GetProperty("queue").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await owner.Api.PostAsync($"/api/queues/{queueId}/open", null)).Status);
        return (owner, shopId, queueId);
    }

    private async Task<Guest> JoinAsync(Guid queueId, string? note = null)
    {
        var client = new SmartQueueClient(cluster.Host.CreateClient());
        await client.SessionAsync();
        var joined = await client.PostAsync($"/api/queues/{queueId}/tickets", new { requestId = Guid.NewGuid(), note, confirmExtra = true });
        Assert.Equal(HttpStatusCode.Created, joined.Status);
        var link = joined.Body.GetProperty("link").GetString()!;
        return new Guest(client, link, link["/t/".Length..], joined.Body.GetProperty("ticket").GetProperty("id").GetGuid(), joined.Body.GetProperty("ticket").GetProperty("number").GetString()!);
    }

    private async Task<Guest> JoinAndSubscribeAsync(Guid queueId, string? endpoint = null, string? note = null, string language = "th")
    {
        var guest = await JoinAsync(queueId, note);
        var keys = TestPushClient.Keys();
        var subscribed = await guest.Client.PostAsync($"/api{guest.Link}/push", new { endpoint = endpoint ?? guest.Endpoint, p256dh = keys.P256dh, auth = keys.Auth, language });
        Assert.Equal(HttpStatusCode.OK, subscribed.Status);
        return guest with { Endpoint = endpoint ?? guest.Endpoint, P256dh = keys.P256dh, Auth = keys.Auth };
    }

    private static async Task<HttpStatusCode> SubscribeAsync(Guest guest, string endpoint)
    {
        var keys = TestPushClient.Keys();
        return (await guest.Client.PostAsync($"/api{guest.Link}/push", new { endpoint, p256dh = keys.P256dh, auth = keys.Auth, language = "th" })).Status;
    }

    private static async Task<bool> PushEnabledAsync(Guest guest) =>
        (await guest.Client.GetAsync($"/api{guest.Link}/push")).GetProperty("enabled").GetBoolean();

    private static async Task<Guid> CallAsync(OwnerSession owner, Guid shopId, Guid queueId)
    {
        var console = await owner.Api.GetAsync($"/api/shops/{shopId}/console?queueId={queueId}");
        var called = await owner.Api.PostAsync($"/api/queues/{queueId}/call", new { version = console.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, called.Status);
        return called.Body.GetProperty("id").GetGuid();
    }

    private static async Task CompleteAsync(OwnerSession owner, Guest guest)
    {
        var view = await guest.Client.GetAsync($"/api{guest.Link}");
        var started = await owner.Api.PostAsync($"/api/tickets/{guest.TicketId}/start", new { version = view.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, started.Status);
        var completed = await owner.Api.PostAsync($"/api/tickets/{guest.TicketId}/complete", new { version = started.Body.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, completed.Status);
    }

    private async Task CancelAsync(Guest guest)
    {
        var view = await guest.Client.GetAsync($"/api{guest.Link}");
        var cancelled = await guest.Client.PostAsync($"/api{guest.Link}/cancel", new { version = view.GetProperty("version").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, cancelled.Status);
    }

    private static async Task<long> ConsoleVersionAsync(OwnerSession owner, Guid shopId, Guid queueId) =>
        (await owner.Api.GetAsync($"/api/shops/{shopId}/console?queueId={queueId}")).GetProperty("version").GetInt64();

    private sealed record Guest(SmartQueueClient Client, string Link, string Secret, Guid TicketId, string Number)
    {
        public string Endpoint { get; init; } = TestPushClient.Endpoint();
        public string P256dh { get; init; } = "";
        public string Auth { get; init; } = "";
    }
}
