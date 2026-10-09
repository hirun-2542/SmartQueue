using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Push;

/// <summary>One association inside the Shop at capture time: enough to build a delivery without reading the database again after commit.</summary>
public sealed record PushSubscriber(Guid TicketId, PushTarget Target, string Language);

/// <summary>The public, pre-transaction state of a subscribed Ticket: its status, its public number, how many Waiting Tickets were ahead of it, and whether its one near-turn notification was already produced.</summary>
public sealed record PushTicketState(Guid Id, Guid QueueId, string Number, TicketStatus Status, int Ahead, int Threshold, DateTimeOffset? NearTurnNotifiedAt);

/// <summary>
/// What a Shop transaction captured before it wrote anything. Empty for the common case of a Shop with no
/// push association at all, which is why the capture costs one indexed read and nothing more.
/// </summary>
public sealed class PushCapture
{
    public static readonly PushCapture Empty = new([], new Dictionary<Guid, PushTicketState>());

    public PushCapture(IReadOnlyList<PushSubscriber> subscribers, IReadOnlyDictionary<Guid, PushTicketState> before)
    {
        Subscribers = subscribers; Before = before;
    }

    public IReadOnlyList<PushSubscriber> Subscribers { get; }
    public IReadOnlyDictionary<Guid, PushTicketState> Before { get; }
    public bool IsEmpty => Subscribers.Count == 0;
}

/// <summary>
/// The per-Ticket notification planner. It is deliberately split around the transaction boundary so that the
/// decisions and the deliveries have opposite guarantees: everything that could change a Ticket outcome —
/// seeing the pre-transaction position, withdrawing the association of a Ticket that just ended — happens
/// inside the caller's Shop lock and is committed atomically with the Ticket change, while the network hand-off
/// happens only after the commit.
///
/// A near-turn event is the one rule that needs a before and an after: it fires exactly once per Ticket when
/// its Waiting position crosses from more than the Service threshold to no more than it. Reading the position
/// before and after rather than comparing each change means a leap of several positions still fires once, a
/// Ticket that joined already inside the threshold fires nothing extra, and a Ticket that is already inside
/// the threshold cannot fire again. The "once" is durable: the Ticket records the moment its near-turn
/// notification was produced inside the same transaction, so an Owner changing the Service threshold later,
/// a Customer unsubscribing and opting in again, a restart or a second instance can never produce a second
/// one for the same Ticket. Called and Dropped are separate events evaluated from the same two states.
/// </summary>
public static class PushFlow
{
    /// <summary>Reads the Shop's associations and the pre-transaction position of every subscribed Ticket. Call under the Shop lock, before the pending changes are saved.</summary>
    public static async Task<PushCapture> CaptureAsync(AppDbContext db, Guid shopId, CancellationToken cancellationToken = default)
    {
        var associations = await db.Set<PushSubscription>().AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Select(x => new { x.TicketId, x.QueueId, x.Endpoint, x.P256dh, x.Auth, x.Language })
            .ToListAsync(cancellationToken);
        if (associations.Count == 0) return PushCapture.Empty;

        var ticketIds = associations.Select(x => x.TicketId).Distinct().ToArray();
        var queueIds = associations.Select(x => x.QueueId).Distinct().ToArray();
        var before = await SnapshotAsync(db, ticketIds, queueIds, cancellationToken);

        var subscribers = new List<PushSubscriber>(associations.Count);
        foreach (var association in associations)
        {
            subscribers.Add(new PushSubscriber(association.TicketId,new PushTarget(association.Endpoint,association.P256dh,association.Auth),association.Language));
        }
        return new(subscribers, before);
    }

