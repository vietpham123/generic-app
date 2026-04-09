defmodule ExternalDataService.Router do
  use Plug.Router

  plug :match
  plug Plug.Parsers, parsers: [:json], json_decoder: Jason
  plug :dispatch

  get "/health" do
    send_json(conn, 200, %{status: "ok", service: "external-data-service"})
  end

  # AGENT: Customize external data source for industry (e.g., weather API, traffic API, pharmacy API)
  get "/api/external" do
    # Simulated external data feed
    regions = ["region-1", "region-2", "region-3", "region-4", "region-5"]
    data = Enum.map(regions, fn region ->
      %{
        region: region,
        temperature_c: :rand.uniform(40) - 5,
        humidity_pct: :rand.uniform(100),
        wind_speed_kmh: :rand.uniform(80),
        condition: Enum.random(["clear", "cloudy", "rain", "storm", "snow"]),
        fetched_at: DateTime.utc_now() |> DateTime.to_iso8601()
      }
    end)
    send_json(conn, 200, data)
  end

  get "/api/external/current" do
    region = conn.params["region"] || "region-1"
    data = %{
      region: region,
      temperature_c: :rand.uniform(40) - 5,
      humidity_pct: :rand.uniform(100),
      wind_speed_kmh: :rand.uniform(80),
      pressure_hpa: 1000 + :rand.uniform(50),
      condition: Enum.random(["clear", "cloudy", "rain", "storm"]),
      fetched_at: DateTime.utc_now() |> DateTime.to_iso8601()
    }
    send_json(conn, 200, data)
  end

  get "/api/external/forecast" do
    # 24-hour forecast
    hours = Enum.map(0..23, fn h ->
      %{
        hour: h,
        temperature_c: :rand.uniform(40) - 5,
        precipitation_pct: :rand.uniform(100),
        condition: Enum.random(["clear", "cloudy", "rain", "storm"])
      }
    end)
    send_json(conn, 200, %{region: "region-1", hours: hours})
  end

  match _ do
    send_json(conn, 404, %{error: "not found"})
  end

  defp send_json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end
end
