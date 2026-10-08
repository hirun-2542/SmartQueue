using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Time.Testing;
using Npgsql;
using SmartQueue.Api.Data;
using SmartQueue.Api.Tickets;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Hosts the real API in-process over its own PostgreSQL database with a controllable server clock.
/// Server time and the database are replaced through dependency injection instead of production debug
/// hooks, so the same worker, endpoints and transaction rules that run in production are exercised.
/// Requires the host to register its clock with <c>TryAddSingleton&lt;TimeProvider&gt;</c> so this factory
/// can supply the fake one; <see cref="StartAsync"/> fails loudly when that is not the case.
/// </summary>
public sealed class SmartQueueFactory(string connectionString, FakeTimeProvider clock, TimeSpan pollInterval) : WebApplicationFactory<Program>
{
    public FakeTimeProvider Clock => clock;

    /// <summary>Starts the host, waits for its startup migration and returns once the schema exists.</summary>
    public async Task<SmartQueueFactory> StartAsync()
    {
        _ = Services;
        if (!ReferenceEquals(Services.GetRequiredService<TimeProvider>(), clock))
            throw new InvalidOperationException(
                "The host is using the system clock. Program must register the server clock with " +
                "TryAddSingleton<TimeProvider>(TimeProvider.System) so a test host can replace it without debug routes.");

        using (var scope = Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
            var database = db.Database.GetDbConnection().Database;
            var expected = new NpgsqlConnectionStringBuilder(connectionString).Database;
            if (database != expected)
                throw new InvalidOperationException($"The host is connected to '{database}' instead of its isolated test database '{expected}'");
        }

        // Wait for the loop's startup sweep, so tests start from a parked worker whose next tick is one interval away.
        await SmartQueueCluster.WaitForAsync(() => Worker.CompletedSweeps >= 1, "the auto-skip worker did not complete its startup sweep");
        return this;
    }

    /// <summary>The running background worker, so a test can tell when a sweep has finished.</summary>
    public AutoSkipWorker Worker => Services.GetServices<IHostedService>().OfType<AutoSkipWorker>().SingleOrDefault()
        ?? throw new InvalidOperationException("AutoSkipWorker is not registered as a hosted service; add builder.Services.AddHostedService<AutoSkipWorker>().");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            // Added last, so the application reads this isolated database even if the test services are applied
            // before its own registrations. PublicOrigin and Smtp repeat appsettings.Development.json so the
            // host still starts when the content root cannot be inferred.
            ["ConnectionStrings:Database"] = connectionString,
            ["PublicOrigin"] = "http://127.0.0.1:5179",
            ["Smtp:Host"] = SmartQueueScenario.SmtpHost,
            ["Smtp:Port"] = SmartQueueScenario.SmtpPort.ToString(),
            ["Smtp:From"] = "queue@smartqueue.test",
            ["Smtp:UseTls"] = "false",
        }));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
            services.AddSingleton(clock);

            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddScoped(_ => new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options);

            // PostConfigure so the interval wins over any application configuration binding, whatever order
            // the host applies test services in.
            services.PostConfigure<AutoSkipOptions>(options =>
            {
                options.PollInterval = pollInterval;
                options.BatchSize = 100;
            });
        });
    }
}
