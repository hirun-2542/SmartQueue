using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SmartQueue.Api.Data;

public sealed partial class OwnerAccount
{
    /// <summary>Set only on Try demo accounts. Real Owners keep this null.</summary>
    public DateTimeOffset? DemoExpiresAt { get; set; }
}

public sealed class OwnerDemoMapping : IEntityTypeConfiguration<OwnerAccount>
{
    public void Configure(EntityTypeBuilder<OwnerAccount> b)
    {
        b.Property(x => x.DemoExpiresAt);
        b.HasIndex(x => x.DemoExpiresAt);
    }
}
