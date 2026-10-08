using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
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
/// The database and the clock are replaced through <c>ConfigureTestServices</c>, which the generic host
/// applies after the application's own registrations and before the container is built, so no production
/// debug route or Program.cs change is needed. <see cref="StartAsync"/> verifies both replacements, and
/// fails loudly instead of silently running against the development database or the system clock.
/// </summary>
public sealed class SmartQueueFactory(string connectionString, FakeTimeProvider clock, TimeSpan pollInterval) : WebApplicationFactory<Program>
{
    public FakeTimeProvider Clock => clock;

    /// <summary>Starts the host, waits for its startup migration and returns once the schema exists.</summary>
    public async Task<SmartQueueFactory> StartAsync()
    {
        _ = Services;
        if (!ReferenceEquals(Services.GetRequiredService<TimeProvider>(), clock))
            throw new InvalidOperationException("The host is using the system clock instead of the test clock; the test host cannot control server time.");

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
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
            services.AddSingleton(clock);

            // Point this instance at its own database, replacing the application's Npgsql options.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddScoped(_ => new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options);

            // PostConfigure so the interval wins over any application configuration binding.
            services.PostConfigure<AutoSkipOptions>(options =>
            {
                options.PollInterval = pollInterval;
                options.BatchSize = 100;
            });
        });
    }
}
