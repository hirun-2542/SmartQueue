using System.Data;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Statistics;

/// <summary>
/// The Business day ranges an Owner can choose. A range is always counted in Business days of each Queue in
/// scope and the per-Queue selections are unioned afterwards, so it is never 7/30 calendar dates and never a
/// Business day shared by the whole Shop.
/// </summary>
public enum StatisticsRange { Current, Latest7, Latest30 }

/// <summary>
/// The owned Shop/Service/Business-day selection behind the statistics summary and (reused, not duplicated)
/// the Bangkok peak-hours demand aggregation. It answers one question: which Business day rounds may this
/// Owner read, for the Shop it owns and the Service it optionally filtered to?
///
/// Selection rules:
/// <list type="bullet">
/// <item><see cref="StatisticsRange.Current"/> takes each Queue's current Business day — the round its
/// <c>BusinessDayId</c> points at. That round is the open one while the Queue is Open or Closing; once the
/// Queue is Closed the same field still points at the latest round, so the selection is the latest round and
/// its <c>ClosedAt</c> tells a consumer to label it closed. A Queue that was never opened contributes
/// nothing.</item>
/// <item><see cref="StatisticsRange.Latest7"/> and <see cref="StatisticsRange.Latest30"/> take the latest 7 or
/// 30 Business days of each Queue by <c>OpenedAt</c>, independently. A Queue with fewer rounds contributes
/// all of them; a Queue with more contributes only its newest ones.</item>
/// </list>
///
/// Archived Services are never filtered out: their Queue and its Business days stay in scope, so archiving a
/// Service later preserves its history in the aggregates instead of deleting it. Tickets are always matched
/// by <c>BusinessDayId</c> membership and Ticket identity, never by Ticket number, so two rounds that both
/// start at <c>A001</c> after a reopen are counted separately instead of merged.
/// </summary>
public static class StatisticsSelection
{
    /// <summary>Canonical range value for the current/latest Business day per Queue.</summary>
    public const string CurrentRange = "current";
    /// <summary>Canonical range value for the latest 7 Business days per Queue.</summary>
    public const string Latest7Range = "latest7";
    /// <summary>Canonical range value for the latest 30 Business days per Queue.</summary>
    public const string Latest30Range = "latest30";
    /// <summary>Range used when the request omits it.</summary>
    public const string DefaultRange = Latest7Range;

    /// <summary>Bangkok is the only display timezone; peak-hours demand buckets by this clock.</summary>
    public static readonly TimeZoneInfo Bangkok = TimeZoneInfo.FindSystemTimeZoneById("Asia/Bangkok");

    /// <summary>Parses the <c>range</c> query value; an unknown value is a client error, not a silent default.</summary>
    public static StatisticsRange ParseRange(string? value) => value switch
    {
        null or "" => StatisticsRange.Latest7,
        CurrentRange => StatisticsRange.Current,
        Latest7Range => StatisticsRange.Latest7,
        Latest30Range => StatisticsRange.Latest30,
        _ => throw new ApiException("invalid_range", 400),
    };

    /// <summary>Canonical query/response value of a parsed range.</summary>
    public static string Name(StatisticsRange range) => range switch
    {
        StatisticsRange.Current => CurrentRange,
        StatisticsRange.Latest30 => Latest30Range,
        _ => Latest7Range,
    };

    /// <summary>Latest Business days of one Queue that a range selects.</summary>
    public static int Limit(StatisticsRange range) => range switch
    {
        StatisticsRange.Current => 1,
        StatisticsRange.Latest30 => 30,
        _ => 7,
    };

    /// <summary>Converts a stored UTC timestamp to the Bangkok clock used by counts per hour.</summary>
    public static DateTimeOffset ToBangkok(DateTimeOffset utc) => TimeZoneInfo.ConvertTime(utc, Bangkok);

