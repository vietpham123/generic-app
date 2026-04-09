using Microsoft.AspNetCore.Builder;
using Npgsql;
using System;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var connStr = $"Host={Env("DB_HOST", "timescaledb")};Port={Env("DB_PORT", "5432")};" +
              $"Database={Env("DB_NAME", "appdb")};Username={Env("DB_USER", "appuser")};" +
              $"Password={Env("DB_PASSWORD", "changeme")}";

app.MapGet("/health", () => Results.Json(new { status = "ok", service = "correlation-service" }));

// AGENT: Customize correlation logic for industry-specific event patterns
app.MapGet("/api/correlation", async () =>
{
    try
    {
        using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        // Correlate incidents by region and time window
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT region,
                   severity,
                   COUNT(*) as event_count,
                   MIN(created_at) as first_event,
                   MAX(created_at) as last_event,
                   EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)) / 60 as duration_minutes
            FROM incidents
            WHERE created_at > NOW() - INTERVAL '24 hours'
              AND status IN ('open', 'investigating')
            GROUP BY region, severity
            HAVING COUNT(*) > 1
            ORDER BY event_count DESC";
        using var reader = await cmd.ExecuteReaderAsync();
        var correlations = new System.Collections.Generic.List<object>();
        while (await reader.ReadAsync())
        {
            correlations.Add(new
            {
                region = reader.GetString(0),
                severity = reader.GetString(1),
                event_count = reader.GetInt64(2),
                first_event = reader.GetDateTime(3),
                last_event = reader.GetDateTime(4),
                duration_minutes = reader.IsDBNull(5) ? 0 : reader.GetDouble(5),
                correlation_type = "temporal_spatial"
            });
        }

        return Results.Json(new
        {
            correlations,
            analyzed_at = DateTime.UtcNow,
            window_hours = 24,
            total_groups = correlations.Count
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.MapGet("/api/correlation/patterns", async () =>
{
    try
    {
        using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT severity,
                   COUNT(*) as total,
                   AVG(affected_count) as avg_affected,
                   AVG(EXTRACT(EPOCH FROM COALESCE(resolved_at, NOW()) - created_at) / 60) as avg_resolution_min
            FROM incidents
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY severity
            ORDER BY total DESC";
        using var reader = await cmd.ExecuteReaderAsync();
        var patterns = new System.Collections.Generic.List<object>();
        while (await reader.ReadAsync())
        {
            patterns.Add(new
            {
                severity = reader.GetString(0),
                total_events = reader.GetInt64(1),
                avg_affected = reader.IsDBNull(2) ? 0 : reader.GetDouble(2),
                avg_resolution_minutes = reader.IsDBNull(3) ? 0 : reader.GetDouble(3)
            });
        }
        return Results.Json(patterns);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.Run($"http://0.0.0.0:{Env("PORT", "5004")}");

static string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) ?? fallback;
