using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace SmartQueue.Api.Data;

public sealed partial class OwnerAccount : IdentityUser { }

public sealed class AppDbContext(DbContextOptions<AppDbContext> options, TimeProvider time, SmartQueue.Api.Push.PushDispatcher push) : IdentityDbContext<OwnerAccount>(options)
{
    internal TimeProvider Clock { get; } = time;
    internal SmartQueue.Api.Push.PushDispatcher Push { get; } = push;
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
