using System.Net;
using System.Text.Json;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Public-boundary tests for the Business day statistics against a real PostgreSQL database and a controllable
/// server clock. Time is moved only through <see cref="SmartQueueCluster"/>, Tickets are issued and ended only
/// through the real Owner and Customer operations, and every number is read from
/// <c>GET /api/shops/{id}/statistics</c>. The clock makes the expected durations and rates exact instead of
/// approximate, and no test inspects SQL, private state or provider defaults: each assertion is what an Owner
/// would read from the response.
/// </summary>
public sealed class StatisticsTests : IAsyncLifetime
{
    private static readonly DateTimeOffset Morning = new(2027, 3, 1, 2, 0, 0, TimeSpan.Zero);

    private readonly SmartQueueCluster cluster = new(now: Morning);

    public Task InitializeAsync() => cluster.InitializeAsync();
    public Task DisposeAsync() => cluster.DisposeAsync();

    [Fact]
    public async Task Counts_durations_and_rates_match_the_records_of_one_business_day()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Statistics shop");
        var cut = await CreateServiceAsync(owner.Api, shopId, "Cut", "A");
        Assert.Equal(HttpStatusCode.OK, (await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/open", null)).Status);

        // t1: a Customer Ticket served from received to completed with an exact 10 minute wait and 30 minute service.
        cluster.Jump(TimeSpan.FromMinutes(1));
        await JoinAsync(owner.Api, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(10));
        var called1 = await CallAsync(owner.Api, shopId, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(20));
        var started1 = await StartAsync(owner.Api, called1);
        cluster.Jump(TimeSpan.FromMinutes(30));
        await CompleteAsync(owner.Api, started1);

        // t2: a Walk-in Ticket that is Called and then Skipped, so it has a 4 minute wait but no service time.
        cluster.Jump(TimeSpan.FromMinutes(5));
        var t2 = await WalkinAsync(owner.Api, cut.QueueId);
        Assert.Equal("WalkIn", Text(t2.GetProperty("ticket"), "origin"));
        cluster.Jump(TimeSpan.FromMinutes(4));
        var called2 = await CallAsync(owner.Api, shopId, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(1));
        await SkipAsync(owner.Api, called2);

        // t3: cancelled before any Call, so it never contributes a wait measurement.
        cluster.Jump(TimeSpan.FromMinutes(2));
        var t3 = await JoinAsync(owner.Api, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(3));
        await CancelAsync(owner.Api, Text(t3, "link"), Version(t3.GetProperty("ticket")));

        // t4: Called and then cancelled, so it does have a 1 minute wait.
        cluster.Jump(TimeSpan.FromMinutes(2));
        var t4 = await JoinAsync(owner.Api, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(1));
        var called4 = await CallAsync(owner.Api, shopId, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(1));
        await CancelAsync(owner.Api, Text(t4, "link"), Version(called4));

        // t5 and t6 stay Waiting until the Owner Drops the Queue, ending the Business day.
        cluster.Jump(TimeSpan.FromMinutes(2));
        await JoinAsync(owner.Api, cut.QueueId);
        await JoinAsync(owner.Api, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(1));
        var drop = await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/drop", new { version = await ShopVersionAsync(owner.Api, shopId), confirm = true });
        Assert.Equal(HttpStatusCode.OK, drop.Status);
        Assert.Equal("Closed", Text(drop.Body, "status"));

        var stats = await StatisticsAsync(owner.Api, shopId, "current");
        Assert.Equal("current", Text(stats, "range"));
        Assert.Equal(6, Number(stats, "issued"));
        Assert.Equal(1, Number(stats, "completed"));
        Assert.Equal(1, Number(stats, "skipped"));
        Assert.Equal(2, Number(stats, "cancelled"));
        Assert.Equal(2, Number(stats, "dropped"));
        Assert.Equal(0, Number(stats, "pending"));
        Assert.Equal(6, Number(stats, "terminal"));

        // Wait is measured only on Tickets that were ever Called: (10 + 4 + 1) minutes over three Tickets.
        Assert.Equal(300.0, Decimal(stats, "averageWaitSeconds"), 6);
        Assert.Equal(3, Number(stats, "waitSampleCount"));
        // Service is measured only on a Completed Ticket with real timestamps: 30 minutes.
        Assert.Equal(1800.0, Decimal(stats, "averageServiceSeconds"), 6);
        Assert.Equal(1, Number(stats, "serviceSampleCount"));
        Assert.Equal(1.0 / 6.0, Decimal(stats, "skippedRate"), 6);
        Assert.Equal(2.0 / 6.0, Decimal(stats, "cancelledRate"), 6);

        Assert.Equal(1, Number(stats, "businessDayCount"));
        AssertClosed(stats.GetProperty("businessDays")[0]);
    }

    [Fact]
    public async Task Missing_measurements_are_null_and_in_progress_work_stays_out_of_the_denominator()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Quiet shop");
        var cut = await CreateServiceAsync(owner.Api, shopId, "Cut", "A");

        // A Service whose Queue was never opened has no Business day at all: every number is empty, not zero.
        var never = await StatisticsAsync(owner.Api, shopId, "current");
        Assert.Equal(0, Number(never, "issued"));
        Assert.Equal(0, Number(never, "businessDayCount"));
        AssertNull(never, "averageWaitSeconds");
        AssertNull(never, "averageServiceSeconds");
        AssertNull(never, "skippedRate");
        AssertNull(never, "cancelledRate");

        Assert.Equal(HttpStatusCode.OK, (await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/open", null)).Status);
        cluster.Jump(TimeSpan.FromMinutes(2));
        await JoinAsync(owner.Api, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(5));
        var called = await CallAsync(owner.Api, shopId, cut.QueueId);
        cluster.Jump(TimeSpan.FromMinutes(3));
        var started = await StartAsync(owner.Api, called);
        cluster.Jump(TimeSpan.FromMinutes(1));
        await JoinAsync(owner.Api, cut.QueueId);

        // One Ticket in service and one still Waiting: no outcome exists yet, so both rates have no denominator,
        // while the Ticket that was really Called has a real 5 minute wait.
        var inProgress = await StatisticsAsync(owner.Api, shopId, "current");
        Assert.Equal(2, Number(inProgress, "issued"));
        Assert.Equal(2, Number(inProgress, "pending"));
        Assert.Equal(0, Number(inProgress, "terminal"));
        Assert.Equal(0, Number(inProgress, "completed"));
        AssertNull(inProgress, "skippedRate");
        AssertNull(inProgress, "cancelledRate");
        Assert.Equal(300.0, Decimal(inProgress, "averageWaitSeconds"), 6);
        Assert.Equal(1, Number(inProgress, "waitSampleCount"));
        // An unfinished job has no service duration to measure.
        AssertNull(inProgress, "averageServiceSeconds");

        // Completing at the same instant as Start is a real zero-duration measurement, so it is 0 and not null.
        await CompleteAsync(owner.Api, started);
        var finished = await StatisticsAsync(owner.Api, shopId, "latest7");
        Assert.Equal(1, Number(finished, "completed"));
        Assert.Equal(0.0, Decimal(finished, "averageServiceSeconds"), 6);
        Assert.Equal(1, Number(finished, "serviceSampleCount"));
        // With a denominator and no Skip the rate is a measured zero, in contrast to the null above.
        Assert.Equal(0.0, Decimal(finished, "skippedRate"), 6);
        Assert.Equal(1, Number(finished, "terminal"));
    }

    [Fact]
    public async Task Ranges_select_business_days_of_each_queue_before_union_and_never_merge_reset_numbers()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Two Service shop");
        var cut = await CreateServiceAsync(owner.Api, shopId, "Cut", "A");
        var wash = await CreateServiceAsync(owner.Api, shopId, "Wash", "B");

        // The Wash Queue is the oldest work in the Shop and holds a single Business day.
        await RunBusinessDayAsync(owner.Api, shopId, wash.QueueId, 1);

        var cutNumbers = new List<string>();
        for (var round = 0; round < 8; round++) cutNumbers.Add(await RunBusinessDayAsync(owner.Api, shopId, cut.QueueId, 2));

        // Every Cut round restarts at A001, yet each round is counted separately instead of being merged.
        Assert.All(cutNumbers, number => Assert.Equal("A001", number));
        Assert.Equal(8, cutNumbers.Count);

        var latest7 = await StatisticsAsync(owner.Api, shopId, "latest7");
        Assert.Equal(15, Number(latest7, "issued"));
        Assert.Equal(15, Number(latest7, "completed"));
        // 7 latest Cut rounds plus the single Wash round: the old Cut round falls out, the Wash round does not.
        Assert.Equal(8, Number(latest7, "businessDayCount"));

        var latest30 = await StatisticsAsync(owner.Api, shopId, "latest30");
        Assert.Equal(17, Number(latest30, "issued"));
        Assert.Equal(9, Number(latest30, "businessDayCount"));

        // Current means the latest round of each Queue, so both Queues contribute their newest round.
        var current = await StatisticsAsync(owner.Api, shopId, "current");
        Assert.Equal(3, Number(current, "issued"));
        Assert.Equal(2, Number(current, "businessDayCount"));

        // The Service filter narrows the union without changing the per-Queue selection.
        var washOnly = await StatisticsAsync(owner.Api, shopId, "latest7", wash.Id);
        Assert.Equal(1, Number(washOnly, "issued"));
        Assert.Equal(1, Number(washOnly, "businessDayCount"));
        Assert.Equal("Wash", Text(washOnly, "serviceName"));

        var cutOnly = await StatisticsAsync(owner.Api, shopId, "latest7", cut.Id);
        Assert.Equal(14, Number(cutOnly, "issued"));
        Assert.Equal(7, Number(cutOnly, "businessDayCount"));

        // Omitting the range uses the default of the latest seven Business days.
        var withoutRange = await StatisticsAsync(owner.Api, shopId, null);
        Assert.Equal("latest7", Text(withoutRange, "range"));
        Assert.Equal(15, Number(withoutRange, "issued"));
    }

    [Fact]
    public async Task An_overnight_business_day_survives_bangkok_midnight_and_a_reopen_is_a_second_round()
    {
        var owner = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shopId = await CreateShopAsync(owner.Api, "Overnight shop");
        var cut = await CreateServiceAsync(owner.Api, shopId, "Cut", "A");

        // 02:00 UTC is 09:00 in Asia/Bangkok; after a 14.5 hour jump it is 23:30 there, and two more hours cross
        // Bangkok midnight inside the same Business day.
        cluster.Jump(TimeSpan.FromHours(14.5));
        var opened = await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/open", null);
        var firstDay = opened.Body.GetProperty("businessDayId").GetGuid();
        var t1 = await JoinAsync(owner.Api, cut.QueueId);
        Assert.Equal("A001", Text(t1.GetProperty("ticket"), "number"));
        cluster.Jump(TimeSpan.FromHours(2));
        var t2 = await JoinAsync(owner.Api, cut.QueueId);
        Assert.Equal("A002", Text(t2.GetProperty("ticket"), "number"));

        var overnight = await StatisticsAsync(owner.Api, shopId, "latest7");
        Assert.Equal(2, Number(overnight, "issued"));
        Assert.Equal(1, Number(overnight, "businessDayCount"));
        Assert.Equal(2, Number(overnight, "pending"));
        Assert.Equal(firstDay, overnight.GetProperty("businessDays")[0].GetProperty("id").GetGuid());

        // Dropping the Queue ends this Business day; reopening the same Bangkok calendar date starts another round
        // whose numbers restart at A001 with a different identity.
        var drop = await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/drop", new { version = await ShopVersionAsync(owner.Api, shopId), confirm = true });
        Assert.Equal(HttpStatusCode.OK, drop.Status);
        var reopened = await owner.Api.PostAsync($"/api/queues/{cut.QueueId}/open", null);
        var secondDay = reopened.Body.GetProperty("businessDayId").GetGuid();
        Assert.NotEqual(firstDay, secondDay);
        cluster.Jump(TimeSpan.FromMinutes(30));
        var t3 = await JoinAsync(owner.Api, cut.QueueId);
        Assert.Equal("A001", Text(t3.GetProperty("ticket"), "number"));

        // Two rounds that both start at A001 are counted as two, so a Ticket number is never an identity.
        var both = await StatisticsAsync(owner.Api, shopId, "latest7");
        Assert.Equal(3, Number(both, "issued"));
        Assert.Equal(2, Number(both, "businessDayCount"));
        Assert.Equal(2, Number(both, "dropped"));
        Assert.Equal(1, Number(both, "pending"));

        // The current range reads the newest round only, which is the one still running.
        var current = await StatisticsAsync(owner.Api, shopId, "current");
        Assert.Equal(1, Number(current, "issued"));
        Assert.Equal(secondDay, current.GetProperty("businessDays")[0].GetProperty("id").GetGuid());
        Assert.Equal(JsonValueKind.Null, current.GetProperty("businessDays")[0].GetProperty("closedAt").ValueKind);
    }

    [Fact]
    public async Task Another_owner_cannot_read_statistics_and_the_response_never_mixes_shops()
    {
        // The raw HttpClient is kept beside its session so a refusal can be asserted on both the status and the
        // machine-readable code, exactly as the other public-boundary tests do.
        var (ownerA, rawA) = await VerifiedOwnerWithRawAsync();
        using (rawA)
        {
            var shopA = await CreateShopAsync(ownerA, "Owner A shop");
            var cutA = await CreateServiceAsync(ownerA, shopA, "Cut", "A");
            await RunBusinessDayAsync(ownerA, shopA, cutA.QueueId, 1);
            var secondShopA = await CreateShopAsync(ownerA, "Owner A second shop");

            var (ownerB, rawB) = await VerifiedOwnerWithRawAsync();
            using (rawB)
            {
                var shopB = await CreateShopAsync(ownerB, "Owner B shop");
                var washB = await CreateServiceAsync(ownerB, shopB, "Wash", "B");
                await RunBusinessDayAsync(ownerB, shopB, washB.QueueId, 2);

                // Owner A reads its own Shops and switches between them; each Shop answers with its own work only.
                var statsA = await StatisticsAsync(ownerA, shopA, "latest7");
                Assert.Equal(1, Number(statsA, "issued"));
                var emptySecond = await StatisticsAsync(ownerA, secondShopA, "latest7");
                Assert.Equal(0, Number(emptySecond, "issued"));

                var statsB = await StatisticsAsync(ownerB, shopB, "latest7");
                Assert.Equal(2, Number(statsB, "issued"));

                // Another Owner's Shop is answered as not found, exactly like an unknown Shop, disclosing nothing.
                await AssertNotFoundAsync($"/api/shops/{shopA}/statistics?range=latest7", rawB);
                // An unknown Service of the Owner's own Shop is not found instead of being ignored.
                await AssertNotFoundAsync($"/api/shops/{shopA}/statistics?range=latest7&serviceId={Guid.NewGuid()}", rawA);
                // An unknown range is a client error, not a silent fallback to a default.
                await AssertBadRangeAsync($"/api/shops/{shopA}/statistics?range=this-week", rawA);
                // Without an Owner session the same route is unauthenticated.
                await AssertUnauthenticatedAsync($"/api/shops/{shopA}/statistics");
            }
        }
    }

    /// <summary>
    /// A verified Owner together with the <see cref="HttpClient"/> that carries its session cookies, so a test can
    /// assert the raw HTTP status of a refusal whose body may be empty.
    /// </summary>
    private async Task<(SmartQueueClient Api, HttpClient Raw)> VerifiedOwnerWithRawAsync()
    {
        var verified = await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var raw = cluster.Host.CreateClient();
        var api = new SmartQueueClient(raw);
        await SmartQueueScenario.SignInAsync(api, verified.Email);
        return (api, raw);
    }

    private static async Task AssertNotFoundAsync(string path, HttpClient client)
    {
        using var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("not_found", await CodeAsync(response));
    }

    private static async Task AssertBadRangeAsync(string path, HttpClient client)
    {
        using var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_range", await CodeAsync(response));
    }

    private async Task AssertUnauthenticatedAsync(string path)
    {
        using var client = cluster.Host.CreateClient();
        using var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("code").GetString()!;
    }

    private sealed record ServiceRef(Guid Id, Guid QueueId);

    private static async Task<Guid> CreateShopAsync(SmartQueueClient owner, string name)
    {
        var shop = await owner.PostAsync("/api/shops", new { name });
        Assert.Equal(HttpStatusCode.Created, shop.Status);
        return shop.Body.GetProperty("id").GetGuid();
    }

    private static async Task<ServiceRef> CreateServiceAsync(SmartQueueClient owner, Guid shopId, string name, string prefix)
    {
        var service = await owner.PostAsync($"/api/shops/{shopId}/services", new { name, prefix, callTimeoutMinutes = 600, nearTurnThreshold = 2 });
        Assert.Equal(HttpStatusCode.Created, service.Status);
        return new ServiceRef(service.Body.GetProperty("id").GetGuid(), service.Body.GetProperty("queue").GetProperty("id").GetGuid());
    }

    /// <summary>
    /// Opens a Business day, issues <paramref name="tickets"/> Customer Tickets, stops accepting and serves all
    /// of them to completion, so the Queue closes and that round ends. Returns the first Ticket number.
    /// </summary>
    private static async Task<string> RunBusinessDayAsync(SmartQueueClient owner, Guid shopId, Guid queueId, int tickets)
    {
        var opened = await owner.PostAsync($"/api/queues/{queueId}/open", null);
        Assert.Equal(HttpStatusCode.OK, opened.Status);
        string? first = null;
        for (var index = 0; index < tickets; index++)
        {
            var joined = await JoinAsync(owner, queueId);
            first ??= Text(joined.GetProperty("ticket"), "number");
        }
        var stop = await owner.PostAsync($"/api/queues/{queueId}/stop", new { version = await ShopVersionAsync(owner, shopId) });
        Assert.Equal(HttpStatusCode.OK, stop.Status);
        for (var index = 0; index < tickets; index++)
        {
            var called = await CallAsync(owner, shopId, queueId);
            await CompleteAsync(owner, await StartAsync(owner, called));
        }
        var snapshot = await owner.GetAsync($"/api/shops/{shopId}");
        var status = snapshot.GetProperty("services").EnumerateArray()
            .Single(service => service.GetProperty("queue").GetProperty("id").GetGuid() == queueId)
            .GetProperty("queue").GetProperty("status").GetString();
        Assert.Equal("Closed", status);
        return first!;
    }

    private static async Task<JsonElement> JoinAsync(SmartQueueClient owner, Guid queueId)
    {
        var joined = await owner.PostAsync($"/api/queues/{queueId}/tickets", new { requestId = Guid.NewGuid(), confirmExtra = true });
        Assert.Equal(HttpStatusCode.Created, joined.Status);
        return joined.Body;
    }

    private static async Task<JsonElement> WalkinAsync(SmartQueueClient owner, Guid queueId)
    {
        var walkin = await owner.PostAsync($"/api/queues/{queueId}/walkin", new { note = "Walk-in Customer" });
        Assert.Equal(HttpStatusCode.Created, walkin.Status);
        return walkin.Body;
    }

    private static async Task<long> ShopVersionAsync(SmartQueueClient owner, Guid shopId) =>
        (await owner.GetAsync($"/api/shops/{shopId}")).GetProperty("version").GetInt64();

    private static async Task<JsonElement> CallAsync(SmartQueueClient owner, Guid shopId, Guid queueId)
    {
        var call = await owner.PostAsync($"/api/queues/{queueId}/call", new { version = await ShopVersionAsync(owner, shopId) });
        Assert.Equal(HttpStatusCode.OK, call.Status);
        return call.Body;
    }

    private static async Task<JsonElement> StartAsync(SmartQueueClient owner, JsonElement ticket)
    {
        var start = await owner.PostAsync($"/api/tickets/{ticket.GetProperty("id").GetGuid()}/start", new { version = Version(ticket) });
        Assert.Equal(HttpStatusCode.OK, start.Status);
        return start.Body;
    }

    private static async Task<JsonElement> CompleteAsync(SmartQueueClient owner, JsonElement ticket)
    {
        var complete = await owner.PostAsync($"/api/tickets/{ticket.GetProperty("id").GetGuid()}/complete", new { version = Version(ticket) });
        Assert.Equal(HttpStatusCode.OK, complete.Status);
        return complete.Body;
    }

    private static async Task<JsonElement> SkipAsync(SmartQueueClient owner, JsonElement ticket)
    {
        var skip = await owner.PostAsync($"/api/tickets/{ticket.GetProperty("id").GetGuid()}/skip", new { version = Version(ticket) });
        Assert.Equal(HttpStatusCode.OK, skip.Status);
        return skip.Body;
    }

    private static async Task CancelAsync(SmartQueueClient owner, string link, long version)
    {
        var cancel = await owner.PostAsync($"/api{link}/cancel", new { version });
        Assert.Equal(HttpStatusCode.OK, cancel.Status);
    }

    private static async Task<JsonElement> StatisticsAsync(SmartQueueClient owner, Guid shopId, string? range, Guid? serviceId = null)
    {
        var query = range is null ? "" : $"?range={range}";
        if (serviceId is { } id) query += $"{(query.Length == 0 ? "?" : "&")}serviceId={id}";
        return await owner.GetAsync($"/api/shops/{shopId}/statistics{query}");
    }

    private static string Text(JsonElement element, string name) => element.GetProperty(name).GetString()!;

    private static int Number(JsonElement element, string name) => element.GetProperty(name).GetInt32();

    private static double Decimal(JsonElement element, string name) => element.GetProperty(name).GetDouble();

    private static long Version(JsonElement ticket) => ticket.GetProperty("version").GetInt64();

    private static void AssertNull(JsonElement element, string name) => Assert.Equal(JsonValueKind.Null, element.GetProperty(name).ValueKind);

    private static void AssertClosed(JsonElement businessDay) => Assert.NotEqual(JsonValueKind.Null, businessDay.GetProperty("closedAt").ValueKind);
}
