using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Npgsql;
using SmartQueue.Api.Data;
using SmartQueue.Api.Tickets;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Hosts the real API in-process over its own PostgreSQL database with a controllable server clock.
/// The database and the clock are replaced through <c>ConfigureTestServices</c>, which the generic host
/// applies after the application's own registrations and before the service provider is built, so no
/// production debug route or Program.cs change is needed. <see cref="StartAsync"/> verifies both
/// replacements and fails loudly instead of silently testing against the development database or the
/// system clock. Everything a test observes is then read from the public HTTP boundary.
/// </summary>
public sealed class SmartQueueFactory(string connectionString, FakeTimeProvider clock, TimeSpan pollInterval, Action<IServiceCollection>? configureServices = null, IReadOnlyDictionary<string, string?>? settings = null) : WebApplicationFactory<Program>
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

        // Let the startup sweep finish and park, so the first clock advance lands one interval after it.
        await SmartQueueCluster.SettleAsync();
        return this;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_,configuration)=>{
            var values = new Dictionary<string,string?> { ["ConnectionStrings:Database"]=connectionString };
            if (settings is not null) foreach (var pair in settings) values[pair.Key]=pair.Value;
            configuration.AddInMemoryCollection(values);
        });
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(clock);
            services.AddSingleton(clock);

            // The session cookie is a browser artefact, not application time: the HTTP client's cookie jar
            // compares Expires against the real clock and drops the cookie as soon as a pinned server date
            // sits in the past. Keep the cookie handler on system time so a pinned server clock still
            // exercises deadlines while the transport keeps the session it was issued.
            services.Configure<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme, options => options.TimeProvider = TimeProvider.System);

            // Point this instance at its own database, replacing the application's Npgsql options.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddScoped(_ => new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options);

            // PostConfigure so the interval wins over any application configuration binding.
            services.PostConfigure<AutoSkipOptions>(options =>
            {
                options.PollInterval = pollInterval;
                options.BatchSize = 100;
            });

            // A ticket may replace one of the feature's own services, e.g. the push delivery sink, without touching Program.
            configureServices?.Invoke(services);
        });
    }
}
