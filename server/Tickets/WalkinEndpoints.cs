using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Tickets;

public static class WalkinEndpoints
{
    public static void MapWalkin(this WebApplication app)
    {
        app.MapPost("/api/queues/{id:guid}/walkin",async(Guid id,WalkinRequest request,HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            if(request.Note?.Length>500)throw new ApiException("invalid_ticket",400);
            var shopId=await TicketEndpoints.ShopIdAsync(db,id);
            await using var unit=await ShopTransaction.OpenAsync(db,shopId,context.OwnerId());
            var queue=await db.Set<Domain.Queue>().Include(x=>x.Service).SingleAsync(x=>x.Id==id);
            if(queue.Service.Archived)throw new ApiException("service_archived");
            if(queue.Status!="Open"||queue.BusinessDayId is null)throw new ApiException("queue_closed");
            var day=await db.Set<BusinessDay>().SingleAsync(x=>x.Id==queue.BusinessDayId);
            day.Counter++;
            var ahead=await db.Set<Ticket>().CountAsync(x=>x.QueueId==id&&x.Status==TicketStatus.Waiting);
            var ticket=new Ticket{ShopId=shopId,QueueId=id,BusinessDayId=day.Id,Prefix=queue.Service.Prefix,Number=queue.Service.Prefix+day.Counter.ToString("D3"),Origin="WalkIn",Note=string.IsNullOrWhiteSpace(request.Note)?null:request.Note.Trim(),ReceivedAt=time.GetUtcNow(),JoinedAhead=ahead};
            db.Add(ticket);await unit.CommitAsync();
            return Results.Json(new{ticket=await OwnerViews.TicketAsync(db,ticket,time),joinedAhead=ticket.JoinedAhead},statusCode:201);
        }).RequireAuthorization();
    }
    public sealed record WalkinRequest(string? Note);
}
