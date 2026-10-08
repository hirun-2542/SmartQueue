using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Shops;

/// <summary>
/// Owner action that hides a Service the Shop no longer offers, without deleting anything. The Service row,
/// its Queue, its Business days and every Ticket stay exactly as they are: old Ticket links and the Ticket
/// number each one was issued with keep working and stay readable. Archiving never ends a Waiting Ticket —
/// ending those stays the explicit Drop operation — so it only stops the Queue accepting new work and lets
/// the Tickets already Waiting be Called and served to the end. The shared close invariant in
/// <c>ShopTransaction.CommitAsync</c> ends the Business day when the last active Ticket is gone, so an empty
/// Queue closes in the same operation. The freed Prefix becomes reusable because the active-Prefix unique
/// index ignores archived Services, and an issued Ticket keeps the Prefix it was issued with even after the
/// Service Prefix is edited.
/// </summary>
public static class ArchiveEndpoints
{
    public static void MapArchive(this WebApplication app)
    {
        app.MapPost("/api/services/{id:guid}/archive", async (Guid id, ArchiveRequest request, HttpContext context, AppDbContext db, TimeProvider time) =>
        {
            var shopId = await db.Set<Service>().Where(x => x.Id == id).Select(x => (Guid?)x.ShopId).SingleOrDefaultAsync()
                ?? throw new ApiException("not_found", 404);
            await using var unit = await ShopTransaction.OpenAsync(db, shopId, context.OwnerId());
            if (request.Version != unit.Shop.Version)
                throw new ApiException("state_changed", 409, await ShopEndpoints.ReadAsync(db, shopId, context.OwnerId(), time.GetUtcNow()));
            var service = await db.Set<Service>().Include(x => x.Queue).SingleAsync(x => x.Id == id);
            service.Archived = true;
            // Stop accepting new work the same way "Stop accepting" does; a Queue that still holds a Waiting,
            // Called or InService Ticket drains as Closing and the shared invariant closes it when that work ends.
            if (service.Queue.Status == QueueClosing.OpenStatus) service.Queue.Status = QueueClosing.ClosingStatus;
            await unit.CommitAsync();
            return Results.Ok(ShopEndpoints.ServiceSnapshot(service));
        }).RequireAuthorization();
    }

    /// <summary>Body of an archive; <see cref="Version"/> is the observed Shop version, so a stale editor is refused.</summary>
    public sealed record ArchiveRequest(long Version);
}
