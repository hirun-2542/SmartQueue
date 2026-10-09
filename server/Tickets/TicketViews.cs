using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Tickets;

public static partial class TicketViews
{
    public static async Task<Ticket> FindAsync(AppDbContext db,string secret,TimeProvider time)
    {
        var hash=TicketLinks.Hash(secret);
        var ticket=await db.Set<Ticket>().AsNoTracking().SingleOrDefaultAsync(x=>x.LinkHash==hash)??throw new ApiException("not_found",404);
        if(ticket.IsLinkExpired(time.GetUtcNow()))throw new ApiException("ticket_expired",410);
        return ticket;
    }
    public static async Task<CustomerTicketDto> CustomerAsync(AppDbContext db,Ticket ticket,TimeProvider time)
    {
        var queue=await db.Set<Domain.Queue>().AsNoTracking().Include(x=>x.Service).ThenInclude(x=>x.Shop).SingleAsync(x=>x.Id==ticket.QueueId);
        var ahead=ticket.Status==TicketStatus.Waiting?await db.Set<Ticket>().CountAsync(x=>x.QueueId==ticket.QueueId&&x.Status==TicketStatus.Waiting&&x.ReceiveOrder<ticket.ReceiveOrder):0;
        var estimate=await WaitEstimates.ServiceAsync(db,queue.ServiceId,ahead);
        var called=await db.Set<Ticket>().AsNoTracking().Where(x=>x.ShopId==ticket.ShopId&&x.Status==TicketStatus.Called).Select(x=>new CalledDto(x.Number,x.QueueId)).SingleOrDefaultAsync();
        return new(ticket.Id,ticket.ShopId,ticket.QueueId,queue.Service.Shop.PublicId,queue.Service.Shop.Name,queue.Service.Name,ticket.Number,ticket.Status.ToString(),ticket.Version,ticket.ReceivedAt,ticket.CalledAt,ticket.StartedAt,ticket.EndedAt,ticket.Deadline,ticket.EndReason,ahead,queue.Service.NearTurnThreshold,called,time.GetUtcNow(),estimate.SampleCount,estimate.EstimatedWaitSeconds);
    }
}
public sealed record CalledDto(string Number,Guid QueueId);
public sealed record CustomerTicketDto(Guid Id,Guid ShopId,Guid QueueId,string ShopPublicId,string ShopName,string ServiceName,string Number,string Status,long Version,DateTimeOffset ReceivedAt,DateTimeOffset? CalledAt,DateTimeOffset? StartedAt,DateTimeOffset? EndedAt,DateTimeOffset? Deadline,string? EndReason,int TicketsAhead,int NearTurnThreshold,CalledDto? CurrentCalled,DateTimeOffset ServerTime,int EstimateSampleCount,double? EstimatedWaitSeconds);
