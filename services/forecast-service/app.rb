require 'sinatra'
require 'pg'
require 'json'
require 'securerandom'

set :bind, '0.0.0.0'
set :port, ENV.fetch('PORT', '4567').to_i

def db
  @db ||= PG.connect(
    host: ENV.fetch('DB_HOST', 'timescaledb'),
    port: ENV.fetch('DB_PORT', '5432').to_i,
    dbname: ENV.fetch('DB_NAME', 'appdb'),
    user: ENV.fetch('DB_USER', 'appuser'),
    password: ENV.fetch('DB_PASSWORD', 'changeme')
  )
end

# AGENT: Customize forecast table for industry-specific predictions
begin
  db.exec(<<~SQL)
    CREATE TABLE IF NOT EXISTS forecasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT 'region-1',
      predicted_value DOUBLE PRECISION NOT NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0.8,
      period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 day',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  SQL
  puts "Forecasts table initialized"
rescue => e
  puts "DB init error: #{e.message}"
end

get '/health' do
  content_type :json
  { status: 'ok', service: 'forecast-service' }.to_json
end

# AGENT: Update endpoint path (e.g., /api/demand-forecasts)
get '/api/forecasts' do
  content_type :json
  begin
    result = db.exec("SELECT * FROM forecasts ORDER BY created_at DESC LIMIT 100")
    result.map { |r| r }.to_json
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

get '/api/forecasts/latest' do
  content_type :json
  begin
    result = db.exec(<<~SQL)
      SELECT DISTINCT ON (metric, region) *
      FROM forecasts
      ORDER BY metric, region, created_at DESC
    SQL
    result.map { |r| r }.to_json
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

post '/api/forecasts' do
  content_type :json
  data = JSON.parse(request.body.read) rescue {}
  begin
    id = SecureRandom.uuid
    db.exec_params(
      "INSERT INTO forecasts (id, metric, region, predicted_value, confidence, period_start, period_end) " \
      "VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        id,
        data.fetch('metric', 'generic_metric'),
        data.fetch('region', 'region-1'),
        data.fetch('predicted_value', rand * 1000).to_f,
        data.fetch('confidence', 0.8).to_f,
        data.fetch('period_start', Time.now.utc.iso8601),
        data.fetch('period_end', (Time.now.utc + 86400).iso8601),
      ]
    )
    status 201
    { id: id, status: 'created' }.to_json
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end

# AGENT: Customize forecast generation algorithm for industry
post '/api/forecasts/generate' do
  content_type :json
  regions = JSON.parse(ENV.fetch('REGIONS', '["region-1","region-2","region-3","region-4","region-5"]'))
  metrics = %w[metric_a metric_b metric_c metric_d]
  count = 0
  begin
    regions.each do |region|
      metrics.each do |metric|
        24.times do |h|
          start_time = Time.now.utc + (h * 3600)
          end_time = start_time + 3600
          db.exec_params(
            "INSERT INTO forecasts (metric, region, predicted_value, confidence, period_start, period_end) " \
            "VALUES ($1, $2, $3, $4, $5, $6)",
            [metric, region, (rand * 500 + 100).round(2), (rand * 0.3 + 0.7).round(3),
             start_time.iso8601, end_time.iso8601]
          )
          count += 1
        end
      end
    end
    { generated: count }.to_json
  rescue => e
    status 500
    { error: e.message }.to_json
  end
end
