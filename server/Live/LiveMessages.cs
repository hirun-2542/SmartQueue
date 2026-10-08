using System.Text.Json.Serialization;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Live;

public static class LiveKinds
{
    public const string Shop = "shop";
    public const string Public = "public";
    public const string Ticket = "ticket";
    public const string Expired = "expired";
}

/// <summary>
/// One shape for every live payload. Only the scope that owns the data receives it, so a public
/// group never carries a Customer note, a Ticket link or any Owner capability.
/// </summary>
public sealed record LiveMessage(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("shopId")] Guid ShopId,
    [property: JsonPropertyName("version")] long Version,
    [property: JsonPropertyName("serverTime")] DateTimeOffset ServerTime,
    [property: JsonPropertyName("publicId")] string? PublicId = null,
    [property: JsonPropertyName("ticketId")] Guid? TicketId = null,
    [property: JsonPropertyName("console")] ConsoleDto? Console = null,
    [property: JsonPropertyName("ticket")] CustomerTicketDto? Ticket = null);

internal static class LiveGroups
{
    public static string Public(Guid shopId) => $"live:public:{shopId}";
}

internal static class LiveMessages
{
    public static LiveMessage Shop(Guid shopId, long version, DateTimeOffset serverTime, ConsoleDto? console = null) =>
        new(LiveKinds.Shop, shopId, version, serverTime, Console: console);

    public static LiveMessage PublicChanged(Guid shopId, string publicId, long version, DateTimeOffset serverTime) =>
        new(LiveKinds.Public, shopId, version, serverTime, PublicId: publicId);

    public static LiveMessage TicketChanged(Ticket ticket, CustomerTicketDto snapshot) =>
        new(LiveKinds.Ticket, ticket.ShopId, ticket.Version, snapshot.ServerTime, TicketId: ticket.Id, Ticket: snapshot);

    public static LiveMessage TicketExpired(Ticket ticket, DateTimeOffset serverTime) =>
        new(LiveKinds.Expired, ticket.ShopId, ticket.Version, serverTime, TicketId: ticket.Id);

    public static async Task<LiveMessage?> OwnerSnapshotAsync(AppDbContext db, Guid shopId, string ownerId, Guid? queueId, TimeProvider time)
    {
        try
        {
            var console = await OwnerViews.ConsoleAsync(db, shopId, ownerId, queueId, time);
            return Shop(shopId, console.Version, console.ServerTime, console);
        }
        catch (ApiException)
        {
            return null;
        }
    }
}
