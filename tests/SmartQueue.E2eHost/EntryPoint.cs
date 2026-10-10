using System.Runtime.InteropServices;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartQueue.Api.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using SmartQueue.IntegrationTests;

namespace SmartQueue.E2eHost;

internal static class EntryPoint
{
    public static async Task Main()
    {
        var stopping = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Console.CancelKeyPress += (_, args) => { args.Cancel = true; stopping.TrySetResult(); };
        using var terminate = OperatingSystem.IsWindows() ? null : PosixSignalRegistration.Create(PosixSignal.SIGTERM, context =>
        {
            context.Cancel = true;
            stopping.TrySetResult();
        });
        var keys = Path.Combine(Path.GetTempPath(), "smartqueue-e2e-" + Guid.NewGuid().ToString("N"));
        var connection = TestPostgres.CreateDatabase();
        try
        {
            Console.WriteLine("SMARTQUEUE_E2E_DATABASE_CREATED");
            if (stopping.Task.IsCompleted) return;
            // Minimal-hosting bootstrap reads this setting before factory configuration is applied.
            Environment.SetEnvironmentVariable("DataProtection__KeyPath", keys);
            // Reuse the existing real application/database host; browser no-show tests need wall time,
            // not the integration suite's manually advanced clock. No production debug routes are added.
            await using var host = new SmartQueueFactory(connection, new FakeTimeProvider(), TimeSpan.FromSeconds(1), services =>
            {
                services.RemoveAll<TimeProvider>();
                services.AddSingleton(TimeProvider.System);
            }, new Dictionary<string, string?>
            {
                ["Push:VapidKeyPath"] = Path.Combine(keys, "vapid.json"),
            });
            host.UseKestrel(int.Parse(Environment.GetEnvironmentVariable("SMARTQUEUE_E2E_PORT") ?? "5310"));
            using var ready = host.CreateClient();
            using (var scope = host.Services.CreateScope())
            {
                var database = scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.GetDbConnection().Database;
                if (database != new NpgsqlConnectionStringBuilder(connection).Database)
                    throw new InvalidOperationException("The E2E host is not using its isolated test database.");
            }
            Console.WriteLine("SMARTQUEUE_E2E_READY (isolated PostgreSQL, real application and wall clock)");
            await stopping.Task;
        }
        finally
        {
            try { TestPostgres.DropDatabase(connection); }
            finally { if (Directory.Exists(keys)) Directory.Delete(keys, recursive: true); }
        }
    }
}
