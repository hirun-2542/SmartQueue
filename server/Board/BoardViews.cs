using System.Data;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Board;

/// <summary>
/// Read-only projection for the anonymous in-shop Display board. Every field is derived from committed
/// Ticket rows, so a rolled back transaction can never reach it, and it deliberately carries no Customer
/// note, Ticket link, device identity, Owner field or subscription capability. The board is addressed
/// only by a Shop's public identifier and never joins another Shop's data.
/// </summary>
public static class BoardViews
{
    /// <summary>How many already-ended Calls the board shows behind the current one. The current Called Ticket is never repeated here.</summary>
    public const int RecentLimit = 6;

    public static async Task<BoardSnapshotDto> SnapshotAsync(AppDbContext db, string publicId, TimeProvider time)
    {
        await using var snapshot=db.Database.CurrentTransaction is null?await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead):null;
        var shop = await db.Set<Shop>().AsNoTracking().SingleOrDefaultAsync(x => x.PublicId == publicId)
            ?? throw new ApiException("not_found", 404);
        return await SnapshotAsync(db, shop, time);
    }

    public static async Task<BoardSnapshotDto> SnapshotAsync(AppDbContext db, Shop shop, TimeProvider time)
    {
        var queues = await db.Set<Domain.Queue>().AsNoTracking().Include(x => x.Service)
            .Where(x => x.Service.ShopId == shop.Id)
            .ToListAsync();
        var byQueue = queues.ToDictionary(x => x.Id);

        var waiting = await db.Set<Ticket>().AsNoTracking()
            .Where(x => x.ShopId == shop.Id && x.Status == TicketStatus.Waiting)
            .OrderBy(x => x.ReceiveOrder)
            .Select(x => new { x.QueueId, x.Number })
            .ToListAsync();
        var waitingByQueue = waiting.GroupBy(x => x.QueueId).ToDictionary(g => g.Key, g => g.Select(x => x.Number).ToArray());

        // At most one current Called Ticket exists Shop-wide because a partial unique index holds Called/InService.
        var current = await db.Set<Ticket>().AsNoTracking()
            .Where(x => x.ShopId == shop.Id && x.Status == TicketStatus.Called)
            .Select(x => new { x.Number, x.QueueId })
            .SingleOrDefaultAsync();

        // Recent Calls exclude the current one by construction, so a Started or ended Ticket can never be read as a second current Call.
        var recent = await db.Set<Ticket>().AsNoTracking()
            .Where(x => x.ShopId == shop.Id && x.CalledAt != null && x.Status != TicketStatus.Called)
            .OrderByDescending(x => x.CalledAt).ThenByDescending(x => x.ReceiveOrder)
            .Take(RecentLimit)
            .Select(x => new { x.Number, x.QueueId, x.Status })
            .ToListAsync();

        return new BoardSnapshotDto(
            shop.Name,
            shop.PublicId,
            shop.Version,
            current is null ? null : new BoardTicketDto(current.Number, byQueue.TryGetValue(current.QueueId, out var currentQueue) ? currentQueue.Service.Name : "", TicketStatus.Called.ToString()),
            recent.Select(x => new BoardTicketDto(x.Number, byQueue.TryGetValue(x.QueueId, out var recentQueue) ? recentQueue.Service.Name : "", x.Status.ToString())).ToArray(),
            queues.Where(x => !x.Service.Archived).OrderBy(x => x.Service.Name)
                .Select(x => new BoardServiceDto(x.Service.Id, x.Service.Name, x.Service.Prefix, x.Status,
                    waitingByQueue.TryGetValue(x.Id, out var numbers) ? numbers : Array.Empty<string>()))
                .ToArray(),
            time.GetUtcNow());
    }
}

public sealed record BoardTicketDto(string Number, string ServiceName, string Status);

public sealed record BoardServiceDto(Guid Id, string Name, string Prefix, string QueueStatus, string[] Waiting);

public sealed record BoardSnapshotDto(
    string ShopName,
    string PublicId,
    long Version,
    BoardTicketDto? CurrentCalled,
    BoardTicketDto[] Recent,
    BoardServiceDto[] Services,
    DateTimeOffset ServerTime);
