using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>Creates and ends session-bound Try demo Owners. The account is a real Identity Owner with its own Shop, marked only by <see cref="OwnerAccount.DemoExpiresAt"/>.</summary>
public sealed class DemoSessions(AppDbContext db, UserManager<OwnerAccount> users, SignInManager<OwnerAccount> signIn, IOptions<DemoOptions> options)
{
    public async Task<DemoSessionDto> StartAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var lifetime = options.Value.SessionLifetime > TimeSpan.Zero ? options.Value.SessionLifetime : TimeSpan.FromHours(24);
        var expiresAt = now.Add(lifetime);
        var address = $"demo-{Guid.NewGuid():N}@demo.smartqueue.test";
        var owner = new OwnerAccount { UserName = address, Email = address, EmailConfirmed = true, DemoExpiresAt = expiresAt };

        DemoSeedResult seed;
        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var created = await users.CreateAsync(owner);
            if (!created.Succeeded) throw new ApiException("demo_unavailable", 500);
            seed = await DemoSeed.BuildAsync(db, owner, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        await signIn.SignInWithClaimsAsync(owner, new AuthenticationProperties { IsPersistent = false }, [DemoClaims.Create(expiresAt)]);
        return new DemoSessionDto(true, expiresAt, (long)Math.Round(lifetime.TotalSeconds), new DemoShopDto(seed.Shop.Id, seed.Shop.Name, seed.Shop.PublicId), new DemoSeedDto(seed.BusinessDays, seed.Completed, seed.Skipped, seed.Waiting));
    }

    public async Task EndAsync(HttpContext context, CancellationToken cancellationToken = default)
    {
        var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(ownerId)) throw new ApiException("not_found", 404);
        var removed = await db.Set<OwnerAccount>().Where(x => x.Id == ownerId && x.DemoExpiresAt != null).ExecuteDeleteAsync(cancellationToken);
        if (removed == 0) throw new ApiException("not_found", 404);
        await signIn.SignOutAsync();
    }
}

public sealed record DemoSessionDto(bool Demo, DateTimeOffset ExpiresAt, long ExpiresInSeconds, DemoShopDto Shop, DemoSeedDto Seed);
public sealed record DemoShopDto(Guid Id, string Name, string PublicId);
public sealed record DemoSeedDto(int BusinessDays, int Completed, int Skipped, int Waiting);
