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
        app.MapPost("/api/queues/{id:guid}/tickets",async(Guid id,JoinRequest request,HttpContext context,AppDbContext db,TimeProvider time,TicketLinks links)=>
        {
            if(request.RequestId==Guid.Empty||request.Note?.Length>500)throw new ApiException("invalid_ticket",400);
            var shopId=await ShopIdAsync(db,id);var device=DeviceIdentity.Get(context);
            await using var unit=await ShopTransaction.OpenAsync(db,shopId,null);
            var repeated=await db.Set<Ticket>().SingleOrDefaultAsync(x=>x.QueueId==id&&x.DeviceId==device&&x.RequestId==request.RequestId);
            if(repeated is not null)
            {
                if(repeated.EndedAt is { } ended && time.GetUtcNow()>=ended.AddHours(24))throw new ApiException("ticket_expired",410);
                return Results.Ok(new{ticket=await TicketViews.CustomerAsync(db,repeated,time),link="/t/"+links.Unprotect(repeated.ProtectedLink!)});
            }
            var queue=await db.Set<Domain.Queue>().Include(x=>x.Service).SingleAsync(x=>x.Id==id);
            if(queue.Status!="Open"||queue.Service.Archived||queue.BusinessDayId is null)throw new ApiException("queue_closed");
            var count=await db.Set<Ticket>().CountAsync(x=>x.QueueId==id&&x.DeviceId==device&&(x.Status==TicketStatus.Waiting||x.Status==TicketStatus.Called||x.Status==TicketStatus.InService));
            if(count>=3)throw new ApiException("device_limit");
            if(count>0&&!request.ConfirmExtra)throw new ApiException("extra_confirmation");
            var day=await db.Set<BusinessDay>().SingleAsync(x=>x.Id==queue.BusinessDayId);
            var secret=links.Create();day.Counter++;
            var ahead=await db.Set<Ticket>().CountAsync(x=>x.QueueId==id&&x.Status==TicketStatus.Waiting);
            var ticket=new Ticket{ShopId=shopId,QueueId=id,BusinessDayId=day.Id,Prefix=queue.Service.Prefix,Number=queue.Service.Prefix+day.Counter.ToString("D3"),DeviceId=device,RequestId=request.RequestId,LinkHash=TicketLinks.Hash(secret),ProtectedLink=links.Protect(secret),Note=string.IsNullOrWhiteSpace(request.Note)?null:request.Note.Trim(),ReceivedAt=time.GetUtcNow(),JoinedAhead=ahead};
            db.Add(ticket);await unit.CommitAsync();
            return Results.Json(new{ticket=await TicketViews.CustomerAsync(db,ticket,time),link="/t/"+secret},statusCode:201);
        });
        app.MapGet("/api/t/{secret}",async(string secret,AppDbContext db,TimeProvider time)=>Results.Ok(await TicketViews.CustomerAsync(db,await TicketViews.FindAsync(db,secret,time),time)));
        app.MapGet("/api/s/{publicId}",async(string publicId,HttpContext context,AppDbContext db,TimeProvider time)=>
        {
            var shop=await db.Set<Shop>().AsNoTracking().Include(x=>x.Services).ThenInclude(x=>x.Queue).SingleOrDefaultAsync(x=>x.PublicId==publicId)??throw new ApiException("not_found",404);
            var counts=await db.Set<Ticket>().Where(x=>x.ShopId==shop.Id&&x.Status==TicketStatus.Waiting).GroupBy(x=>x.QueueId).Select(g=>new{Id=g.Key,Count=g.Count()}).ToDictionaryAsync(x=>x.Id,x=>x.Count);
            var device=DeviceIdentity.Get(context);
            var deviceCounts=await db.Set<Ticket>().Where(x=>x.ShopId==shop.Id&&x.DeviceId==device&&(x.Status==TicketStatus.Waiting||x.Status==TicketStatus.Called||x.Status==TicketStatus.InService)).GroupBy(x=>x.QueueId).Select(g=>new{Id=g.Key,Count=g.Count()}).ToDictionaryAsync(x=>x.Id,x=>x.Count);
            return Results.Ok(new{shop.Name,shop.PublicId,shop.Version,serverTime=time.GetUtcNow(),services=shop.Services.Where(x=>!x.Archived).OrderBy(x=>x.Name).Select(x=>new{x.Id,x.Name,x.Prefix,queue=new{x.Queue.Id,x.Queue.Status,waitingCount=counts.GetValueOrDefault(x.Queue.Id),deviceActiveCount=deviceCounts.GetValueOrDefault(x.Queue.Id)}})});
        });
    }
    public static async Task<Guid> ShopIdAsync(AppDbContext db,Guid queueId)=>await db.Set<Domain.Queue>().Where(x=>x.Id==queueId).Select(x=>(Guid?)x.Service.ShopId).SingleOrDefaultAsync()??throw new ApiException("not_found",404);
    public sealed record JoinRequest(Guid RequestId,string? Note,bool ConfirmExtra=false);
}
