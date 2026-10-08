using Microsoft.AspNetCore.Identity;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

public static class DemoRegistration
{
    public static IServiceCollection AddDemo(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DemoOptions>(configuration.GetSection("Demo"));
        // Must run after AddIdentity: Identity rebuilds principals from its claims factory, so the demo marker
        // has to come from the database-backed factory instead of the sign-in additional claims.
        services.AddScoped<IUserClaimsPrincipalFactory<OwnerAccount>, DemoOwnerClaimsPrincipalFactory>();
        services.AddScoped<DemoSessions>();
        services.AddHostedService<DemoCleanupWorker>();
        return services;
    }

    /// <summary>Call after <c>app.UseAuthentication()</c> so an expired demo session is revoked before authorization.</summary>
    public static IApplicationBuilder UseDemoSessions(this IApplicationBuilder app) => app.UseMiddleware<DemoSessionMiddleware>();
}
