using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Domain;

public sealed class Shop
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string OwnerId { get; set; } = "";
    public string PublicId { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public long Version { get; set; } = 1;
    public List<Service> Services { get; set; } = [];
}
public sealed class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Name { get; set; } = "";
    public string Prefix { get; set; } = "";
    public double CallTimeoutMinutes { get; set; } = 10;
    public int NearTurnThreshold { get; set; } = 2;
    public bool Archived { get; set; }
    public Queue Queue { get; set; } = null!;
}
public sealed class Queue
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ServiceId { get; set; }
    public Service Service { get; set; } = null!;
    public string Status { get; set; } = "Closed";
    public Guid? BusinessDayId { get; set; }
}
public sealed class ShopMapping : IEntityTypeConfiguration<Shop>
{
    public void Configure(EntityTypeBuilder<Shop> b)
    {
        b.ToTable("shops"); b.HasKey(x=>x.Id); b.Property(x=>x.Name).HasMaxLength(160);
        b.HasIndex(x=>x.PublicId).IsUnique();
        b.HasOne<OwnerAccount>().WithMany().HasForeignKey(x=>x.OwnerId).OnDelete(DeleteBehavior.Cascade);
    }
}
public sealed class ServiceMapping : IEntityTypeConfiguration<Service>
{
    public void Configure(EntityTypeBuilder<Service> b)
    {
        b.ToTable("services"); b.HasKey(x=>x.Id); b.Property(x=>x.Name).HasMaxLength(160); b.Property(x=>x.Prefix).HasMaxLength(8);
        b.HasOne(x=>x.Shop).WithMany(x=>x.Services).HasForeignKey(x=>x.ShopId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x=>new{x.ShopId,x.Prefix}).IsUnique().HasFilter("NOT \"Archived\"");
    }
}
public sealed class QueueMapping : IEntityTypeConfiguration<Queue>
{
    public void Configure(EntityTypeBuilder<Queue> b)
    {
        b.ToTable("queues"); b.HasKey(x=>x.Id); b.Property(x=>x.Status).HasMaxLength(16);
        b.HasOne(x=>x.Service).WithOne(x=>x.Queue).HasForeignKey<Queue>(x=>x.ServiceId).OnDelete(DeleteBehavior.Cascade);
    }
}
