using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

/// <summary>Options for <see cref="AutoSkipWorker"/>, bound from the "AutoSkip" configuration section.</summary>
public sealed class AutoSkipOptions
{
    public const string SectionName = "AutoSkip";

    /// <summary>How long the worker waits between deadline sweeps. Defaults to five seconds.</summary>
    public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>Maximum due Tickets handled in one sweep; the following sweep continues a larger backlog.</summary>
    public int BatchSize { get; set; } = 100;
}

/// <summary>
/// Skips Called Tickets whose Call deadline has passed. Deadlines are read from the durable Ticket row,
/// so a restarted process or a second API instance still finds a Called Ticket that timed out while nobody
/// was watching. Every transition runs through the same Shop row lock and expected status/version rules as a
/// manual Skip: two workers cannot skip the same Ticket twice, a Ticket that became InService or terminal is
/// never Skipped, and no auto-Complete exists for InService work. The worker only needs server time and
/// PostgreSQL; it never depends on a browser countdown or a SignalR connection.
/// </summary>
public sealed class AutoSkipWorker : BackgroundService
{
    /// <summary>End reason recorded on Tickets this worker Skipped, distinguishing it from a manual Skip.</summary>
    public const string Reason = "auto_skip";

    private readonly IServiceScopeFactory scopes;
    private readonly TimeProvider time;
    private readonly ILogger<AutoSkipWorker> logger;
    private readonly TimeSpan pollInterval;
    private readonly int batchSize;

    public AutoSkipWorker(IServiceScopeFactory scopes, TimeProvider time, IOptions<AutoSkipOptions> options, ILogger<AutoSkipWorker> logger)
    {
        this.scopes = scopes;
        this.time = time;
        this.logger = logger;
        var value = options.Value;
        pollInterval = value.PollInterval > TimeSpan.Zero ? value.PollInterval : TimeSpan.FromSeconds(1);
        batchSize = value.BatchSize > 0 ? value.BatchSize : 1;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Auto-skip worker polling Call deadlines every {Interval}", pollInterval);
        using var timer = new PeriodicTimer(pollInterval, time);
        while (!stoppingToken.IsCancellationRequested)
        {
            // Sweep before waiting so a restarted process clears due Tickets without a full interval of delay.
            try { await SweepAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogError(error, "Auto-skip sweep failed; retrying on the next interval"); }

            try { if (!await timer.WaitForNextTickAsync(stoppingToken)) return; }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var due = await db.Set<Ticket>().AsNoTracking()
            .Where(x => x.Status == TicketStatus.Called && x.Deadline != null && x.Deadline <= now)
            .OrderBy(x => x.Deadline)
            .Take(batchSize)
            .Select(x => new { x.Id, x.ShopId })
            .ToArrayAsync(cancellationToken);
        foreach (var candidate in due)
            await SkipAsync(candidate.Id, candidate.ShopId, cancellationToken);
    }

    private async Task SkipAsync(Guid ticketId, Guid shopId, CancellationToken cancellationToken)
    {
        // One isolated scope per Ticket: the Shop row lock serializes against every other transition of this Shop,
        // and a fresh context never writes a stale Shop.Version read by an earlier iteration.
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        try
        {
            await using var unit = await ShopTransaction.OpenAsync(db, shopId, null, cancellationToken);
            var ticket = await db.Set<Ticket>().SingleOrDefaultAsync(x => x.Id == ticketId, cancellationToken);
            // Re-read the durable status, deadline and version under the lock: a Start, a manual Skip, another
            // worker or a restart may already have decided this Ticket.
            if (ticket is null || ticket.Status != TicketStatus.Called) return;
            var now = time.GetUtcNow();
            if (ticket.Deadline is not { } deadline || deadline > now) return;

            ticket.Status = TicketStatus.Skipped;
            ticket.Version++;
            ticket.EndedAt = now;
            ticket.EndReason = Reason;
            await unit.CommitAsync(cancellationToken);
            logger.LogInformation("Auto-skipped Ticket {TicketId} of Shop {ShopId} at its Call deadline", ticket.Id, shopId);
        }
        catch (ApiException error) when (error.Status == 404)
        {
            // The Shop or Ticket is gone; there is nothing durable left to skip.
        }
    }
}
