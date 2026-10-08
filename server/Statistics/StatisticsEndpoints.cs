using SmartQueue.Api.Data;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Statistics;

/// <summary>
/// The single Owner-only read of Shop statistics. The route is authenticated, and the Shop is resolved by
/// <c>Id</c> together with the caller's Owner id, so another Owner's Shop is answered as not found (404)
/// exactly like an unknown Shop instead of disclosing that it exists. Everything the response contains comes
/// from <see cref="StatisticsSelection"/> and <see cref="StatisticsViews"/>, which the peak-hours view reuses.
///
/// Precise range contract:
/// <c>GET /api/shops/{id}/statistics?range=current|latest7|latest30&amp;serviceId={guid}</c>
/// <list type="bullet">
/// <item><c>range</c> is optional and defaults to <c>latest7</c>; any other value is <c>invalid_range</c>
/// (HTTP 400). <c>current</c> means each Queue's current/latest Business day, <c>latest7</c> and
/// <c>latest30</c> mean that many latest Business days of each Queue — never calendar dates and never a
/// Shop-wide Business day.</item>
/// <item><c>serviceId</c> is optional; a Service of another Shop is <c>not_found</c> (HTTP 404).</item>
/// <item>A Shop that is not the caller's is <c>not_found</c> (HTTP 404).</item>
/// </list>
/// </summary>
public static class StatisticsEndpoints
{
    public static void MapStatistics(this WebApplication app)
    {
        app.MapGet("/api/shops/{id:guid}/statistics", async (Guid id, string? range, Guid? serviceId, HttpContext context, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        {
            // One read-only RepeatableRead snapshot covers the selection and the Ticket rows behind it, so the
            // numbers come from a single committed state instead of a torn pair of reads.
            await using var snapshot = await StatisticsSelection.BeginSnapshotAsync(db, cancellationToken);
            var selection = await StatisticsSelection.ResolveAsync(db, id, context.OwnerId(), serviceId, StatisticsSelection.ParseRange(range), cancellationToken);
            var tickets = await StatisticsSelection.TicketRowsAsync(db, selection, cancellationToken);
            return Results.Ok(StatisticsViews.Compute(selection, tickets, time.GetUtcNow()));
        }).RequireAuthorization();
    }
}
