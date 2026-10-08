using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>
/// Removes Try demo accounts whose fixture has expired. Foreign-key cascades delete only their Shop, Services,
/// Queues, Business days and Tickets, and the filter never matches a real account.
/// </summary>
public static class DemoCleanup
{
    /// <summary>
    /// Deletes expired demo accounts, optionally restricted to one account. The periodic worker sweeps every
    /// expired session; the HTTP path restricts the same sweep to the session it just observed as expired.
    /// </summary>
    public static Task<int> SweepAsync(AppDbContext db, DateTimeOffset now, string? ownerId = null, CancellationToken cancellationToken = default)
    {
        var expired = db.Set<OwnerAccount>().Where(x => x.DemoExpiresAt != null && x.DemoExpiresAt <= now);
        if (ownerId is not null) expired = expired.Where(x => x.Id == ownerId);
        return expired.ExecuteDeleteAsync(cancellationToken);
    }
}
