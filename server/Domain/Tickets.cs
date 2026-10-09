using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SmartQueue.Api.Domain;

public enum TicketStatus { Waiting, Called, InService, Completed, Skipped, Cancelled, Dropped }

public sealed class BusinessDay
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid QueueId { get; set; }
    public Queue Queue { get; set; } = null!;
    public DateTimeOffset OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public int Counter { get; set; }
    public string IssueNumber(string prefix)=>prefix+(++Counter).ToString("D3",System.Globalization.CultureInfo.InvariantCulture);
}

public sealed partial class Ticket
{
    public static readonly TicketStatus[] ActiveStatuses=[TicketStatus.Waiting,TicketStatus.Called,TicketStatus.InService];
    public bool IsActive()=>ActiveStatuses.Contains(Status);
    public bool IsLinkExpired(DateTimeOffset now)=>EndedAt is { } ended&&now>=ended.AddHours(24);
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid QueueId { get; set; }
    public Guid BusinessDayId { get; set; }
    public long ReceiveOrder { get; set; }
    public string Number { get; set; } = "";
    public string Prefix { get; set; } = "";
    public TicketStatus Status { get; set; } = TicketStatus.Waiting;
    public long Version { get; set; } = 1;
    public string Origin { get; set; } = "Customer";
    public string? Note { get; set; }
    public string? DeviceId { get; set; }
    public Guid? RequestId { get; set; }
    public string? LinkHash { get; set; }
    public string? ProtectedLink { get; set; }
    public int JoinedAhead { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public DateTimeOffset? CalledAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public DateTimeOffset? Deadline { get; set; }
    public string? EndReason { get; set; }
}

public sealed class BusinessDayMapping : IEntityTypeConfiguration<BusinessDay>
{
    public void Configure(EntityTypeBuilder<BusinessDay> b)
    {
        b.ToTable("business_days"); b.HasKey(x=>x.Id);
        b.HasOne(x=>x.Queue).WithMany().HasForeignKey(x=>x.QueueId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany<Queue>().WithOne().HasForeignKey(x=>x.BusinessDayId).OnDelete(DeleteBehavior.SetNull);
        b.HasIndex(x=>new{x.QueueId,x.OpenedAt});
    }
}

public sealed class TicketMapping : IEntityTypeConfiguration<Ticket>
{
    public void Configure(EntityTypeBuilder<Ticket> b)
    {
        b.ToTable("tickets"); b.HasKey(x=>x.Id);
        b.Property(x=>x.Status).HasConversion<string>().HasMaxLength(16);
        b.Property(x=>x.Version).IsConcurrencyToken();
        b.Property(x=>x.ReceiveOrder).UseIdentityByDefaultColumn();
        b.Property(x=>x.Number).HasMaxLength(32); b.Property(x=>x.Prefix).HasMaxLength(8);
        b.Property(x=>x.Note).HasMaxLength(500); b.Property(x=>x.DeviceId).HasMaxLength(32); b.Property(x=>x.LinkHash).HasMaxLength(64);
        b.HasOne<Shop>().WithMany().HasForeignKey(x=>x.ShopId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Queue>().WithMany().HasForeignKey(x=>x.QueueId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<BusinessDay>().WithMany().HasForeignKey(x=>x.BusinessDayId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x=>x.LinkHash).IsUnique();
        b.HasIndex(x=>new{x.BusinessDayId,x.Number}).IsUnique();
        b.HasIndex(x=>new{x.QueueId,x.DeviceId,x.RequestId}).IsUnique();
        b.HasIndex(x=>new{x.QueueId,x.Status,x.ReceiveOrder});
        b.HasIndex(x=>x.ShopId).IsUnique().HasFilter("\"Status\" IN ('Called', 'InService')");
    }
}
