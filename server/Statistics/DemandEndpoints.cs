using SmartQueue.Api.Data;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Statistics;

public static class DemandEndpoints
{
    public static void MapDemand(this WebApplication app)
    {
        app.MapGet("/api/shops/{id:guid}/demand",async(Guid id,string? range,Guid? serviceId,HttpContext context,AppDbContext db,TimeProvider time,CancellationToken cancellationToken)=>
        {
            await using var snapshot=await StatisticsSelection.BeginSnapshotAsync(db,cancellationToken);
            var selection=await StatisticsSelection.ResolveAsync(db,id,context.OwnerId(),serviceId,StatisticsSelection.ParseRange(range),cancellationToken);
            var tickets=await StatisticsSelection.TicketRowsAsync(db,selection,cancellationToken);
            return Results.Ok(DemandViews.Compute(selection,tickets,time.GetUtcNow()));
        }).RequireAuthorization();
    }
}
