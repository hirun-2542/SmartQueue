using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>
/// Creates session-bound Try demo Owners. The account is a real Identity Owner with its own Shop, marked only by
/// <see cref="OwnerAccount.DemoExpiresAt"/>, and its fixture expires 24 hours after creation.
/// </summary>
public sealed class DemoSessions(AppDbContext db, UserManager<OwnerAccount> users, SignInManager<OwnerAccount> signIn)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    /// <summary>Truncate to milliseconds so the stored expiry, the response and the cookie claim agree exactly.</summary>
    private static DateTimeOffset ToMilliseconds(DateTimeOffset value) =>
        new(value.Ticks - value.Ticks % TimeSpan.TicksPerMillisecond, value.Offset);

    public async Task<DemoSessionDto> StartAsync(DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var expiresAt = ToMilliseconds(now.Add(Lifetime));
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
        return new DemoSessionDto(true, expiresAt, new DemoShopDto(seed.Shop.Id, seed.Shop.Name, seed.Shop.PublicId), new DemoSeedDto(seed.BusinessDays, seed.Completed, seed.Skipped, seed.Waiting));
    }
}

public sealed record DemoSessionDto(bool Demo, DateTimeOffset ExpiresAt, DemoShopDto Shop, DemoSeedDto Seed);
public sealed record DemoShopDto(Guid Id, string Name, string PublicId);
public sealed record DemoSeedDto(int BusinessDays, int Completed, int Skipped, int Waiting);
