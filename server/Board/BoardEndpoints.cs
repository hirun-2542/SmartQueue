using SmartQueue.Api.Data;

namespace SmartQueue.Api.Board;

public static class BoardEndpoints
{
    /// <summary>
    /// Anonymous read-only Display board for one Shop, addressed only by its public identifier. GET is
    /// safe, so the CSRF middleware never touches it; unknown identifiers answer the standard not_found.
    /// </summary>
    public static void MapBoard(this WebApplication app)
    {
        app.MapGet("/api/board/{publicId}", async (string publicId, AppDbContext db, TimeProvider time) =>
            Results.Ok(await BoardViews.SnapshotAsync(db, publicId, time)));
    }
}
