using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Live;

/// <summary>
/// Live hub at <c>/live</c>. Every subscription is authorized on its own scope: an Owner Shop needs the
/// authenticated Owner, a public Shop needs only its public identifier, and a private Ticket needs the
/// bearer Ticket link that the Customer already holds. Direct replies use <c>snapshot</c>; post-commit
/// fan-out uses <c>update</c>, so clients can always resync from a snapshot and still drop out-of-order updates.
/// </summary>
public sealed class LiveHub(AppDbContext db, TimeProvider time, LiveSubscriptions subscriptions) : Hub
{
    public const string SnapshotMethod = "snapshot";
    public const string UpdateMethod = "update";

    public async Task SubscribeShop(Guid shopId, Guid? queueId = null)
    {
        var ownerId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new HubException("unauthenticated");
        var shop = await db.Set<Shop>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == shopId && x.OwnerId == ownerId)
            ?? throw new HubException("not_found");
        var message = await LiveMessages.OwnerSnapshotAsync(db, shop.Id, ownerId, queueId, time)
            ?? throw new HubException("not_found");
        subscriptions.SetOwner(Context.ConnectionId, ownerId, shop.Id, queueId);
        await Clients.Caller.SendAsync(SnapshotMethod, message);
    }

    public async Task SubscribePublic(string publicId)
    {
        var shop = await db.Set<Shop>().AsNoTracking().SingleOrDefaultAsync(x => x.PublicId == publicId)
            ?? throw new HubException("not_found");
        var previous = subscriptions.SetPublic(Context.ConnectionId, shop.Id, shop.PublicId);
        if (previous is { } stale && stale != shop.Id) await Groups.RemoveFromGroupAsync(Context.ConnectionId, LiveGroups.Public(stale));
        await Groups.AddToGroupAsync(Context.ConnectionId, LiveGroups.Public(shop.Id));
        await Clients.Caller.SendAsync(SnapshotMethod, LiveMessages.PublicChanged(shop.Id, shop.PublicId, shop.Version, time.GetUtcNow()));
    }

    public async Task SubscribeTicket(string secret)
    {
        var ticket = await FindTicketAsync(secret);
        var shopVersion = await db.Set<Shop>().AsNoTracking().Where(x => x.Id == ticket.ShopId).Select(x => x.Version).SingleAsync();
        subscriptions.AddTicket(Context.ConnectionId, ticket.ShopId, ticket.Id);
        await Clients.Caller.SendAsync(SnapshotMethod, LiveMessages.TicketChanged(ticket.ShopId, shopVersion, ticket, await TicketViews.CustomerAsync(db, ticket, time)));
    }

    public async Task Unsubscribe()
    {
        if (subscriptions.RemoveConnection(Context.ConnectionId) is { } publicShopId)
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, LiveGroups.Public(publicShopId));
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        subscriptions.RemoveConnection(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    private async Task<Ticket> FindTicketAsync(string secret)
    {
        try
        {
            return await TicketViews.FindAsync(db, secret, time);
        }
        catch (ApiException error)
        {
            throw new HubException(error.Code);
        }
    }
}
