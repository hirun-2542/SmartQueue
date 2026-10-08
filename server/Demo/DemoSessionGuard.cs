using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>
/// Single validity rule for Try demo credentials, shared by the HTTP middleware, /api/session and live hubs so an
/// expired demo credential can never reach Owner data over any transport. The demo marker is added by
/// <see cref="DemoOwnerClaimsPrincipalFactory"/> from <see cref="OwnerAccount.DemoExpiresAt"/>, so the rule keeps
/// working after Identity refreshes the principal. The demo fixture lifetime is fixed at 24 hours; only the
/// cleanup schedule is configurable.
/// </summary>
public static class DemoSessionGuard
{
    /// <summary>True when the principal carries a demo marker that is past its expiry or unreadable.</summary>
    public static bool IsExpired(ClaimsPrincipal principal, DateTimeOffset now) =>
        DemoClaims.TryReadExpiry(principal, out var expiresAt) && now >= expiresAt;

    /// <summary>Refuses an expired demo live caller, for hub connection and subscription entry points.</summary>
    public static void ThrowIfExpired(ClaimsPrincipal principal, DateTimeOffset now)
    {
        if (IsExpired(principal, now)) throw new HubException("demo_expired");
    }
}
