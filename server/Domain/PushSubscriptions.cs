using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SmartQueue.Api.Domain;

/// <summary>
/// One explicit Web Push opt-in for one Ticket. The row is the association, not a Customer identity: it is
/// created only from a valid Ticket link, it carries the browser's push endpoint and client keys, and it means
/// nothing on its own once the Ticket that created it is terminal. The Ticket link secret is never stored
/// here, so a leaked row cannot be turned back into a Ticket link.
/// A single browser endpoint can be associated with several active Tickets; each association is removed on
/// its own, so ending one Ticket never silences another Ticket that shares the same endpoint.
/// </summary>
public sealed class PushSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid TicketId { get; set; }
    public Guid QueueId { get; set; }
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    public string Language { get; set; } = "th";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PushSubscriptionMapping : IEntityTypeConfiguration<PushSubscription>
{
    public void Configure(EntityTypeBuilder<PushSubscription> b)
    {
        b.ToTable("push_subscriptions"); b.HasKey(x => x.Id);
        b.Property(x => x.Endpoint).HasMaxLength(1024);
        b.Property(x => x.P256dh).HasMaxLength(256);
        b.Property(x => x.Auth).HasMaxLength(256);
        b.Property(x => x.Language).HasMaxLength(8);
        b.HasOne<Ticket>().WithMany().HasForeignKey(x => x.TicketId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Shop>().WithMany().HasForeignKey(x => x.ShopId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.TicketId, x.Endpoint }).IsUnique();
        b.HasIndex(x => new { x.ShopId, x.TicketId });
    }
}
