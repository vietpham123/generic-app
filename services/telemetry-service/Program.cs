using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var connStr = $"Host={Env("DB_HOST", "timescaledb")};Port={Env("DB_PORT", "5432")};" +
              $"Database={Env("DB_NAME", "appdb")};Username={Env("DB_USER", "appuser")};" +
              $"Password={Env("DB_PASSWORD", "changeme")}";

// --- Init DB ---
try
{
    using var initConn = new NpgsqlConnection(connStr);
    await initConn.OpenAsync();
    using var cmd = initConn.CreateCommand();
    // AGENT: Customize table for domain telemetry entity
    cmd.CommandText = @"
        CREATE TABLE IF NOT EXISTS telemetry (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            device_id TEXT NOT NULL,
            metric TEXT NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            unit TEXT NOT NULL DEFAULT 'unit',
            recorded_at TIMESTAMPTZ DEFAULT NOW()
        );";
    await cmd.ExecuteNonQueryAsync();
    Console.WriteLine("Telemetry table initialized");
}
catch (Exception ex)
{
    Console.WriteLine($"DB init error: {ex.Message}");
}

// --- Simulation background task ---
var cts = new CancellationTokenSource();
_ = Task.Run(async () =>
{
    while (!cts.Token.IsCancellationRequested)
    {
        try
        {
            using var conn = new NpgsqlConnection(connStr);
            await conn.OpenAsync();
            var rng = new Random();
            // AGENT: Update metrics and ranges to match industry telemetry
            string[] metrics = { "temperature", "pressure", "voltage", "frequency", "flow_rate" };
            for (int i = 0; i < 3; i++)
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"INSERT INTO telemetry (device_id, metric, value, unit, recorded_at)
                                    VALUES (@d, @m, @v, @u, NOW())";
                cmd.Parameters.AddWithValue("d", $"device-{rng.Next(1, 50):D3}");
                var metric = metrics[rng.Next(metrics.Length)];
                cmd.Parameters.AddWithValue("m", metric);
                cmd.Parameters.AddWithValue("v", Math.Round(rng.NextDouble() * 100, 2));
                cmd.Parameters.AddWithValue("u", "unit");
                await cmd.ExecuteNonQueryAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Simulation error: {ex.Message}");
        }
        await Task.Delay(TimeSpan.FromSeconds(10), cts.Token);
    }
});

app.MapGet("/health", () => Results.Json(new { status = "ok", service = "telemetry-service" }));

// AGENT: Update endpoint path to match industry (e.g., /api/scada)
app.MapGet("/api/telemetry", async () =>
{
    try
    {
        using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT * FROM telemetry ORDER BY recorded_at DESC LIMIT 100";
        using var reader = await cmd.ExecuteReaderAsync();
        var results = new System.Collections.Generic.List<object>();
        while (await reader.ReadAsync())
        {
            results.Add(new
            {
                id = reader.GetGuid(0),
                device_id = reader.GetString(1),
                metric = reader.GetString(2),
                value = reader.GetDouble(3),
                unit = reader.GetString(4),
                recorded_at = reader.GetDateTime(5)
            });
        }
        return Results.Json(results);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.MapGet("/api/telemetry/summary", async () =>
{
    try
    {
        using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"SELECT metric, COUNT(*) as count, AVG(value) as avg_val,
                            MAX(value) as max_val, MIN(value) as min_val
                            FROM telemetry WHERE recorded_at > NOW() - INTERVAL '1 hour'
                            GROUP BY metric ORDER BY metric";
        using var reader = await cmd.ExecuteReaderAsync();
        var results = new System.Collections.Generic.List<object>();
        while (await reader.ReadAsync())
        {
            results.Add(new
            {
                metric = reader.GetString(0),
                count = reader.GetInt64(1),
                avg_value = reader.GetDouble(2),
                max_value = reader.GetDouble(3),
                min_value = reader.GetDouble(4)
            });
        }
        return Results.Json(results);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.Lifetime.ApplicationStopping.Register(() => cts.Cancel());
app.Run($"http://0.0.0.0:{Env("PORT", "5001")}");

static string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) ?? fallback;
