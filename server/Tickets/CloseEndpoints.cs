using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Tickets;

/// <summary>
/// Owner actions for ending a Queue: stop accepting while the Waiting Tickets are served out, and Drop the
/// Waiting Tickets immediately. Both take the Shop row lock, so they are serialized against joins and against
/// every Ticket transition: a join that commits first is part of the work being drained or Dropped, and a join
/// that arrives after the Queue stopped accepting is refused instead of issuing a Ticket behind the close.
/// Both compare the observed Shop version and answer a stale request with the current console snapshot.
/// Neither endpoint ends the Business day itself — <see cref="QueueClosing.SettleAsync"/> does that inside
/// <c>ShopTransaction.CommitAsync</c>, so an empty Queue closes in this same operation and a Queue that still
/// holds work stays Closing until the last active Ticket ends.
/// </summary>
public static class CloseEndpoints
{
    public static void MapClose(this WebApplication app)
    {
        var routes = app.MapGroup("/api").RequireAuthorization();

        routes.MapPost("/queues/{id:guid}/stop", async (Guid id, ServingEndpoints.VersionRequest request, HttpContext context, AppDbContext db, TimeProvider time) =>
        {
            var shopId = await TicketEndpoints.ShopIdAsync(db, id);
            await using var unit = await ShopTransaction.OpenAsync(db, shopId, context.OwnerId());
            if (request.Version != unit.Shop.Version)
                throw new ApiException("state_changed", 409, await OwnerViews.ConsoleAsync(db, shopId, context.OwnerId(), id, time));
            var queue = await db.Set<Domain.Queue>().Include(x => x.Service).SingleAsync(x => x.Id == id);
            if (queue.Status == QueueClosing.ClosedStatus) throw new ApiException("queue_closed");
            if (queue.Status == QueueClosing.ClosingStatus) throw new ApiException("queue_closing");
            queue.Status = QueueClosing.ClosingStatus;
            await unit.CommitAsync();
            return Results.Ok(await StateAsync(db, queue, [], time));
        });

        routes.MapPost("/queues/{id:guid}/drop", async (Guid id, DropRequest request, HttpContext context, AppDbContext db, TimeProvider time) =>
        {
            if (!request.Confirm) throw new ApiException("confirmation_required", 400);
            var shopId = await TicketEndpoints.ShopIdAsync(db, id);
            await using var unit = await ShopTransaction.OpenAsync(db, shopId, context.OwnerId());
            if (request.Version != unit.Shop.Version)
                throw new ApiException("state_changed", 409, await OwnerViews.ConsoleAsync(db, shopId, context.OwnerId(), id, time));
            var queue = await db.Set<Domain.Queue>().Include(x => x.Service).SingleAsync(x => x.Id == id);
            if (queue.Status == QueueClosing.ClosedStatus) throw new ApiException("queue_closed");
            var dropped = await QueueClosing.DropWaitingAsync(db, id, time.GetUtcNow());
            // Called and InService Tickets are untouched, so the Queue is Closing whenever work is still held.
            queue.Status = QueueClosing.ClosingStatus;
            await unit.CommitAsync();
            return Results.Ok(await StateAsync(db, queue, dropped.Select(x => x.Id).ToArray(), time));
        });
    }

    private static async Task<QueueStateDto> StateAsync(AppDbContext db, Domain.Queue queue, Guid[] droppedTicketIds, TimeProvider time)
    {
        DateTimeOffset? businessDayClosedAt = null;
        if (queue.BusinessDayId is { } dayId)
            businessDayClosedAt = (await db.Set<BusinessDay>().SingleOrDefaultAsync(x => x.Id == dayId))?.ClosedAt;
        return new(queue.Id, queue.Status, queue.BusinessDayId, businessDayClosedAt, droppedTicketIds.Length, droppedTicketIds, time.GetUtcNow());
    }

    /// <summary>Body of an explicit Drop; <see cref="Confirm"/> must be true, which is the confirmation itself.</summary>
    public sealed record DropRequest(long Version, bool Confirm);
}

public sealed record QueueStateDto(Guid QueueId, string Status, Guid? BusinessDayId, DateTimeOffset? BusinessDayClosedAt, int DroppedCount, Guid[] DroppedTicketIds, DateTimeOffset ServerTime);
