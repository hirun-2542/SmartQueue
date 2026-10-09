using System.Data;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

public static class OwnerViews
{
    public static async Task<ConsoleDto> ConsoleAsync(AppDbContext db,Guid shopId,string ownerId,Guid? selected,TimeProvider time)
    {
        await using var snapshot=db.Database.CurrentTransaction is null?await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead):null;
        var now=time.GetUtcNow();
        var shop=await db.Set<Shop>().AsNoTracking().SingleOrDefaultAsync(x=>x.Id==shopId&&x.OwnerId==ownerId&&db.Users.Any(u=>u.Id==ownerId&&(u.DemoExpiresAt==null||u.DemoExpiresAt>now)))??throw new ApiException("not_found",404);
        var queues=await db.Set<Domain.Queue>().AsNoTracking().Include(x=>x.Service).Where(x=>x.Service.ShopId==shopId&&(!x.Service.Archived||x.Status != QueueStatus.Closed)).OrderBy(x=>x.Service.Name).ToArrayAsync();
        if(selected.HasValue&&!queues.Any(x=>x.Id==selected))throw new ApiException("not_found",404);
        var selectedId=selected??queues.FirstOrDefault(x=>x.Status == QueueStatus.Open)?.Id??queues.FirstOrDefault()?.Id;
        var counts=await db.Set<Ticket>().Where(x=>x.ShopId==shopId&&x.Status==TicketStatus.Waiting).GroupBy(x=>x.QueueId).Select(g=>new{Id=g.Key,Count=g.Count()}).ToDictionaryAsync(x=>x.Id,x=>x.Count);
        var held=await db.Set<Ticket>().AsNoTracking().SingleOrDefaultAsync(x=>x.ShopId==shopId&&(x.Status==TicketStatus.Called||x.Status==TicketStatus.InService));
        var waiting=selectedId is null?[]:await db.Set<Ticket>().AsNoTracking().Where(x=>x.QueueId==selectedId&&x.Status==TicketStatus.Waiting).OrderBy(x=>x.ReceiveOrder).ToArrayAsync();
        var names=queues.ToDictionary(x=>x.Id,x=>x.Service.Name);
        return new(shopId,shop.Version,selectedId,queues.Select(q=>new ConsoleQueueDto(q.Id,q.ServiceId,q.Service.Name,q.Service.Prefix,q.Status,counts.GetValueOrDefault(q.Id))).ToArray(),held is null?null:Ticket(held,names.GetValueOrDefault(held.QueueId,""),time),waiting.Select(x=>Ticket(x,names.GetValueOrDefault(x.QueueId,""),time)).ToArray(),time.GetUtcNow());
    }
    public static async Task<OwnerTicketDto> TicketAsync(AppDbContext db,Ticket ticket,TimeProvider time)
    {
        var name=await db.Set<Domain.Queue>().AsNoTracking().Where(x=>x.Id==ticket.QueueId).Select(x=>x.Service.Name).SingleAsync();
        return Ticket(ticket,name,time);
    }
    public static OwnerTicketDto Ticket(Ticket ticket,string serviceName,TimeProvider time)=>new(ticket.Id,ticket.QueueId,ticket.Number,ticket.Status.ToString(),ticket.Version,serviceName,ticket.Note,ticket.Origin,ticket.ReceivedAt,ticket.CalledAt,ticket.StartedAt,ticket.EndedAt,ticket.Deadline,ticket.EndReason,time.GetUtcNow());
}
public sealed record ConsoleQueueDto(Guid Id,Guid ServiceId,string Name,string Prefix,string Status,int WaitingCount);
public sealed record ConsoleDto(Guid ShopId,long Version,Guid? SelectedQueueId,ConsoleQueueDto[] Queues,OwnerTicketDto? Held,OwnerTicketDto[] Waiting,DateTimeOffset ServerTime);
public sealed record OwnerTicketDto(Guid Id,Guid QueueId,string Number,string Status,long Version,string ServiceName,string? Note,string Origin,DateTimeOffset ReceivedAt,DateTimeOffset? CalledAt,DateTimeOffset? StartedAt,DateTimeOffset? EndedAt,DateTimeOffset? Deadline,string? EndReason,DateTimeOffset ServerTime);
