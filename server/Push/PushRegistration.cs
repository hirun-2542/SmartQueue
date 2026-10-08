using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;

namespace SmartQueue.Api.Push;

/// <summary>
/// The two lines the host needs, in the same shape as the live feature: one extension method owns the
/// dispatcher, the delivery implementation and the VAPID identity, and one owns the endpoint mapping. The
/// <see cref="PushServiceClient"/> is a singleton whose HTTP handler never follows a redirect and which never
/// retries a 429 by itself.
/// </summary>
public static class PushRegistration
{
    public static IServiceCollection AddSmartQueuePush(this IServiceCollection services, IConfiguration configuration, bool development)
    {
        var options = configuration.GetSection(PushOptions.SectionName).Get<PushOptions>() ?? new PushOptions();
        var keys = VapidKeys.Resolve(options, development);

        services.AddSingleton(keys);
        services.AddSingleton<PushDispatcher>();
        services.AddSingleton<IPushDelivery, LibPushDelivery>();
        services.AddSingleton(_ =>
        {
            var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false };
            var client = new PushServiceClient(new HttpClient(handler)) { AutoRetryAfter = false };
            if (keys.Configured) client.DefaultAuthentication = new VapidAuthentication(keys.PublicKey!, keys.PrivateKey!) { Subject = keys.Subject };
            return client;
        });
        services.AddHostedService<PushDeliveryWorker>();
        return services;
    }

    public static TBuilder MapSmartQueuePush<TBuilder>(this TBuilder endpoints) where TBuilder : IEndpointRouteBuilder
    {
        PushApi.MapPush(endpoints);
        return endpoints;
    }
}
