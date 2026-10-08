using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;
using SmartQueue.Api.Tickets;

namespace SmartQueue.Api.Demo;

public static class DemoSimulator
{
    public static void MapDemoSimulator(this WebApplication app)
    {
        app.MapGet("/api/demo/context",async(HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            var ownerId=context.OwnerId();var expires=await RequireDemoAsync(db,ownerId,time.GetUtcNow());
            var shop=await db.Set<Shop>().AsNoTracking().Where(x=>x.OwnerId==ownerId).Select(x=>new{x.Id,x.PublicId}).FirstAsync();
            return Results.Ok(new{shopId=shop.Id,shop.PublicId,expiresAt=expires,serverTime=time.GetUtcNow()});
        }).RequireAuthorization();
        app.MapPost("/api/demo/queues/{id:guid}/tickets",async(Guid id,TicketEndpoints.JoinRequest request,HttpContext context,AppDbContext db,TimeProvider time,TicketLinks links)=>
        {
            var ownerId=context.OwnerId();await RequireDemoAsync(db,ownerId,time.GetUtcNow());
            if(!await db.Set<Domain.Queue>().AnyAsync(q=>q.Id==id&&q.Service.Shop.OwnerId==ownerId))throw new ApiException("not_found",404);
            return await TicketReceipt.ReceiveAsync(id,request,context,db,time,links,ownerId);
        }).RequireAuthorization();
    }

    private static async Task<DateTimeOffset> RequireDemoAsync(AppDbContext db,string ownerId,DateTimeOffset now)
    {
        var expires=await db.Users.AsNoTracking().Where(u=>u.Id==ownerId).Select(u=>u.DemoExpiresAt).SingleOrDefaultAsync();
        if(expires is null)throw new ApiException("demo_required",403);
        if(expires<=now)throw new ApiException("demo_expired",401);
        return expires.Value;
    }
}
