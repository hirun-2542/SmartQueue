using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Tickets;

public static class ServingEndpoints
{
    public static void MapServing(this WebApplication app)
    {
        var routes=app.MapGroup("/api").RequireAuthorization();
        routes.MapGet("/shops/{id:guid}/console",async(Guid id,Guid? queueId,HttpContext context,AppDbContext db,TimeProvider time)=>Results.Ok(await OwnerViews.ConsoleAsync(db,id,context.OwnerId(),queueId,time)));
        routes.MapPost("/queues/{id:guid}/call",async(Guid id,HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            var shopId=await TicketEndpoints.ShopIdAsync(db,id);
            await using var unit=await ShopTransaction.OpenAsync(db,shopId,context.OwnerId());
            if(await db.Set<Ticket>().AnyAsync(x=>x.ShopId==shopId&&(x.Status==TicketStatus.Called||x.Status==TicketStatus.InService)))throw new ApiException("shop_busy",409,await OwnerViews.ConsoleAsync(db,shopId,context.OwnerId(),id,time));
            var queue=await db.Set<Domain.Queue>().Include(x=>x.Service).SingleAsync(x=>x.Id==id);
            if(queue.Status==QueueStatus.Closed)throw new ApiException("queue_closed",409,await OwnerViews.ConsoleAsync(db,shopId,context.OwnerId(),id,time));
            var ticket=await db.Set<Ticket>().Where(x=>x.QueueId==id&&x.Status==TicketStatus.Waiting).OrderBy(x=>x.ReceiveOrder).FirstOrDefaultAsync();
            if(ticket is null)throw new ApiException("queue_empty",409,await OwnerViews.ConsoleAsync(db,shopId,context.OwnerId(),id,time));
            var now=time.GetUtcNow();
            DateTimeOffset deadline;
            try{deadline=now.AddMinutes(queue.Service.CallTimeoutMinutes);}catch(ArgumentOutOfRangeException){throw new ApiException("invalid_service",400);}
            ticket.Status=TicketStatus.Called;ticket.Version++;ticket.CalledAt=now;ticket.Deadline=deadline;
            await unit.CommitAsync();return Results.Ok(await OwnerViews.TicketAsync(db,ticket,time));
        });
        routes.MapPost("/tickets/{id:guid}/start",(Guid id,VersionRequest r,HttpContext c,AppDbContext db,TimeProvider time)=>TransitionAsync(id,r,c,db,time,TicketStatus.Called,TicketStatus.InService));
        routes.MapPost("/tickets/{id:guid}/complete",(Guid id,VersionRequest r,HttpContext c,AppDbContext db,TimeProvider time)=>TransitionAsync(id,r,c,db,time,TicketStatus.InService,TicketStatus.Completed));
        routes.MapPost("/tickets/{id:guid}/skip",(Guid id,VersionRequest r,HttpContext c,AppDbContext db,TimeProvider time)=>TransitionAsync(id,r,c,db,time,TicketStatus.Called,TicketStatus.Skipped));
    }
    private static async Task<IResult> TransitionAsync(Guid id,VersionRequest request,HttpContext context,AppDbContext db,TimeProvider time,TicketStatus expected,TicketStatus target)
    {
        var shopId=await db.Set<Ticket>().Where(x=>x.Id==id).Select(x=>(Guid?)x.ShopId).SingleOrDefaultAsync()??throw new ApiException("not_found",404);
        await using var unit=await ShopTransaction.OpenAsync(db,shopId,context.OwnerId());
        var ticket=await db.Set<Ticket>().SingleAsync(x=>x.Id==id);
        if(ticket.Status!=expected||ticket.Version!=request.Version)throw new ApiException("ticket_changed",409,await OwnerViews.TicketAsync(db,ticket,time));
        var now=time.GetUtcNow();ticket.Status=target;ticket.Version++;
        if(target==TicketStatus.InService)ticket.StartedAt=now;
        else{ticket.EndedAt=now;ticket.EndReason=target==TicketStatus.Completed?"completed":"manual_skip";}
        await unit.CommitAsync();return Results.Ok(await OwnerViews.TicketAsync(db,ticket,time));
    }
    public sealed record VersionRequest(long Version);
}
