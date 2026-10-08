using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

/// <summary>
/// Tickets ahead and Estimated wait for a Service.
///
/// Tickets ahead counts only Waiting Tickets with an older ReceiveOrder in the same Queue; Called,
/// InService, terminal Tickets and other Queues never count. Estimated wait is Tickets ahead multiplied
/// by the mean service duration of the latest usable Completed Tickets in the same Service, where
/// usable means a real StartedAt -> EndedAt interval. Fewer than <see cref="MinimumSamples"/> usable
/// samples leaves <see cref="WaitEstimate.EstimatedWaitSeconds"/> null so consumers hide the time while
/// still showing Tickets ahead. There is no Staff count to divide by, other Queues never contribute, and
/// zero Tickets ahead is arithmetic zero: it means next in this Queue, never a promise that the Owner is
/// free, because the Shop may hold a Called or InService Ticket from another Queue.
/// </summary>
public static class WaitEstimates
{
    /// <summary>Usable Completed samples required before a time is estimated at all.</summary>
    public const int MinimumSamples = 5;
    /// <summary>Latest usable Completed samples that contribute to the mean service duration.</summary>
    public const int SampleWindow = 20;

    /// <summary>Tickets ahead of <paramref name="ticket"/> plus the estimate for its Service.</summary>
    public static async Task<WaitEstimate> ForTicketAsync(AppDbContext db, Ticket ticket)
    {
        var ahead = 0;
        if (ticket.Status == TicketStatus.Waiting)
            ahead = await db.Set<Ticket>().CountAsync(x => x.QueueId == ticket.QueueId && x.Status == TicketStatus.Waiting && x.ReceiveOrder < ticket.ReceiveOrder);
        var serviceId = await db.Set<Domain.Queue>().AsNoTracking().Where(x => x.Id == ticket.QueueId).Select(x => x.ServiceId).SingleAsync();
        return await ServiceAsync(db, serviceId, ahead);
    }

    /// <summary>
    /// Estimate for a Service with <paramref name="ahead"/> Tickets in front of the consumer, used by the
    /// public Shop snapshot where the consumer has no Ticket yet.
    /// </summary>
    public static async Task<WaitEstimate> ServiceAsync(AppDbContext db, Guid serviceId, int ahead)
    {
        var aheadCount = Math.Max(ahead, 0);
        var recent = await db.Set<Ticket>().AsNoTracking()
            .Where(x => x.Status == TicketStatus.Completed && x.StartedAt != null && x.EndedAt != null)
            .Where(x => db.Set<Domain.Queue>().Any(q => q.Id == x.QueueId && q.ServiceId == serviceId))
            .OrderByDescending(x => x.EndedAt).ThenByDescending(x => x.ReceiveOrder)
            .Take(SampleWindow)
            .Select(x => new { x.StartedAt, x.EndedAt })
            .ToArrayAsync();
        var durations = recent
            .Select(x => x.EndedAt!.Value - x.StartedAt!.Value)
            .Where(x => x > TimeSpan.Zero)
            .ToArray();
        double? estimatedWaitSeconds = durations.Length >= MinimumSamples ? aheadCount * durations.Average(x => x.TotalSeconds) : null;
        return new WaitEstimate(aheadCount, durations.Length, estimatedWaitSeconds);
    }
}

/// <summary>
/// <paramref name="TicketsAhead"/> Waiting Tickets before the consumer in this Queue,
/// <paramref name="SampleCount"/> usable Completed jobs behind the estimate (0..20), and
/// <paramref name="EstimatedWaitSeconds"/> which is null until <see cref="WaitEstimates.MinimumSamples"/>
/// usable samples exist.
/// </summary>
public sealed record WaitEstimate(int TicketsAhead, int SampleCount, double? EstimatedWaitSeconds);
