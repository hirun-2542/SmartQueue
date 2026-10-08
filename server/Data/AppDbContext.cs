using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace SmartQueue.Api.Data;

public sealed partial class OwnerAccount : IdentityUser { }

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<OwnerAccount>(options)
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
