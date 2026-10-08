using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// One isolated PostgreSQL database with one or more API instances over it. All instances share a single
/// controllable server clock, so a test can advance time once and have every worker observe it, which is
/// how a two-instance or restart scenario is reproduced without a second real process.
/// Synchronisation is always through the public application boundary: clock ticks trigger work, and the
/// test then observes Ticket snapshots over HTTP. Construct with a coarser <paramref name="pollInterval"/>
/// when a test jumps hours or days of server time, e.g. to cross the 24 hour Ticket-link expiry boundary.
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

    /// <summary>Worker interval used by this cluster; one <see cref="TickAsync"/> step advances exactly this much.</summary>
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

    /// <summary>
    /// Advances server time by whole worker intervals so every running instance sweeps once per interval.
    /// Each step lets the previous sweep finish and the next one start, so a test that observes a Ticket
    /// snapshot afterwards has always given the worker the chance to act on the time it reached.
    /// </summary>
    public async Task TickAsync(int intervals = 1)
    {
        for (var interval = 0; interval < intervals; interval++)
        {
            await SettleAsync();
            Clock.Advance(PollInterval);
            await SettleAsync();
        }
    }

    /// <summary>
    /// Starts a competing HTTP action (for example a Start, Complete, Cancel or Walk-in that uses the same
    /// expected version), advances one interval so the sweep runs while that action is in flight, and returns
    /// the action's result. The caller then decides which transition won from the public snapshots.
    /// </summary>
    public async Task<T> AdvanceWhileAsync<T>(Func<Task<T>> action)
    {
        await SettleAsync();
        var pending = action();
        Clock.Advance(PollInterval);
        var result = await pending;
        await SettleAsync();
        return result;
    }

    /// <summary>
    /// Moves server time by an arbitrary amount without aligning to worker intervals. Use it for long jumps
    /// such as link expiry, where waiting for one sweep per interval would be pointless.
    /// </summary>
    public void Jump(TimeSpan delta) => Clock.Advance(delta);

    /// <summary>
    /// Bounded pause that lets the worker finish the sweep it was just given and park in its next wait. A sweep
    /// is a single indexed read plus, at most, one Shop-locked update, and it does no waiting of its own.
    /// </summary>
    public static Task SettleAsync() => Task.Delay(TimeSpan.FromMilliseconds(100));

    public async Task DisposeAsync()
    {
        foreach (var host in hosts.ToArray()) await host.DisposeAsync();
        hosts.Clear();
        TestPostgres.DropDatabase(connectionString);
    }
}
