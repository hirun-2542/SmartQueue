using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

public static class CancelEndpoints
{
    public static void MapCancel(this WebApplication app)
    {
        app.MapPost("/api/t/{secret}/cancel",async(string secret,CancelRequest request,AppDbContext db,TimeProvider time)=>
        {
            var bearer=await TicketViews.FindAsync(db,secret,time);
            await using var unit=await ShopTransaction.OpenAsync(db,bearer.ShopId,null);
            var ticket=await db.Set<Ticket>().SingleAsync(x=>x.LinkHash==bearer.LinkHash);
            if(ticket.Status is not (TicketStatus.Waiting or TicketStatus.Called))
                throw new ApiException("not_cancellable",409,await TicketViews.CustomerAsync(db,ticket,time));
            if(ticket.Version!=request.Version)
                throw new ApiException("ticket_changed",409,await TicketViews.CustomerAsync(db,ticket,time));
            ticket.Status=TicketStatus.Cancelled;ticket.Version++;ticket.EndedAt=time.GetUtcNow();ticket.EndReason="cancelled";
            await unit.CommitAsync();
            return Results.Ok(await TicketViews.CustomerAsync(db,ticket,time));
        });
    }
    public sealed record CancelRequest(long Version);
}
