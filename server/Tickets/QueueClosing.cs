using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

/// <summary>
/// The single place where a Queue stops accepting Tickets and where its Business day ends.
/// A Queue drains as <see cref="ClosingStatus"/> for as long as it still holds an active Ticket; the moment
/// its active count reaches zero the Queue becomes <see cref="ClosedStatus"/> and its current Business day
/// records a UTC end time. Nothing here is scheduled, timed or retried in the background: a drain close only
/// happens inside the transaction that ended the last active Ticket, so an Open Queue that still has work is
/// never closed by a clock, and an empty Queue is closed in the same operation that stopped accepting.
/// <see cref="SettleAsync"/> is invoked by <c>ShopTransaction.CommitAsync</c> after the pending changes are
/// saved and before the commit, which is why Cancel, Complete, Skip, auto-Skip, Drop and Stop accepting all
/// reach the same rule without duplicating it per endpoint.
/// </summary>
public static class QueueClosing
{
    /// <summary>Queue status that accepts new Tickets.</summary>
    public const string OpenStatus = "Open";

    /// <summary>Queue status that accepts no new Ticket while the Owner keeps calling the Tickets still held.</summary>
    public const string ClosingStatus = "Closing";

    /// <summary>Queue status with no current Business day and no active Ticket.</summary>
    public const string ClosedStatus = "Closed";

    /// <summary>End reason recorded on a Waiting Ticket the Owner ended by Dropping the Queue.</summary>
    public const string DroppedReason = "dropped";

    /// <summary>
    /// Ends the Business day of every Queue of <paramref name="shop"/> that is Closing and no longer has an
    /// active Ticket (Waiting, Called or InService). Queues that still hold work are left Closing. Runs inside
    /// the caller's transaction: the caller has already saved the changes that may have emptied a Queue, and
    /// the extra rows this writes are committed by the same transaction.
    /// </summary>
    /// <returns>How many Queues became Closed.</returns>
    public static async Task<int> SettleAsync(AppDbContext db, Shop shop, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var closing = await db.Set<Domain.Queue>()
            .Where(x => x.Service.ShopId == shop.Id && x.Status == ClosingStatus)
            .ToListAsync(cancellationToken);
        if (closing.Count == 0) return 0;

        var ids = closing.Select(x => x.Id).ToArray();
        var stillActive = await db.Set<Ticket>()
            .Where(x => ids.Contains(x.QueueId))
            .Where(x => x.Status == TicketStatus.Waiting || x.Status == TicketStatus.Called || x.Status == TicketStatus.InService)
            .Select(x => x.QueueId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var active = stillActive.ToHashSet();

        var ended = 0;
        foreach (var queue in closing)
        {
            if (active.Contains(queue.Id)) continue;
            queue.Status = ClosedStatus;
            ended++;
            if (queue.BusinessDayId is not { } dayId) continue;
            var day = await db.Set<BusinessDay>().SingleOrDefaultAsync(x => x.Id == dayId, cancellationToken);
            if (day is { ClosedAt: null }) day.ClosedAt = now;
        }

        if (ended > 0) await db.SaveChangesAsync(cancellationToken);
        return ended;
    }

    /// <summary>
    /// Ends every Waiting Ticket of one Queue as <see cref="TicketStatus.Dropped"/>. Called and InService
    /// Tickets are never touched: the Owner continues the work already in progress. Walks the Queue in
    /// receive order so a caller can report exactly which Tickets the Owner ended.
    /// </summary>
    public static async Task<List<Ticket>> DropWaitingAsync(AppDbContext db, Guid queueId, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var waiting = await db.Set<Ticket>()
            .Where(x => x.QueueId == queueId && x.Status == TicketStatus.Waiting)
            .OrderBy(x => x.ReceiveOrder)
            .ToListAsync(cancellationToken);

        foreach (var ticket in waiting)
        {
            ticket.Status = TicketStatus.Dropped;
            ticket.Version++;
            ticket.EndedAt = now;
            ticket.EndReason = DroppedReason;
        }
        return waiting;
    }
}