    /// <summary>
    /// Opens one read-only <see cref="IsolationLevel.RepeatableRead"/> snapshot for a whole statistics read, so
    /// <see cref="ResolveAsync"/> and <see cref="TicketRowsAsync"/> observe the same committed snapshot instead
    /// of two different ones. It is a plain MVCC read: no row is locked, no writer is blocked, and nothing is
    /// filtered or frozen to hide a change. A caller that is already inside a transaction (a nested reuse of
    /// this seam) keeps that transaction and this is a no-op. Wrap the read and dispose the result:
    /// <c>await using var snapshot = await StatisticsSelection.BeginSnapshotAsync(db, ct);</c>
    /// </summary>
    public static async Task<IAsyncDisposable> BeginSnapshotAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is not null) return NoTransaction.Instance;
        var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", cancellationToken);
        return transaction;
    }

    /// <summary>
    /// Resolves the selection for one Owner and Shop. A Shop owned by somebody else, or a Service that is not
    /// in this Shop, is answered as not found so no private resource is disclosed. <paramref name="serviceId"/>
    /// narrows the selection to one Service while the returned <see cref="StatisticsSelectionResult.Services"/>
    /// still lists every Service of the Shop so a filter can stay complete.
    /// </summary>
    public static async Task<StatisticsSelectionResult> ResolveAsync(AppDbContext db, Guid shopId, string ownerId, Guid? serviceId, StatisticsRange range, CancellationToken cancellationToken = default)
    {
        var shop = await db.Set<Shop>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == shopId && x.OwnerId == ownerId, cancellationToken)
            ?? throw new ApiException("not_found", 404);

        var services = (await db.Set<Service>().AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .OrderBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.Name, x.Prefix, x.Archived })
            .ToArrayAsync(cancellationToken))
            .Select(x => new StatisticsService(x.Id, x.Name, x.Prefix, x.Archived))
            .ToArray();

        StatisticsService? filtered = null;
        if (serviceId is { } requested)
        {
            filtered = services.SingleOrDefault(x => x.Id == requested) ?? throw new ApiException("not_found", 404);
        }

        IQueryable<Domain.Queue> queueQuery = db.Set<Domain.Queue>().AsNoTracking().Where(x => x.Service.ShopId == shopId);
        if (serviceId is { } only) queueQuery = queueQuery.Where(x => x.ServiceId == only);
        var queues = (await queueQuery
            .Select(x => new { x.Id, x.ServiceId, x.BusinessDayId })
            .ToArrayAsync(cancellationToken))
            .Select(x => new QueueRef(x.Id, x.ServiceId, x.BusinessDayId))
            .ToArray();

        var selected = new List<StatisticsBusinessDay>();
        if (queues.Length > 0)
        {
            var queueIds = queues.Select(x => x.Id).ToArray();
            var days = (await db.Set<BusinessDay>().AsNoTracking()
                .Where(x => queueIds.Contains(x.QueueId))
                .Select(x => new { x.Id, x.QueueId, x.OpenedAt, x.ClosedAt })
                .ToArrayAsync(cancellationToken))
                .Select(x => new DayRef(x.Id, x.QueueId, x.OpenedAt, x.ClosedAt))
                .ToArray();

            var byId = new Dictionary<Guid, DayRef>();
            foreach (var day in days) byId[day.Id] = day;
            var byQueue = days.GroupBy(x => x.QueueId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.OpenedAt).ThenByDescending(x => x.Id).ToArray());
            var names = services.ToDictionary(x => x.Id, x => x.Name);

            foreach (var queue in queues)
            {
                if (range == StatisticsRange.Current)
                {
                    if (queue.BusinessDayId is not { } current || !byId.TryGetValue(current, out var currentDay)) continue;
                    selected.Add(Row(currentDay, queue.ServiceId, names));
                    continue;
                }
                if (!byQueue.TryGetValue(queue.Id, out var rounds)) continue;
                foreach (var day in rounds.Take(Limit(range))) selected.Add(Row(day, queue.ServiceId, names));
            }
        }

        selected.Sort(static (left, right) =>
        {
            var byName = string.CompareOrdinal(left.ServiceName, right.ServiceName);
            if (byName != 0) return byName;
            var byOpened = left.OpenedAt.CompareTo(right.OpenedAt);
            return byOpened != 0 ? byOpened : left.Id.CompareTo(right.Id);
        });

        return new StatisticsSelectionResult(shop.Id, Name(range), filtered?.Id, filtered?.Name, selected.ToArray(), services);
    }

    /// <summary>
    /// Every Ticket issued into the selected Business days, in no particular order. This is the single shared
    /// read: statistics summarizes the outcomes and measured durations from it, and the peak-hours view
    /// buckets the same rows by <see cref="ToBangkok"/> clock hour from <see cref="TicketRow.ReceivedAt"/>,
    /// which is demand (Tickets received), not Calls or Completions inside that hour.
    /// </summary>
    public static async Task<TicketRow[]> TicketRowsAsync(AppDbContext db, StatisticsSelectionResult selection, CancellationToken cancellationToken = default)
    {
        var ids = selection.BusinessDays.Select(x => x.Id).ToArray();
        if (ids.Length == 0) return [];
        return (await db.Set<Ticket>().AsNoTracking()
            .Where(x => ids.Contains(x.BusinessDayId))
            .Select(x => new { x.Id, x.QueueId, x.BusinessDayId, x.Status, x.Origin, x.ReceivedAt, x.CalledAt, x.StartedAt, x.EndedAt })
            .ToArrayAsync(cancellationToken))
            .Select(x => new TicketRow(x.Id, x.QueueId, x.BusinessDayId, x.Status, x.Origin, x.ReceivedAt, x.CalledAt, x.StartedAt, x.EndedAt))
            .ToArray();
    }

    private static StatisticsBusinessDay Row(DayRef day, Guid serviceId, Dictionary<Guid, string> names) =>
        new(day.Id, day.QueueId, serviceId, names.GetValueOrDefault(serviceId, ""), day.OpenedAt, day.ClosedAt);

    private readonly record struct QueueRef(Guid Id, Guid ServiceId, Guid? BusinessDayId);
    private readonly record struct DayRef(Guid Id, Guid QueueId, DateTimeOffset OpenedAt, DateTimeOffset? ClosedAt);

    /// <summary>Disposable used when the caller already owns the transaction, so the snapshot helper never commits or rolls back anything it did not open.</summary>
    private sealed class NoTransaction : IAsyncDisposable
    {
        public static readonly NoTransaction Instance = new();
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

/// <summary>One Service of the Shop, including an archived one so its history stays selectable and countable.</summary>
public sealed record StatisticsService(Guid Id, string Name, string Prefix, bool Archived);

/// <summary>One Business day round in the selection, already tied to its Queue, its Service and that Service's name.</summary>
public sealed record StatisticsBusinessDay(Guid Id, Guid QueueId, Guid ServiceId, string ServiceName, DateTimeOffset OpenedAt, DateTimeOffset? ClosedAt);

/// <summary>
/// The resolved selection: owned Shop, canonical range, optional Service filter, the Business day rounds in
/// scope and every Service of the Shop for a filter control.
/// </summary>
public sealed record StatisticsSelectionResult(Guid ShopId, string Range, Guid? ServiceId, string? ServiceName, StatisticsBusinessDay[] BusinessDays, StatisticsService[] Services);

/// <summary>
/// The Ticket fields shared by statistics and hourly demand. <see cref="BusinessDayId"/> is the membership
/// that groups a Ticket; <see cref="Status"/> is the final outcome when terminal; <see cref="CalledAt"/>,
/// <see cref="StartedAt"/> and <see cref="EndedAt"/> are the only timestamps a duration may be measured from.
/// </summary>
public sealed record TicketRow(Guid Id, Guid QueueId, Guid BusinessDayId, TicketStatus Status, string Origin, DateTimeOffset ReceivedAt, DateTimeOffset? CalledAt, DateTimeOffset? StartedAt, DateTimeOffset? EndedAt);
