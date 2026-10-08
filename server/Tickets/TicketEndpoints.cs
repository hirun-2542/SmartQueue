using System.Data;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Tickets;

public static class TicketEndpoints
{
    public static void MapTickets(this WebApplication app)
    {
        app.MapPost("/api/queues/{id:guid}/open",async(Guid id,HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            var shopId=await ShopIdAsync(db,id);
            await using var unit=await ShopTransaction.OpenAsync(db,shopId,context.OwnerId());
            var queue=await db.Set<Domain.Queue>().Include(x=>x.Service).SingleAsync(x=>x.Id==id);
            if(queue.Service.Archived)throw new ApiException("service_archived");
            if(queue.Status!="Closed")throw new ApiException("queue_not_closed");
            var day=new BusinessDay{QueueId=id,OpenedAt=time.GetUtcNow()};db.Add(day);queue.BusinessDayId=day.Id;queue.Status="Open";
            await unit.CommitAsync();return Results.Ok(new{queue.Id,queue.Status,queue.BusinessDayId,serverTime=time.GetUtcNow()});
        }).RequireAuthorization();
        app.MapPost("/api/queues/{id:guid}/tickets",(Guid id,JoinRequest request,HttpContext context,AppDbContext db,TimeProvider time,TicketLinks links)=>TicketReceipt.ReceiveAsync(id,request,context,db,time,links));
        app.MapGet("/api/t/{secret}",async(string secret,AppDbContext db,TimeProvider time)=>
        {
            await using var snapshot=await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
            return Results.Ok(await TicketViews.CustomerAsync(db,await TicketViews.FindAsync(db,secret,time),time));
        });
        app.MapGet("/api/s/{publicId}",async(string publicId,HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            await using var snapshot=await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead);
            var shop=await db.Set<Shop>().AsNoTracking().Include(x=>x.Services).ThenInclude(x=>x.Queue).SingleOrDefaultAsync(x=>x.PublicId==publicId)??throw new ApiException("not_found",404);
            var counts=await db.Set<Ticket>().Where(x=>x.ShopId==shop.Id&&x.Status==TicketStatus.Waiting).GroupBy(x=>x.QueueId).Select(g=>new{Id=g.Key,Count=g.Count()}).ToDictionaryAsync(x=>x.Id,x=>x.Count);
            var device=DeviceIdentity.Get(context);
            var deviceCounts=await db.Set<Ticket>().Where(x=>x.ShopId==shop.Id&&x.DeviceId==device&&(x.Status==TicketStatus.Waiting||x.Status==TicketStatus.Called||x.Status==TicketStatus.InService)).GroupBy(x=>x.QueueId).Select(g=>new{Id=g.Key,Count=g.Count()}).ToDictionaryAsync(x=>x.Id,x=>x.Count);
            var services=new List<object>();
            foreach(var service in shop.Services.Where(x=>!x.Archived).OrderBy(x=>x.Name))
            {
                var waitingCount=counts.GetValueOrDefault(service.Queue.Id);
                var estimate=await WaitEstimates.ServiceAsync(db,service.Id,waitingCount);
                services.Add(new{service.Id,service.Name,service.Prefix,queue=new{service.Queue.Id,service.Queue.Status,waitingCount,deviceActiveCount=deviceCounts.GetValueOrDefault(service.Queue.Id),estimateSampleCount=estimate.SampleCount,estimatedWaitSeconds=estimate.EstimatedWaitSeconds}});
            }
            return Results.Ok(new{shop.Name,shop.PublicId,shop.Version,serverTime=time.GetUtcNow(),services});
        });
    }
    public static async Task<Guid> ShopIdAsync(AppDbContext db,Guid queueId)=>await db.Set<Domain.Queue>().Where(x=>x.Id==queueId).Select(x=>(Guid?)x.Service.ShopId).SingleOrDefaultAsync()??throw new ApiException("not_found",404);
    public sealed record JoinRequest(Guid RequestId,string? Note,bool ConfirmExtra=false);
}
