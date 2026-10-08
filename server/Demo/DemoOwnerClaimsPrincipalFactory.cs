using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>
/// Adds the Try demo marker from <see cref="OwnerAccount.DemoExpiresAt"/> to every Owner principal. Identity
/// rebuilds the principal from this factory when it refreshes a security stamp, so a claim passed only to
/// <c>SignInManager.SignInWithClaimsAsync</c> would be dropped on refresh and an expired demo session would then
/// look like an ordinary Owner. Reading the marker from the database keeps HTTP and live enforcement working
/// after any refresh.
/// </summary>
public sealed class DemoOwnerClaimsPrincipalFactory(
    UserManager<OwnerAccount> users,
    RoleManager<IdentityRole> roles,
    IOptions<IdentityOptions> options) : UserClaimsPrincipalFactory<OwnerAccount, IdentityRole>(users, roles, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(OwnerAccount user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.DemoExpiresAt is { } expiresAt) identity.AddClaim(DemoClaims.Create(expiresAt));
        return identity;
    }
}
