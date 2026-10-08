using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;

namespace SmartQueue.Api.Live;

/// <summary>
/// The two lines the host needs. Keeping them in one extension method means the live feature owns the
/// hub mapping, the JSON protocol naming and the PostgreSQL listener registration together.
/// </summary>
public static class LiveRegistration
{
    public static IServiceCollection AddSmartQueueLive(this IServiceCollection services)
    {
        services.AddSignalR().AddJsonProtocol(options =>
        {
            options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.PayloadSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
        });
        services.AddSingleton<LiveSubscriptions>();
        services.AddHostedService<ShopChangeListener>();
        return services;
    }

    public static TBuilder MapSmartQueueLive<TBuilder>(this TBuilder endpoints) where TBuilder : IEndpointRouteBuilder
    {
        endpoints.MapHub<LiveHub>("/live");
        return endpoints;
    }
}
