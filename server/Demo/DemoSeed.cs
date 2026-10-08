using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Demo;

/// <summary>
/// Builds the per-session fixture for a Try demo Owner: a Shop with two Services, closed Business days holding
/// real Completed history for estimates and statistics, and Open Business days with Waiting Walk-in Tickets.
/// Counters, Ticket numbers and receive order stay coherent with the transitions the application performs later.
/// </summary>
public static class DemoSeed
{
    private const string ShopName = "SmartQueue Demo Studio";
    private static readonly TimeSpan Bangkok = TimeSpan.FromHours(7);

    public static async Task<DemoSeedResult> BuildAsync(AppDbContext db, OwnerAccount owner, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var shop = new Shop { OwnerId = owner.Id, Name = ShopName };
        var haircut = new Service { ShopId = shop.Id, Name = "Haircut", Prefix = "A", CallTimeoutMinutes = 10, NearTurnThreshold = 2 };
        var wash = new Service { ShopId = shop.Id, Name = "Hair Wash", Prefix = "B", CallTimeoutMinutes = 8, NearTurnThreshold = 2 };
        haircut.Queue = new Domain.Queue { ServiceId = haircut.Id, Service = haircut };
        wash.Queue = new Domain.Queue { ServiceId = wash.Id, Service = wash };
        shop.Services.Add(haircut);
        shop.Services.Add(wash);
        db.Add(shop);

        // Day one: six Completed Haircut jobs across two closed Business days give an estimate enough usable
        // samples, while today's Business day counter still starts clean.
        var (haircutTwoDaysAgo, haircutTwoDaysAgoOpen) = ClosedShift(haircut.Queue, now, daysAgo: 2, fromHour: 9, hours: 3);
        var (haircutYesterday, haircutYesterdayOpen) = ClosedShift(haircut.Queue, now, daysAgo: 1, fromHour: 9, hours: 3);
        // Two Completed Hair Wash jobs stay intentionally below the five-sample estimate threshold.
        var (washYesterday, washYesterdayOpen) = ClosedShift(wash.Queue, now, daysAgo: 1, fromHour: 13, hours: 3);
        var today = OpenShift(haircut.Queue, now, minutesAgo: 90);
        var todayWash = OpenShift(wash.Queue, now, minutesAgo: 45);
        db.Add(haircutTwoDaysAgo);
        db.Add(haircutYesterday);
        db.Add(washYesterday);
        db.Add(today);
        db.Add(todayWash);

        // Queue -> BusinessDay and BusinessDay -> Queue reference each other, so the fixture is inserted in two
        // ordered phases inside the caller's transaction instead of relying on cycle breaking during one save.
        await db.SaveChangesAsync(cancellationToken);

        haircut.Queue.Status = "Open";
        haircut.Queue.BusinessDayId = today.Id;
        wash.Queue.Status = "Open";
        wash.Queue.BusinessDayId = todayWash.Id;

        var completed = AddCompleted(db, haircut, haircutTwoDaysAgo, haircutTwoDaysAgoOpen, count: 4);
        completed += AddCompleted(db, haircut, haircutYesterday, haircutYesterdayOpen, count: 2);
        var skipped = AddSkipped(db, haircut, haircutYesterday, haircutYesterdayOpen.AddMinutes(70));
        completed += AddCompleted(db, wash, washYesterday, washYesterdayOpen, count: 2);
        var waiting = AddWaiting(db, haircut, today, count: 2, now) + AddWaiting(db, wash, todayWash, count: 1, now);

        await db.SaveChangesAsync(cancellationToken);
        return new DemoSeedResult(shop, BusinessDays: 5, Completed: completed, Skipped: skipped, Waiting: waiting);
    }

    private static BusinessDay OpenShift(Domain.Queue queue, DateTimeOffset now, int minutesAgo) =>
        new() { QueueId = queue.Id, OpenedAt = now.AddMinutes(-minutesAgo), Counter = 0 };

    private static (BusinessDay Day, DateTimeOffset Open) ClosedShift(Domain.Queue queue, DateTimeOffset now, int daysAgo, int fromHour, int hours)
    {
        var localDay = now.ToOffset(Bangkok).Date.AddDays(-daysAgo);
        var open = new DateTimeOffset(localDay.AddHours(fromHour), Bangkok).ToUniversalTime();
        return (new BusinessDay { QueueId = queue.Id, OpenedAt = open, ClosedAt = open.AddHours(hours), Counter = 0 }, open);
    }

    private static int AddCompleted(AppDbContext db, Service service, BusinessDay day, DateTimeOffset shiftStart, int count)
    {
        for (var i = 0; i < count; i++)
        {
            var received = shiftStart.AddMinutes(10 + i * 30);
            var called = received.AddMinutes(6 + i % 3);
            var started = called.AddMinutes(2);
            var ticket = NewTicket(service, day, received);
            ticket.Status = TicketStatus.Completed;
            ticket.CalledAt = called;
            ticket.StartedAt = started;
            ticket.EndedAt = started.AddMinutes(12 + i % 5);
            ticket.Deadline = called.AddMinutes(service.CallTimeoutMinutes);
            ticket.EndReason = "completed";
            db.Add(ticket);
        }
        return count;
    }

    private static int AddSkipped(AppDbContext db, Service service, BusinessDay day, DateTimeOffset received)
    {
        var called = received.AddMinutes(7);
        var ticket = NewTicket(service, day, received);
        ticket.Status = TicketStatus.Skipped;
        ticket.CalledAt = called;
        ticket.Deadline = called.AddMinutes(service.CallTimeoutMinutes);
        ticket.EndedAt = ticket.Deadline;
        ticket.EndReason = "manual_skip";
        db.Add(ticket);
        return 1;
    }

    private static int AddWaiting(AppDbContext db, Service service, BusinessDay day, int count, DateTimeOffset now)
    {
        for (var i = 0; i < count; i++)
        {
            var ticket = NewTicket(service, day, now.AddMinutes(-(count - i) * 7));
            ticket.JoinedAhead = i;
            db.Add(ticket);
        }
        return count;
    }

    private static Ticket NewTicket(Service service, BusinessDay day, DateTimeOffset receivedAt)
    {
        day.Counter++;
        return new Ticket
        {
            ShopId = service.ShopId,
            QueueId = service.Queue.Id,
            BusinessDayId = day.Id,
            Prefix = service.Prefix,
            Number = service.Prefix + day.Counter.ToString("D3"),
            Status = TicketStatus.Waiting,
            Origin = "WalkIn",
            ReceivedAt = receivedAt
        };
    }
}

public sealed record DemoSeedResult(Shop Shop, int BusinessDays, int Completed, int Skipped, int Waiting);
