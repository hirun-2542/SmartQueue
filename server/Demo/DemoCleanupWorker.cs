using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Demo;

/// <summary>Deletes expired demo fixtures on startup and on every interval. Only accounts carrying a demo expiry are ever removed, so real Owners and their records are untouched.</summary>
public sealed class DemoCleanupWorker(IServiceScopeFactory scopes, IOptions<DemoOptions> options, TimeProvider time, ILogger<DemoCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            var settings = options.Value;
            await SweepAsync(stoppingToken);
            var interval = settings.CleanupInterval > TimeSpan.Zero ? settings.CleanupInterval : TimeSpan.FromMinutes(10);
            // The timer follows the injected TimeProvider so controllable server time drives cleanup too.
            using var timer = new PeriodicTimer(interval, time);
            while (await timer.WaitForNextTickAsync(stoppingToken)) await SweepAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var removed = await DemoCleanup.SweepAsync(db, time.GetUtcNow(), ownerId: null, cancellationToken);
            if (removed > 0) logger.LogInformation("Removed {Count} expired demo accounts and their fixture", removed);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception error)
        {
            logger.LogError(error, "Demo fixture cleanup failed");
        }
    }
}
