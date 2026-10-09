using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

public static class TicketReceipt
{
    public static async Task<IResult> ReceiveAsync(Guid id,TicketEndpoints.JoinRequest request,HttpContext context,AppDbContext db,TimeProvider time,TicketLinks links,string? requiredOwnerId=null)
    {
        if(request.RequestId==Guid.Empty||request.Note?.Length>500)throw new ApiException("invalid_ticket",400);
        var shopId=await TicketEndpoints.ShopIdAsync(db,id);var device=DeviceIdentity.Get(context);
        await using var unit=await ShopTransaction.OpenAsync(db,shopId,requiredOwnerId);
        var repeated=await db.Set<Ticket>().SingleOrDefaultAsync(x=>x.QueueId==id&&x.DeviceId==device&&x.RequestId==request.RequestId);
        if(repeated is not null)
        {
            if(repeated.IsLinkExpired(time.GetUtcNow()))throw new ApiException("ticket_expired",410);
            return Results.Ok(new{ticket=await TicketViews.CustomerAsync(db,repeated,time),link="/t/"+links.Unprotect(repeated.ProtectedLink!)});
        }
        var queue=await db.Set<Domain.Queue>().Include(x=>x.Service).SingleAsync(x=>x.Id==id);
        if(queue.Status != QueueStatus.Open||queue.Service.Archived||queue.BusinessDayId is null)throw new ApiException("queue_closed");
        var count=await db.Set<Ticket>().CountAsync(x=>x.QueueId==id&&x.DeviceId==device&&(Ticket.ActiveStatuses.Contains(x.Status)));
        if(count>=3)throw new ApiException("device_limit");
        if(count>0&&!request.ConfirmExtra)throw new ApiException("extra_confirmation");
        var day=await db.Set<BusinessDay>().SingleAsync(x=>x.Id==queue.BusinessDayId);
        var secret=links.Create();var number=day.IssueNumber(queue.Service.Prefix);
        var ahead=await db.Set<Ticket>().CountAsync(x=>x.QueueId==id&&x.Status==TicketStatus.Waiting);
        var ticket=new Ticket{ShopId=shopId,QueueId=id,BusinessDayId=day.Id,Prefix=queue.Service.Prefix,Number=number,DeviceId=device,RequestId=request.RequestId,LinkHash=TicketLinks.Hash(secret),ProtectedLink=links.Protect(secret),Note=string.IsNullOrWhiteSpace(request.Note)?null:request.Note.Trim(),ReceivedAt=time.GetUtcNow(),JoinedAhead=ahead};
        db.Add(ticket);await unit.CommitAsync();
        return Results.Json(new{ticket=await TicketViews.CustomerAsync(db,ticket,time),link="/t/"+secret},statusCode:201);
    }
}
