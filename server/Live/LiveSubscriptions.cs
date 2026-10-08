using System.Collections.Concurrent;

namespace SmartQueue.Api.Live;

/// <summary>
/// Per-instance record of which live scopes a SignalR connection asked for. It exists so a post-commit
/// PostgreSQL notification can be turned into per-connection snapshots without assuming every
/// connection wants the same payload. Entries are removed when a connection disconnects.
/// </summary>
public sealed class LiveSubscriptions
{
    public readonly record struct OwnerScope(string ConnectionId, string OwnerId, Guid ShopId, Guid? QueueId);
    public readonly record struct TicketTarget(Guid TicketId, IReadOnlyList<string> ConnectionIds);
    private readonly record struct TicketKey(Guid ShopId, Guid TicketId);

    private readonly ConcurrentDictionary<string, OwnerScope> owners = new();
    private readonly ConcurrentDictionary<string, (Guid ShopId, string PublicId)> publics = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<TicketKey, byte>> ticketKeysByConnection = new();
    private readonly ConcurrentDictionary<TicketKey, ConcurrentDictionary<string, byte>> connectionsByTicket = new();

    public void SetOwner(string connectionId, string ownerId, Guid shopId, Guid? queueId) =>
        owners[connectionId] = new OwnerScope(connectionId, ownerId, shopId, queueId);

    public IReadOnlyList<OwnerScope> OwnerSubscriptions(Guid shopId)
    {
        var matches = new List<OwnerScope>();
        foreach (var scope in owners.Values)
            if (scope.ShopId == shopId)
                matches.Add(scope);
        return matches;
    }

    /// <summary>Stores the public scope and returns the Shop it replaced, so the old group membership can be dropped.</summary>
    public Guid? SetPublic(string connectionId, Guid shopId, string publicId)
    {
        if (publics.TryGetValue(connectionId, out var previous))
        {
            publics[connectionId] = (shopId, publicId);
            return previous.ShopId;
        }
        publics[connectionId] = (shopId, publicId);
        return null;
    }

    public void AddTicket(string connectionId, Guid shopId, Guid ticketId)
    {
        var key = new TicketKey(shopId, ticketId);
        connectionsByTicket.GetOrAdd(key, _ => new ConcurrentDictionary<string, byte>(StringComparer.Ordinal)).TryAdd(connectionId, 0);
        ticketKeysByConnection.GetOrAdd(connectionId, _ => new ConcurrentDictionary<TicketKey, byte>()).TryAdd(key, 0);
    }

    public IReadOnlyList<TicketTarget> TicketSubscriptions(Guid shopId)
    {
        var targets = new List<TicketTarget>();
        foreach (var pair in connectionsByTicket)
            if (pair.Key.ShopId == shopId && !pair.Value.IsEmpty)
                targets.Add(new TicketTarget(pair.Key.TicketId, pair.Value.Keys.ToArray()));
        return targets;
    }

    public void RemoveTicket(Guid shopId, Guid ticketId)
    {
        if (!connectionsByTicket.TryRemove(new TicketKey(shopId, ticketId), out var connections)) return;
        foreach (var connectionId in connections.Keys) DropKey(connectionId, new TicketKey(shopId, ticketId));
    }

    /// <summary>Clears every scope of one connection; returns the public Shop it was watching, if any.</summary>
    public Guid? RemoveConnection(string connectionId)
    {
        owners.TryRemove(connectionId, out _);
        if (ticketKeysByConnection.TryRemove(connectionId, out var keys))
            foreach (var key in keys.Keys)
                if (connectionsByTicket.TryGetValue(key, out var connections))
                    connections.TryRemove(connectionId, out _);
        return publics.TryRemove(connectionId, out var entry) ? entry.ShopId : null;
    }

    private void DropKey(string connectionId, TicketKey key)
    {
        if (!ticketKeysByConnection.TryGetValue(connectionId, out var keys)) return;
        keys.TryRemove(key, out _);
        if (keys.IsEmpty) ticketKeysByConnection.TryRemove(connectionId, out _);
    }
}
