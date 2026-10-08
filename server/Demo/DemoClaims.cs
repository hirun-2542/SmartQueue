using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

namespace SmartQueue.Api.Demo;

public static class DemoClaims
{
    /// <summary>Cookie claim that marks a Try demo session and carries its expiry as Unix milliseconds.</summary>
    public const string ExpiresAt = "smartqueue:demo-expires";

    /// <summary>Request item set when an expired demo session was revoked while handling the request.</summary>
    public const string ExpiredItem = "smartqueue:demo-expired";

    private static readonly long MinUnixMilliseconds = DateTimeOffset.MinValue.ToUnixTimeMilliseconds();
    private static readonly long MaxUnixMilliseconds = DateTimeOffset.MaxValue.ToUnixTimeMilliseconds();

    public static Claim Create(DateTimeOffset expiresAt) =>
        new(ExpiresAt, expiresAt.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture));

    /// <summary>Reads the demo marker. A demo cookie with an unreadable or out-of-range marker is treated as expired rather than trusted.</summary>
    public static bool TryReadExpiry(ClaimsPrincipal principal, out DateTimeOffset expiresAt)
    {
        var value = principal.FindFirst(ExpiresAt)?.Value;
        if (value is null)
        {
            expiresAt = default;
            return false;
        }
        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var milliseconds)
            && milliseconds >= MinUnixMilliseconds && milliseconds <= MaxUnixMilliseconds)
        {
            expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(milliseconds);
            return true;
        }
        expiresAt = DateTimeOffset.MinValue;
        return true;
    }

    /// <summary>True for paths that must be refused outright once a demo credential expires: private API and live hubs.</summary>
    public static bool IsProtectedRequest(HttpRequest request)
    {
        var path = request.Path;
        if (path.StartsWithSegments("/live")) return true;
        if (!path.StartsWithSegments("/api")) return false;
        if (path.StartsWithSegments("/api/session") || path.StartsWithSegments("/api/health") || path.StartsWithSegments("/api/demo/session")) return false;
        return !((path.StartsWithSegments("/api/s", out var publicId) && publicId.Value?.Length > 1)
            || (path.StartsWithSegments("/api/t", out var secret) && secret.Value?.Length > 1));
    }
}

/// <summary>Revokes an expired Try demo session before it can reach private resources or live hubs. Real Owner sessions are untouched.</summary>
public sealed class DemoSessionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, TimeProvider time)
    {
        if (context.User.Identity?.IsAuthenticated == true && DemoSessionGuard.IsExpired(context.User, time.GetUtcNow()))
        {
            context.Items[DemoClaims.ExpiredItem] = true;
            await context.SignOutAsync(IdentityConstants.ApplicationScheme);
            context.User = new ClaimsPrincipal(new ClaimsIdentity());
            if (DemoClaims.IsProtectedRequest(context.Request))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { code = "demo_expired" });
                return;
            }
        }
        await next(context);
    }
}