    /// <summary>
    /// Turns the captured state into deliveries and withdraws every association whose Ticket is now terminal.
    /// Call after the pending Ticket changes were saved and after the closing invariant settled, still inside
    /// the transaction: the withdrawal is committed with the Ticket that caused it, so a Ticket can never end
    /// while its association lingers. A Drop is built from the captured subscription and then withdrawn, so
    /// nothing is kept behind to notify a Ticket that no longer exists.
    /// </summary>
    public static async Task<IReadOnlyList<PushEnvelope>> PrepareAsync(AppDbContext db, Guid shopId, PushCapture capture, CancellationToken cancellationToken = default)
    {
        if (capture.IsEmpty) return [];

        var ticketIds = capture.Before.Keys.ToArray();
        var queueIds = capture.Before.Values.Select(x => x.QueueId).Distinct().ToArray();
        var after = await SnapshotAsync(db, ticketIds, queueIds, cancellationToken);

        var envelopes = new List<PushEnvelope>();
        var terminal = new HashSet<Guid>();
        var notified = new HashSet<Guid>();
        foreach (var subscriber in capture.Subscribers)
        {
            if (!capture.Before.TryGetValue(subscriber.TicketId, out var before)) continue;
            if (after.TryGetValue(subscriber.TicketId, out var current))
            {
                var @event = EventFor(before, current);
                if (@event is not null) envelopes.Add(PushMessages.Create(subscriber.Target, subscriber.TicketId, current.Number, @event, subscriber.Language));
                if (@event == PushEvents.NearTurn) notified.Add(subscriber.TicketId);
                if (IsTerminal(current.Status)) terminal.Add(subscriber.TicketId);
            }
            else
            {
                terminal.Add(subscriber.TicketId);
            }
        }

        // The guard is written in this transaction, before it commits: every endpoint associated with the
        // crossing Ticket got the event above, and no later transaction can produce a second one for it.
        if (notified.Count > 0)
        {
            var crossing = notified.ToArray();
            var now = db.Clock.GetUtcNow();
            foreach (var ticket in await db.Set<Ticket>().Where(x => crossing.Contains(x.Id)).ToListAsync(cancellationToken))
                ticket.NearTurnNotifiedAt ??= now;
            await db.SaveChangesAsync(cancellationToken);
        }

        if (terminal.Count > 0)
        {
            var ending = terminal.ToArray();
            var withdrawing = await db.Set<PushSubscription>()
                .Where(x => x.ShopId == shopId && ending.Contains(x.TicketId))
                .ToListAsync(cancellationToken);
            if (withdrawing.Count > 0)
            {
                db.RemoveRange(withdrawing);
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return envelopes;
    }

    /// <summary>Hands committed deliveries to the dispatcher. Called only after the transaction committed.</summary>
    public static void Enqueue(AppDbContext db, IReadOnlyList<PushEnvelope> envelopes)
    {
        if (envelopes.Count == 0) return;
        db.Push.Enqueue(envelopes);
    }

    private static string? EventFor(PushTicketState before, PushTicketState after)
    {
        if (after.Status == TicketStatus.Called && before.Status != TicketStatus.Called) return PushEvents.Called;
        if (after.Status == TicketStatus.Dropped && before.Status != TicketStatus.Dropped) return PushEvents.Dropped;
        if (before.Status == TicketStatus.Waiting && after.Status == TicketStatus.Waiting
            && before.NearTurnNotifiedAt is null
            && before.Ahead > after.Threshold && after.Ahead <= after.Threshold) return PushEvents.NearTurn;
        return null;
    }

    private static bool IsTerminal(TicketStatus status) =>
        status is TicketStatus.Completed or TicketStatus.Skipped or TicketStatus.Cancelled or TicketStatus.Dropped;

    private static async Task<Dictionary<Guid, PushTicketState>> SnapshotAsync(AppDbContext db, Guid[] ticketIds, Guid[] queueIds, CancellationToken cancellationToken)
    {
        var queues = await db.Set<Domain.Queue>().AsNoTracking()
            .Where(x => queueIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Service.NearTurnThreshold })
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var tickets = await db.Set<Ticket>().AsNoTracking()
            .Where(x => ticketIds.Contains(x.Id))
            .Select(x => new { x.Id, x.QueueId, x.Status, x.Number, x.NearTurnNotifiedAt })
            .ToListAsync(cancellationToken);
        var waiting = await db.Set<Ticket>().AsNoTracking()
            .Where(x => queueIds.Contains(x.QueueId) && x.Status == TicketStatus.Waiting)
            .OrderBy(x => x.QueueId).ThenBy(x => x.ReceiveOrder)
            .Select(x => new { x.Id, x.QueueId })
            .ToListAsync(cancellationToken);

        var nextAhead = new Dictionary<Guid, int>();
        var ahead = new Dictionary<Guid, int>(waiting.Count);
        foreach (var ticket in waiting)
        {
            var position = nextAhead.GetValueOrDefault(ticket.QueueId);
            ahead[ticket.Id] = position;
            nextAhead[ticket.QueueId] = position + 1;
        }

        var states = new Dictionary<Guid, PushTicketState>(tickets.Count);
        foreach (var ticket in tickets)
        {
            var queue=queues[ticket.QueueId];
            states[ticket.Id] = new PushTicketState(ticket.Id,ticket.QueueId,ticket.Number,ticket.Status,ahead.GetValueOrDefault(ticket.Id),queue.NearTurnThreshold,ticket.NearTurnNotifiedAt);
        }
        return states;
    }
}
