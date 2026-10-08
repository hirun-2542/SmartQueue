using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

namespace SmartQueue.Api.Demo;

public static class DemoClaims
{
    /// <summary>Cookie claim that marks a Try demo session and carries its expiry as Unix seconds.</summary>
    public const string ExpiresAt = "smartqueue:demo-expires";

    /// <summary>Request item set when an expired demo session was revoked while handling the request.</summary>
    public const string ExpiredItem = "smartqueue:demo-expired";

    public static Claim Create(DateTimeOffset expiresAt) =>
        new(ExpiresAt, expiresAt.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture));

    /// <summary>Reads the demo marker. A demo cookie with an unreadable marker is treated as expired rather than trusted.</summary>
    public static bool TryReadExpiry(ClaimsPrincipal principal, out DateTimeOffset expiresAt)
    {
        var value = principal.FindFirst(ExpiresAt)?.Value;
        if (value is null)
        {
            expiresAt = default;
            return false;
        }
        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var seconds)
            && seconds is >= -62135596800 and <= 253402300799)
        {
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(seconds);
            return true;
        }
        expiresAt = DateTimeOffset.MinValue;
        return true;
    }

    /// <summary>True for requests that stay readable after a demo session expires, so the app can show the expired state.</summary>
    public static bool IsPublicRequest(HttpRequest request)
    {
        var path = request.Path;
        if (!path.StartsWithSegments("/api")) return true;
        if (path.StartsWithSegments("/api/session") || path.StartsWithSegments("/api/health") || path.StartsWithSegments("/api/demo/session")) return true;
        return (path.StartsWithSegments("/api/s", out var publicId) && publicId.Value?.Length > 1)
            || (path.StartsWithSegments("/api/t", out var secret) && secret.Value?.Length > 1);
    }
}

/// <summary>Revokes an expired Try demo session before it can reach private resources. Real Owner sessions are untouched.</summary>
public sealed class DemoSessionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, TimeProvider time)
    {
        if (context.User.Identity?.IsAuthenticated == true
            && DemoClaims.TryReadExpiry(context.User, out var expiresAt)
            && time.GetUtcNow() >= expiresAt)
        {
            context.Items[DemoClaims.ExpiredItem] = true;
            await context.SignOutAsync(IdentityConstants.ApplicationScheme);
            context.User = new ClaimsPrincipal(new ClaimsIdentity());
            if (!DemoClaims.IsPublicRequest(context.Request))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { code = "demo_expired" });
                return;
            }
        }
        await next(context);
    }
}
