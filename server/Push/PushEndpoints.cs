using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Push;

/// <summary>
/// The Customer-facing opt-in contract. It is reached with the same bearer Ticket link as the rest of the
/// Customer view, so no notification state can be created for a Ticket the caller cannot already read. The
/// status endpoint answers what the browser should show, the subscribe endpoint turns a real browser
/// subscription into an association, and the remove endpoint drops one association without touching the
/// Ticket. All three go through the Shop transaction, so a subscribe cannot interleave with the transaction
/// that ends the Ticket and leave an association behind a Ticket that is already terminal.
/// </summary>
public static class PushEndpoints
{
    public static void MapSmartQueuePush(this WebApplication routes)
    {
        routes.MapGet("/api/t/{secret}/push", async (string secret, AppDbContext db, TimeProvider time, VapidKeys keys) =>
        {
            var ticket = await TicketViews.FindAsync(db, secret, time);
            var enabled = keys.Configured && await db.Set<PushSubscription>().AsNoTracking().AnyAsync(x => x.TicketId == ticket.Id);
            return Results.Ok(new PushStateDto(enabled, keys.PublicKey, ticket.Id));
        });

        routes.MapPost("/api/t/{secret}/push", async (string secret, PushSubscribeRequest request, AppDbContext db, TimeProvider time, VapidKeys keys) =>
        {
            if (!keys.Configured) throw new ApiException("push_unavailable", 503);
            var endpoint = PushSubscriptionValidation.RequireEndpoint(request.Endpoint);
            var (p256dh, auth) = PushSubscriptionValidation.RequireKeys(request.P256dh, request.Auth);
            var language = PushSubscriptionValidation.RequireLanguage(request.Language);
            var bearer = await TicketViews.FindAsync(db, secret, time);

            await using var unit = await ShopTransaction.OpenAsync(db, bearer.ShopId, null);
            var ticket = await db.Set<Ticket>().SingleAsync(x => x.LinkHash == bearer.LinkHash);
            if (!ticket.IsActive())
                throw new ApiException("ticket_ended", 409);

            var association = await db.Set<PushSubscription>().SingleOrDefaultAsync(x => x.TicketId == ticket.Id && x.Endpoint == endpoint);
            if (association is null)
                db.Add(new PushSubscription { ShopId = ticket.ShopId, TicketId = ticket.Id, QueueId = ticket.QueueId, Endpoint = endpoint, P256dh = p256dh, Auth = auth, Language = language, CreatedAt = time.GetUtcNow() });
            else
            {
                association.P256dh = p256dh; association.Auth = auth; association.Language = language;
            }
            await db.SaveChangesAsync();
            await unit.Transaction.CommitAsync();
            return Results.Ok(new PushStateDto(true, keys.PublicKey, ticket.Id));
        });

        routes.MapPost("/api/t/{secret}/push/remove", async (string secret, PushUnsubscribeRequest request, AppDbContext db, TimeProvider time, VapidKeys keys) =>
        {
            var endpoint = PushSubscriptionValidation.RequireEndpoint(request.Endpoint);
            var bearer = await TicketViews.FindAsync(db, secret, time);

            await using var unit = await ShopTransaction.OpenAsync(db, bearer.ShopId, null);
            var association = await db.Set<PushSubscription>().SingleOrDefaultAsync(x => x.TicketId == bearer.Id && x.Endpoint == endpoint);
            if (association is not null)
            {
                db.Remove(association);
                await db.SaveChangesAsync();
                await unit.Transaction.CommitAsync();
            }
            return Results.Ok(new PushStateDto(false, keys.PublicKey, bearer.Id));
        });
    }

    /// <summary>What the Customer view needs: whether this Ticket has an association, the application server key to subscribe with, and the opaque Ticket id the worker stores the link against.</summary>
    public sealed record PushStateDto(bool Enabled, string? PublicKey, Guid TicketId);

    /// <summary>A browser subscription flattened for binding. <c>keys</c> is passed as the two named fields the encryption needs.</summary>
    public sealed record PushSubscribeRequest(string? Endpoint, string? P256dh, string? Auth, string? Language);

    public sealed record PushUnsubscribeRequest(string? Endpoint);
}
