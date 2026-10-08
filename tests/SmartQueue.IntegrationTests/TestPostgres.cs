using Npgsql;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Creates one isolated PostgreSQL database per test host, so hosts never share Ticket state. Connection
/// settings default to the local compose instance and can be overridden with SMARTQUEUE_TEST_CONNECTION
/// (an administrative connection string) or the SMARTQUEUE_TEST_DB_HOST/PORT/USER/PASSWORD variables.
/// </summary>
public static class TestPostgres
{
    public static string AdminConnectionString { get; } = ResolveAdminConnectionString();

    public static string CreateDatabase()
    {
        var name = "smartqueue_it_" + Guid.NewGuid().ToString("N");
        Execute($"CREATE DATABASE \"{name}\"");
        return new NpgsqlConnectionStringBuilder(AdminConnectionString) { Database = name, Pooling = true }.ConnectionString;
    }

    public static void DropDatabase(string connectionString)
    {
        var name = new NpgsqlConnectionStringBuilder(connectionString).Database;
        if (string.IsNullOrEmpty(name)) return;
        NpgsqlConnection.ClearAllPools();
        using var connection = new NpgsqlConnection(AdminConnectionString);
        connection.Open();
        using (var terminate = new NpgsqlCommand("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = @database AND pid <> pg_backend_pid()", connection))
        {
            terminate.Parameters.AddWithValue("database", name);
            terminate.ExecuteNonQuery();
        }
        using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{name}\"", connection);
        drop.ExecuteNonQuery();
    }

    private static void Execute(string sql)
    {
        using var connection = new NpgsqlConnection(AdminConnectionString);
        connection.Open();
        using var command = new NpgsqlCommand(sql, connection);
        command.ExecuteNonQuery();
    }

    private static string ResolveAdminConnectionString()
    {
        var configured = Environment.GetEnvironmentVariable("SMARTQUEUE_TEST_CONNECTION");
        if (!string.IsNullOrWhiteSpace(configured)) return configured;
        return new NpgsqlConnectionStringBuilder
        {
            Host = Environment.GetEnvironmentVariable("SMARTQUEUE_TEST_DB_HOST") ?? "127.0.0.1",
            Port = int.TryParse(Environment.GetEnvironmentVariable("SMARTQUEUE_TEST_DB_PORT"), out var port) ? port : 5449,
            Username = Environment.GetEnvironmentVariable("SMARTQUEUE_TEST_DB_USER") ?? "smartqueue",
            Password = Environment.GetEnvironmentVariable("SMARTQUEUE_TEST_DB_PASSWORD") ?? "smartqueue-local",
            Database = "postgres",
            Pooling = false,
        }.ConnectionString;
    }
}
