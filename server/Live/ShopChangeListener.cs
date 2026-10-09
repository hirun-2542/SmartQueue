using System.Data;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Live;

/// <summary>
/// Fan-out for one API instance: LISTENs the <c>smartqueue_changes</c> channel that ShopTransaction
/// notifies after every commit, then pushes the current committed state to the connections this
/// instance holds. PostgreSQL stays the source of truth, so a rolled back transaction notifies nothing
/// and a reconnect always resyncs from the database instead of replaying a lost message.
/// </summary>
public sealed class ShopChangeListener(
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    IHubContext<LiveHub> hub,
    LiveSubscriptions subscriptions,
    TimeProvider time,
    ILogger<ShopChangeListener> log) : BackgroundService
{
    public const string ChannelName = "smartqueue_changes";
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var connectionString = configuration.GetConnectionString("Database")
            ?? throw new InvalidOperationException("Configure ConnectionStrings:Database");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ListenAsync(connectionString, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception error)
            {
                log.LogWarning(error, "Live change listener lost its PostgreSQL connection; retrying");
                try { await Task.Delay(RetryDelay, stoppingToken); } catch (OperationCanceledException) { }
            }
        }
    }

    private async Task ListenAsync(string connectionString, CancellationToken stoppingToken)
    {
        var pending = System.Threading.Channels.Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = true });
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(stoppingToken);
        connection.Notification += (_, notification) =>
        {
            if (Guid.TryParse(notification.Payload, out var shopId)) pending.Writer.TryWrite(shopId);
        };
        await using (var command = new NpgsqlCommand($"LISTEN {ChannelName}", connection))
            await command.ExecuteNonQueryAsync(stoppingToken);
        var fanOut = ConsumeAsync(pending.Reader, stoppingToken);
        try
        {
            while (!stoppingToken.IsCancellationRequested) await connection.WaitAsync(stoppingToken);
        }
        finally
        {
            pending.Writer.TryComplete();
            await fanOut;
        }
    }

    private async Task ConsumeAsync(ChannelReader<Guid> reader, CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var shopId in reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await PublishAsync(shopId, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
                catch (Exception error)
                {
                    log.LogWarning(error, "Failed to publish live updates for shop {ShopId}", shopId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    private async Task PublishAsync(Guid shopId, CancellationToken token)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var readSnapshot=await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,token);
        var shop = await db.Set<Shop>().AsNoTracking().Where(x => x.Id == shopId).Select(x => new { x.Id, x.PublicId, x.Version }).SingleOrDefaultAsync(token);
        if (shop is null) return;
        var now = time.GetUtcNow();

        var snapshots = new Dictionary<(string OwnerId, Guid? QueueId), LiveMessage?>();
        foreach (var owner in subscriptions.OwnerSubscriptions(shopId))
        {
            var key = (owner.OwnerId, owner.QueueId);
            if (!snapshots.TryGetValue(key, out var message))
            {
                message = await LiveMessages.OwnerSnapshotAsync(db, shopId, owner.OwnerId, owner.QueueId, time);
                snapshots[key] = message;
            }
            if (message is not null) await hub.Clients.Client(owner.ConnectionId).SendAsync(LiveHub.UpdateMethod, message, cancellationToken: token);
        }

        await hub.Clients.Group(LiveGroups.Public(shopId)).SendAsync(LiveHub.UpdateMethod, LiveMessages.PublicChanged(shop.Id, shop.PublicId, shop.Version, now), cancellationToken: token);

        foreach (var target in subscriptions.TicketSubscriptions(shopId))
        {
            var ticket = await db.Set<Ticket>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == target.TicketId, token);
            if (ticket is null || ticket.IsLinkExpired(now))
            {
                if (ticket is not null)
                    await hub.Clients.Clients(target.ConnectionIds).SendAsync(LiveHub.UpdateMethod, LiveMessages.TicketExpired(shopId, shop.Version, ticket.Id, now), cancellationToken: token);
                subscriptions.RemoveTicket(shopId, target.TicketId);
                continue;
            }
            var snapshot = await TicketViews.CustomerAsync(db, ticket, time);
            await hub.Clients.Clients(target.ConnectionIds).SendAsync(LiveHub.UpdateMethod, LiveMessages.TicketChanged(shopId, shop.Version, ticket, snapshot), cancellationToken: token);
        }
    }
}
