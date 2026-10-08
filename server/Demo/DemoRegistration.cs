namespace SmartQueue.Api.Demo;

public static class DemoRegistration
{
    public static IServiceCollection AddDemo(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<DemoOptions>(configuration.GetSection("Demo"));
        services.AddScoped<DemoSessions>();
        services.AddHostedService<DemoCleanupWorker>();
        return services;
    }

    /// <summary>Call after <c>app.UseAuthentication()</c> so an expired demo session is revoked before authorization.</summary>
    public static IApplicationBuilder UseDemoSessions(this IApplicationBuilder app) => app.UseMiddleware<DemoSessionMiddleware>();
}
