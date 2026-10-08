using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// One isolated PostgreSQL database with one or more API instances over it. All instances share a single
/// controllable server clock, so a test can advance time once and have every worker observe it, which is
/// how a two-instance or restart scenario is reproduced without a second real process.
/// Construct with a coarser <paramref name="pollInterval"/> when a test jumps hours or days of server time,
/// e.g. to cross the 24 hour Ticket-link expiry boundary.
/// </summary>
public sealed class SmartQueueCluster : IAsyncLifetime
{
    private readonly List<SmartQueueFactory> hosts = [];
    private string connectionString = "";

    public SmartQueueCluster(TimeSpan? pollInterval = null, DateTimeOffset? now = null)
    {
        PollInterval = pollInterval ?? TimeSpan.FromSeconds(1);
        Clock = new FakeTimeProvider(now ?? DateTimeOffset.UtcNow);
    }

    /// <summary>Worker interval used by this cluster; advancing one interval triggers exactly one sweep.</summary>
    public TimeSpan PollInterval { get; }

    public FakeTimeProvider Clock { get; }

    /// <summary>The most recently started instance.</summary>
    public SmartQueueFactory Host => hosts[^1];

    public async Task InitializeAsync()
    {
        connectionString = TestPostgres.CreateDatabase();
        await AddHostAsync();
    }

    /// <summary>Starts another API instance over the same database and clock, as another process would be.</summary>
    public async Task<SmartQueueFactory> AddHostAsync()
    {
        var host = new SmartQueueFactory(connectionString, Clock, PollInterval);
        hosts.Add(host);
        return await host.StartAsync();
    }

    /// <summary>Stops one instance, keeping the database so a restart can find the durable state.</summary>
    public async Task RemoveHostAsync(SmartQueueFactory host)
    {
        hosts.Remove(host);
        await host.DisposeAsync();
    }

    /// <summary>Advances server time by whole worker intervals and waits for every instance to sweep.</summary>
    public async Task AdvanceAsync(int intervals = 1)
    {
        for (var interval = 0; interval < intervals; interval++)
        {
            await SettleAsync();
            var before = SnapshotSweeps();
            Clock.Advance(PollInterval);
            await WaitForSweepsAsync(before);
        }
    }

    /// <summary>
    /// Runs a competing HTTP action (for example a Start or Cancel that uses the same expected version) and
    /// fires one worker sweep while it is in flight, then waits for the sweep to finish. The caller can rely on
    /// the sweep it triggered happening at the next deadline.
    /// </summary>
    public async Task<T> AdvanceWhileAsync<T>(Func<Task<T>> action)
    {
        await SettleAsync();
        var before = SnapshotSweeps();
        var pending = action();
        Clock.Advance(PollInterval);
        var result = await pending;
        await WaitForSweepsAsync(before);
        return result;
    }

    /// <summary>
    /// Moves server time by an arbitrary amount without aligning to worker intervals. Use it for long jumps
    /// such as link expiry, where waiting for one sweep per interval would be pointless.
    /// </summary>
    public void Jump(TimeSpan delta) => Clock.Advance(delta);

    private Dictionary<SmartQueueFactory, int> SnapshotSweeps() =>
        hosts.ToDictionary(host => host, host => host.Worker.CompletedSweeps);

    private static async Task WaitForSweepsAsync(Dictionary<SmartQueueFactory, int> before)
    {
        foreach (var (host, sweeps) in before)
            await WaitForAsync(() => host.Worker.CompletedSweeps > sweeps, "an instance did not sweep after server time advanced");
    }

    /// <summary>
    /// Gives every worker a moment to park in its next wait. A sweep increments its counter and then waits with
    /// no I/O in between, so a short real delay is enough to make the following clock advance fire exactly one
    /// tick per interval per instance.
    /// </summary>
    private static Task SettleAsync() => Task.Delay(50);

    public static async Task WaitForAsync(Func<bool> condition, string message)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow <= deadline, message);
            await Task.Delay(10);
        }
    }

    public async Task DisposeAsync()
    {
        foreach (var host in hosts.ToArray()) await host.DisposeAsync();
        hosts.Clear();
        TestPostgres.DropDatabase(connectionString);
    }
}
