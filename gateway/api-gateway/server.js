const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// Structured Logger
// ============================================================
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, message, meta = {}) {
  if ((LOG_LEVELS[level] || 0) < (LOG_LEVELS[LOG_LEVEL] || 0)) return;
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}
const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info', msg, meta),
  warn:  (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

// ============================================================
// Dynatrace Business Events Integration
// ============================================================
const DT_TENANT_URL = process.env.DT_TENANT_URL || '';
const DT_BIZEVENT_TOKEN = process.env.DT_BIZEVENT_TOKEN || '';
const DT_BIZEVENT_ENABLED = !!(DT_TENANT_URL && DT_BIZEVENT_TOKEN);
const EVENT_PROVIDER = process.env.EVENT_PROVIDER || 'genericapp.event.provider';

if (DT_BIZEVENT_ENABLED) {
  logger.info('Dynatrace Business Events ENABLED', { tenant: DT_TENANT_URL });
} else {
  logger.info('Dynatrace Business Events DISABLED (set DT_TENANT_URL and DT_BIZEVENT_TOKEN to enable)');
}

async function sendBizEvent(eventType, data) {
  if (!DT_BIZEVENT_ENABLED) return;
  const cloudEvent = {
    specversion: '1.0',
    id: `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: EVENT_PROVIDER,
    type: eventType,
    time: new Date().toISOString(),
    data
  };
  try {
    await axios.post(
      `${DT_TENANT_URL}/api/v2/bizevents/ingest`,
      cloudEvent,
      {
        headers: {
          'Content-Type': 'application/cloudevent+json',
          Authorization: `Api-Token ${DT_BIZEVENT_TOKEN}`
        },
        timeout: 5000
      }
    );
    logger.debug('BizEvent sent', { type: eventType });
  } catch (err) {
    logger.warn('BizEvent send failed', { type: eventType, error: err.message });
  }
}

function sendBizEvents(events) {
  if (!DT_BIZEVENT_ENABLED) return;
  events.forEach(e => sendBizEvent(e.type, e.data));
}

// ============================================================
// AGENT: Update service names and ports after industry rename
// ============================================================
const SERVICE_URLS = {
  primary:       process.env.PRIMARY_SERVICE_URL      || 'http://primary-service:3001',
  secondary:     process.env.SECONDARY_SERVICE_URL    || 'http://secondary-service:3002',
  telemetry:     process.env.TELEMETRY_SERVICE_URL    || 'http://telemetry-service:5001',
  ingestion:     process.env.INGESTION_SERVICE_URL    || 'http://data-ingestion-service:8081',
  topology:      process.env.TOPOLOGY_SERVICE_URL     || 'http://topology-service:5002',
  analytics:     process.env.ANALYTICS_SERVICE_URL    || 'http://analytics-service:8082',
  forecast:      process.env.FORECAST_SERVICE_URL     || 'http://forecast-service:4567',
  dispatch:      process.env.DISPATCH_SERVICE_URL     || 'http://dispatch-service:8083',
  notification:  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8080',
  external:      process.env.EXTERNAL_SERVICE_URL     || 'http://external-data-service:4000',
  aggregator:    process.env.AGGREGATOR_SERVICE_URL   || 'http://aggregator-service:8084',
  auth:          process.env.AUTH_SERVICE_URL          || 'http://auth-service:4568',
  audit:         process.env.AUDIT_SERVICE_URL        || 'http://audit-service:8085',
  pricing:       process.env.PRICING_SERVICE_URL      || 'http://pricing-service:5003',
  workOrder:     process.env.WORK_ORDER_SERVICE_URL   || 'http://work-order-service:8086',
  correlation:   process.env.CORRELATION_SERVICE_URL  || 'http://correlation-service:5004',
};

// ============================================================
// Fault Injection Engine — togglable failure scenarios for Dynatrace demos
// Injects real HTTP 500 errors with exception traces that Davis AI detects
// AGENT: Customize scenarios from industry.yaml fault_scenarios
// ============================================================
const faultState = {
  enabled: false,
  scenario: null,
  startedAt: null,
  errorCount: 0,
  requestCount: 0,
  affectedServices: [],
  failureRate: 0.75
};

const FAULT_SCENARIOS = {
  'database-outage': {
    description: 'TimescaleDB connection pool exhausted — primary + secondary + analytics services fail',
    affectedServices: ['incidents', 'readings', 'analytics', 'telemetry'],
    failureRate: 0.80,
    errors: [
      { status: 500, message: 'FATAL: remaining connection slots are reserved for superuser connections', code: 'ECONNREFUSED' },
      { status: 500, message: 'Error: connect ECONNREFUSED 10.0.0.5:5432 - PostgreSQL connection pool exhausted', code: 'POOL_EXHAUSTED' },
      { status: 500, message: 'TimeoutError: ResourceRequest timed out - pg pool max connections (10) reached', code: 'TIMEOUT' },
      { status: 503, message: 'ServiceUnavailableError: Database health check failed after 3 retries', code: 'DB_HEALTH_FAILED' }
    ]
  },
  'cascade-failure': {
    description: 'Telemetry service timeout causes cascading failures across primary + topology + analytics',
    affectedServices: ['telemetry', 'incidents', 'topology', 'analytics', 'dispatch'],
    failureRate: 0.70,
    errors: [
      { status: 500, message: 'Error: socket hang up - upstream telemetry stream interrupted', code: 'ECONNRESET' },
      { status: 504, message: 'GatewayTimeoutError: upstream service did not respond within 8000ms', code: 'GATEWAY_TIMEOUT' },
      { status: 500, message: 'Error: data pipeline stalled — no readings received in 30s, triggering failover', code: 'PIPELINE_STALL' },
      { status: 502, message: 'BadGatewayError: upstream service returned malformed response (truncated JSON)', code: 'BAD_GATEWAY' }
    ]
  },
  'resource-exhaustion': {
    description: 'Memory pressure + thread pool exhaustion across Java/Python services',
    affectedServices: ['ingestion', 'analytics', 'forecast', 'external'],
    failureRate: 0.65,
    errors: [
      { status: 500, message: 'java.lang.OutOfMemoryError: GC overhead limit exceeded - HikariPool connection leak detected', code: 'OOM' },
      { status: 500, message: 'MemoryError: Unable to allocate 256 MiB for analytics matrix computation', code: 'MEMORY_ERROR' },
      { status: 500, message: 'Error: worker_threads pool exhausted - all 4 workers busy processing forecast models', code: 'THREAD_POOL' },
      { status: 503, message: 'ServiceUnavailableError: Container memory limit (512Mi) approaching — 498Mi used', code: 'RESOURCE_LIMIT' }
    ]
  },
  'network-partition': {
    description: 'Kafka + RabbitMQ broker connectivity lost — async messaging fails, dispatch + notifications impacted',
    affectedServices: ['dispatch', 'notifications', 'telemetry', 'incidents'],
    failureRate: 0.85,
    errors: [
      { status: 500, message: 'KafkaJSConnectionError: Connection timeout to kafka:9092 — broker unreachable', code: 'KAFKA_CONN' },
      { status: 500, message: 'Error: Channel closed by server: 320 (CONNECTION-FORCED) — RabbitMQ node unreachable', code: 'AMQP_CLOSED' },
      { status: 500, message: 'Error: connect ETIMEDOUT 10.0.0.12:9092 — network partition detected between AZ-1 and AZ-2', code: 'ETIMEDOUT' },
      { status: 502, message: 'BadGatewayError: Message broker health check failed — 0 of 3 brokers responding', code: 'BROKER_DOWN' }
    ]
  }
};

app.post('/api/fault/inject', (req, res) => {
  const scenario = req.body.scenario || 'database-outage';
  const config = FAULT_SCENARIOS[scenario];
  if (!config) {
    return res.status(400).json({ error: `Unknown scenario. Available: ${Object.keys(FAULT_SCENARIOS).join(', ')}` });
  }
  faultState.enabled = true;
  faultState.scenario = scenario;
  faultState.startedAt = new Date().toISOString();
  faultState.errorCount = 0;
  faultState.requestCount = 0;
  faultState.affectedServices = config.affectedServices;
  faultState.failureRate = req.body.failureRate || config.failureRate;
  logger.error(`FAULT INJECTION ENABLED: ${scenario}`, {
    description: config.description,
    affectedServices: config.affectedServices,
    failureRate: faultState.failureRate
  });
  res.json({
    status: 'Fault injection ENABLED',
    scenario,
    description: config.description,
    affectedServices: config.affectedServices,
    failureRate: faultState.failureRate,
    startedAt: faultState.startedAt,
    note: 'Dynatrace should detect failure rate increase within 2-5 minutes'
  });
});

app.post('/api/fault/clear', (req, res) => {
  const summary = {
    scenario: faultState.scenario,
    duration: faultState.startedAt ? `${Math.round((Date.now() - new Date(faultState.startedAt).getTime()) / 1000)}s` : null,
    totalErrors: faultState.errorCount,
    totalRequests: faultState.requestCount
  };
  faultState.enabled = false;
  faultState.scenario = null;
  faultState.startedAt = null;
  faultState.affectedServices = [];
  logger.info('FAULT INJECTION CLEARED', summary);
  res.json({ status: 'Fault injection CLEARED', summary });
});

app.get('/api/fault/status', (req, res) => {
  res.json({
    enabled: faultState.enabled,
    scenario: faultState.scenario,
    startedAt: faultState.startedAt,
    affectedServices: faultState.affectedServices,
    failureRate: faultState.failureRate,
    errorCount: faultState.errorCount,
    requestCount: faultState.requestCount,
    availableScenarios: Object.entries(FAULT_SCENARIOS).map(([k, v]) => ({
      name: k, description: v.description, services: v.affectedServices, defaultRate: v.failureRate
    }))
  });
});

// ============================================================
// Request logging middleware + fault injection + sporadic slowdowns
// ============================================================
app.use((req, res, next) => {
  const start = Date.now();
  logger.debug('Incoming request', { method: req.method, path: req.path, query: req.query });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = { method: req.method, path: req.path, status: res.statusCode, durationMs: duration };
    if (res.statusCode >= 500) {
      logger.error('Request failed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else if (duration > 5000) {
      logger.warn('Slow request detected', { ...logData, threshold: '5000ms' });
    } else {
      logger.info('Request completed', logData);
    }
  });

  // ---- FAULT INJECTION MIDDLEWARE ----
  if (faultState.enabled && req.path !== '/api/health' && !req.path.startsWith('/api/fault/')) {
    faultState.requestCount++;
    const matchedService = faultState.affectedServices.find(svc => req.path.includes(`/api/${svc}`));
    if (matchedService && Math.random() < faultState.failureRate) {
      faultState.errorCount++;
      const scenario = FAULT_SCENARIOS[faultState.scenario];
      const errorTemplate = scenario.errors[Math.floor(Math.random() * scenario.errors.length)];
      logger.error(`FAULT INJECTED: ${errorTemplate.code}`, {
        path: req.path,
        service: matchedService,
        scenario: faultState.scenario,
        errorMessage: errorTemplate.message
      });
      return res.status(errorTemplate.status).json({
        error: errorTemplate.message,
        code: errorTemplate.code,
        service: matchedService,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ~2% chance: sporadic gateway timeout simulation
  if (Math.random() < 0.02 && req.path !== '/api/health' && !req.path.startsWith('/api/simulate') && !req.path.startsWith('/api/fault/')) {
    const delayMs = 3000 + Math.floor(Math.random() * 5000);
    logger.warn('Simulating gateway slowdown', { path: req.path, delayMs });
    setTimeout(() => next(), delayMs);
    return;
  }

  next();
});

// ============================================================
// Proxy helper — forwards requests to backend services
// ============================================================
function proxy(targetUrl) {
  return async (req, res) => {
    const url = `${targetUrl}${req.originalUrl}`;
    logger.info(`Gateway proxy: ${req.method} ${req.originalUrl}`);
    try {
      const opts = { method: req.method, url, timeout: 8000 };
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) opts.data = req.body;
      if (Object.keys(req.query).length) opts.params = req.query;
      const { data } = await axios(opts);
      res.json(data);
    } catch (err) {
      const status = err.response ? err.response.status : 502;
      logger.error(`Gateway error: ${req.originalUrl}`, { error: err.message, status });
      if (err.response && err.response.data) {
        res.status(status).json(err.response.data);
      } else {
        res.status(status).json({ error: `Service unavailable: ${err.message}` });
      }
    }
  };
}

// ============================================================
// AGENT: Update route paths and service URLs after industry rename
// Each route group proxies to the corresponding microservice.
// Service names must match K8s service DNS names.
// ============================================================

// primary-service routes (Node.js:3001)
app.get('/api/incidents',           proxy(SERVICE_URLS.primary));
app.get('/api/incidents/active',    proxy(SERVICE_URLS.primary));
app.get('/api/incidents/stats/summary', proxy(SERVICE_URLS.primary));
app.get('/api/incidents/:id',       proxy(SERVICE_URLS.primary));
app.post('/api/incidents',          proxy(SERVICE_URLS.primary));
app.post('/api/incidents/simulate', proxy(SERVICE_URLS.primary));

// secondary-service routes (Node.js:3002)
app.get('/api/readings',            proxy(SERVICE_URLS.secondary));
app.get('/api/readings/summary',    proxy(SERVICE_URLS.secondary));
app.get('/api/readings/region/:region', proxy(SERVICE_URLS.secondary));
app.post('/api/readings/simulate',  proxy(SERVICE_URLS.secondary));

// telemetry-service routes (.NET:5001)
app.get('/api/telemetry',             proxy(SERVICE_URLS.telemetry));
app.get('/api/telemetry/latest',      proxy(SERVICE_URLS.telemetry));
app.get('/api/telemetry/history',     proxy(SERVICE_URLS.telemetry));
app.get('/api/telemetry/alerts',      proxy(SERVICE_URLS.telemetry));
app.get('/api/telemetry/alerts/active', proxy(SERVICE_URLS.telemetry));
app.get('/api/telemetry/summary',     proxy(SERVICE_URLS.telemetry));
app.post('/api/telemetry/simulate',   proxy(SERVICE_URLS.telemetry));

// data-ingestion-service routes (Java:8081)
app.get('/api/ingestion',              proxy(SERVICE_URLS.ingestion));
app.get('/api/ingestion/readings',     proxy(SERVICE_URLS.ingestion));
app.get('/api/ingestion/readings/:id', proxy(SERVICE_URLS.ingestion));
app.get('/api/ingestion/anomalies',    proxy(SERVICE_URLS.ingestion));
app.get('/api/ingestion/summary',      proxy(SERVICE_URLS.ingestion));
app.post('/api/ingestion/simulate',    proxy(SERVICE_URLS.ingestion));

// topology-service routes (Python:5002)
app.get('/api/topology',              proxy(SERVICE_URLS.topology));
app.get('/api/topology/assets',       proxy(SERVICE_URLS.topology));
app.get('/api/topology/assets/:id',   proxy(SERVICE_URLS.topology));
app.get('/api/topology/hierarchy',    proxy(SERVICE_URLS.topology));
app.get('/api/topology/affected/:type/:id', proxy(SERVICE_URLS.topology));
app.get('/api/topology/stats',        proxy(SERVICE_URLS.topology));
app.post('/api/topology/simulate',    proxy(SERVICE_URLS.topology));

// analytics-service routes (Go:8082)
app.get('/api/analytics/dashboard',   proxy(SERVICE_URLS.analytics));
app.get('/api/analytics/trends',      proxy(SERVICE_URLS.analytics));
app.get('/api/analytics/indices',     proxy(SERVICE_URLS.analytics));
app.get('/api/analytics/history',     proxy(SERVICE_URLS.analytics));
app.get('/api/analytics/events',      proxy(SERVICE_URLS.analytics));
app.post('/api/analytics/calculate',  proxy(SERVICE_URLS.analytics));

// forecast-service routes (Ruby:4567)
app.get('/api/forecasts',            proxy(SERVICE_URLS.forecast));
app.get('/api/forecasts/current',    proxy(SERVICE_URLS.forecast));
app.get('/api/forecasts/hourly',     proxy(SERVICE_URLS.forecast));
app.get('/api/forecasts/summary',    proxy(SERVICE_URLS.forecast));
app.get('/api/forecasts/regions',    proxy(SERVICE_URLS.forecast));
app.post('/api/forecasts/generate',  proxy(SERVICE_URLS.forecast));

// dispatch-service routes (Kotlin:8083)
app.get('/api/dispatch',               proxy(SERVICE_URLS.dispatch));
app.get('/api/dispatch/teams',         proxy(SERVICE_URLS.dispatch));
app.get('/api/dispatch/teams/available', proxy(SERVICE_URLS.dispatch));
app.get('/api/dispatch/active',        proxy(SERVICE_URLS.dispatch));
app.get('/api/dispatch/:id',           proxy(SERVICE_URLS.dispatch));
app.get('/api/dispatch/stats',         proxy(SERVICE_URLS.dispatch));
app.post('/api/dispatch/simulate',     proxy(SERVICE_URLS.dispatch));

// notification-service routes (PHP:8080)
app.get('/api/notifications',          proxy(SERVICE_URLS.notification));
app.get('/api/notifications/log',      proxy(SERVICE_URLS.notification));
app.get('/api/notifications/stats',    proxy(SERVICE_URLS.notification));
app.post('/api/notifications/simulate', proxy(SERVICE_URLS.notification));

// external-data-service routes (Elixir:4000)
app.get('/api/external',              proxy(SERVICE_URLS.external));
app.get('/api/external/conditions',   proxy(SERVICE_URLS.external));
app.get('/api/external/region/:region', proxy(SERVICE_URLS.external));
app.get('/api/external/forecast',     proxy(SERVICE_URLS.external));
app.get('/api/external/alerts',       proxy(SERVICE_URLS.external));
app.get('/api/external/correlations', proxy(SERVICE_URLS.external));
app.get('/api/external/summary',      proxy(SERVICE_URLS.external));
app.post('/api/external/simulate',    proxy(SERVICE_URLS.external));
app.post('/api/external/correlate',   proxy(SERVICE_URLS.external));

// aggregator-service routes (Rust:8084)
app.get('/api/aggregation',             proxy(SERVICE_URLS.aggregator));
app.get('/api/aggregation/dashboard',   proxy(SERVICE_URLS.aggregator));
app.get('/api/aggregation/incident/:id', proxy(SERVICE_URLS.aggregator));
app.get('/api/aggregation/correlation', proxy(SERVICE_URLS.aggregator));
app.get('/api/aggregation/operations',  proxy(SERVICE_URLS.aggregator));
app.get('/api/aggregation/report/:type', proxy(SERVICE_URLS.aggregator));

// auth-service routes (Ruby:4568)
app.post('/api/auth/login',          proxy(SERVICE_URLS.auth));
app.post('/api/auth/register',       proxy(SERVICE_URLS.auth));
app.post('/api/auth/logout',         proxy(SERVICE_URLS.auth));
app.get('/api/auth/me',              proxy(SERVICE_URLS.auth));
app.get('/api/auth/users',           proxy(SERVICE_URLS.auth));
app.get('/api/auth/usernames',       proxy(SERVICE_URLS.auth));
app.put('/api/auth/preferences',     proxy(SERVICE_URLS.auth));

// audit-service routes (Go:8085)
app.get('/api/audit',               proxy(SERVICE_URLS.audit));
app.get('/api/audit/log',           proxy(SERVICE_URLS.audit));
app.get('/api/audit/stats',         proxy(SERVICE_URLS.audit));
app.get('/api/audit/search',        proxy(SERVICE_URLS.audit));
app.post('/api/audit/log',          proxy(SERVICE_URLS.audit));

// pricing-service routes (Python:5003)
app.get('/api/pricing',              proxy(SERVICE_URLS.pricing));
app.get('/api/pricing/current',      proxy(SERVICE_URLS.pricing));
app.get('/api/pricing/calculate',    proxy(SERVICE_URLS.pricing));
app.get('/api/pricing/rates',        proxy(SERVICE_URLS.pricing));
app.get('/api/pricing/regions',      proxy(SERVICE_URLS.pricing));
app.get('/api/pricing/impact',       proxy(SERVICE_URLS.pricing));
app.post('/api/pricing/simulate',    proxy(SERVICE_URLS.pricing));

// work-order-service routes (Java:8086)
app.get('/api/work-orders',          proxy(SERVICE_URLS.workOrder));
app.get('/api/work-orders/stats',    proxy(SERVICE_URLS.workOrder));
app.get('/api/work-orders/:id',      proxy(SERVICE_URLS.workOrder));
app.post('/api/work-orders',         proxy(SERVICE_URLS.workOrder));
app.put('/api/work-orders/:id',      proxy(SERVICE_URLS.workOrder));

// correlation-service routes (.NET:5004)
app.get('/api/correlation',           proxy(SERVICE_URLS.correlation));
app.get('/api/correlation/correlated', proxy(SERVICE_URLS.correlation));
app.get('/api/correlation/stats',     proxy(SERVICE_URLS.correlation));
app.post('/api/correlation/correlate', proxy(SERVICE_URLS.correlation));

// ============================================================
// Global Search — queries multiple services in parallel
// Creates fan-out distributed traces for Dynatrace PurePath
// ============================================================
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ results: [] });
  logger.info('GET /api/search', { query: q });
  const [incidents, readings, assets, dispatches, workOrders, auditLogs] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.primary}/api/incidents`, { timeout: 5000 }).then(r => {
      const items = Array.isArray(r.data) ? r.data : r.data.incidents || [];
      return items.filter(o => JSON.stringify(o).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    }),
    axios.get(`${SERVICE_URLS.secondary}/api/readings`, { timeout: 5000 }).then(r => {
      const items = Array.isArray(r.data) ? r.data : r.data.readings || [];
      return items.filter(m => JSON.stringify(m).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    }),
    axios.get(`${SERVICE_URLS.topology}/api/topology/assets`, { timeout: 5000 }).then(r => {
      const items = Array.isArray(r.data) ? r.data : r.data.assets || [];
      return items.filter(a => JSON.stringify(a).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    }),
    axios.get(`${SERVICE_URLS.dispatch}/api/dispatch`, { timeout: 5000 }).then(r => {
      const items = Array.isArray(r.data) ? r.data : r.data.dispatches || [];
      return items.filter(d => JSON.stringify(d).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    }),
    axios.get(`${SERVICE_URLS.workOrder}/api/work-orders`, { timeout: 5000 }).then(r => {
      const items = Array.isArray(r.data) ? r.data : r.data.workOrders || [];
      return items.filter(w => JSON.stringify(w).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
    }),
    axios.get(`${SERVICE_URLS.audit}/api/audit/search?q=${encodeURIComponent(q)}`, { timeout: 5000 }).then(r => r.data.entries || [])
  ]);
  res.json({
    query: q,
    results: {
      incidents: incidents.status === 'fulfilled' ? incidents.value : [],
      readings: readings.status === 'fulfilled' ? readings.value : [],
      assets: assets.status === 'fulfilled' ? assets.value : [],
      dispatches: dispatches.status === 'fulfilled' ? dispatches.value : [],
      workOrders: workOrders.status === 'fulfilled' ? workOrders.value : [],
      auditLogs: auditLogs.status === 'fulfilled' ? auditLogs.value : []
    }
  });
});

// Service discovery endpoint (used by UI to know available services)
app.get('/api/services', (req, res) => {
  res.json(Object.entries(SERVICE_URLS).map(([name, url]) => ({ name, url })));
});

// ============================================================
// Simulation Orchestrator — multi-wave pipeline for deep distributed traces
// AGENT: Update service URLs and event types after industry rename
// Wave 1 (parallel): Telemetry + External data generators
// Wave 2 (sequential): External correlation → enriches with telemetry context
// Wave 3 (parallel): Primary + Secondary + Forecast + Ingestion
// Wave 4 (sequential): Analytics calculation → depends on incident data
// Wave 5 (parallel → sequential): Dispatch → then notifications
// Wave 6 (parallel): Pricing + correlation + work-orders + audit
// ============================================================
app.post('/api/simulate/cycle', async (req, res) => {
  const cycleStart = Date.now();
  logger.info('POST /api/simulate/cycle - orchestrating multi-wave simulation pipeline');
  const results = {};

  // Wave 1: Sensor data generators (parallel) — Telemetry + External data
  logger.info('Simulation Wave 1: Telemetry + External data generation');
  await Promise.allSettled([
    axios.post(`${SERVICE_URLS.telemetry}/api/telemetry/simulate`, {}, { timeout: 10000 })
      .then(r => { results.telemetry = r.data; })
      .catch(err => { results.telemetry = { error: err.message }; }),
    axios.post(`${SERVICE_URLS.external}/api/external/simulate`, {}, { timeout: 10000 })
      .then(r => { results.external = r.data; })
      .catch(err => { results.external = { error: err.message }; })
  ]);

  // Wave 2: External correlation (sequential)
  logger.info('Simulation Wave 2: External data correlation (sequential)');
  await axios.post(`${SERVICE_URLS.external}/api/external/correlate`, {}, { timeout: 10000 })
    .then(r => { results.externalCorrelation = r.data; })
    .catch(err => { results.externalCorrelation = { error: err.message }; });

  // Wave 3: Event processors (parallel) — Primary + Secondary + Forecast + Ingestion
  logger.info('Simulation Wave 3: Event processing (incidents + readings + forecast + ingestion)');
  await Promise.allSettled([
    axios.post(`${SERVICE_URLS.primary}/api/incidents/simulate`, {}, { timeout: 10000 })
      .then(r => { results.incidents = r.data; })
      .catch(err => { results.incidents = { error: err.message }; }),
    axios.post(`${SERVICE_URLS.secondary}/api/readings/simulate`, {}, { timeout: 10000 })
      .then(r => { results.readings = r.data; })
      .catch(err => { results.readings = { error: err.message }; }),
    axios.post(`${SERVICE_URLS.forecast}/api/forecasts/generate`, {}, { timeout: 10000 })
      .then(r => { results.forecast = r.data; })
      .catch(err => { results.forecast = { error: err.message }; }),
    axios.post(`${SERVICE_URLS.ingestion}/api/ingestion/simulate`, {}, { timeout: 10000 })
      .then(r => { results.ingestion = r.data; })
      .catch(err => { results.ingestion = { error: err.message }; })
  ]);

  // Wave 4: Analytics (sequential) — depends on incident data
  logger.info('Simulation Wave 4: Analytics calculation (sequential, depends on incident data)');
  await axios.post(`${SERVICE_URLS.analytics}/api/analytics/calculate`, {}, { timeout: 10000 })
    .then(r => { results.analytics = r.data; })
    .catch(err => { results.analytics = { error: err.message }; });

  // Wave 5: Operations — Dispatch first, then notifications
  logger.info('Simulation Wave 5a: Dispatch (sequential)');
  await axios.post(`${SERVICE_URLS.dispatch}/api/dispatch/simulate`, {}, { timeout: 10000 })
    .then(r => { results.dispatch = r.data; })
    .catch(err => { results.dispatch = { error: err.message }; });

  logger.info('Simulation Wave 5b: Notifications (depends on dispatch)');
  await axios.post(`${SERVICE_URLS.notification}/api/notifications/simulate`, {}, { timeout: 10000 })
    .then(r => { results.notifications = r.data; })
    .catch(err => { results.notifications = { error: err.message }; });

  // Wave 6: Extended services (parallel) — pricing, correlation, work-orders, audit
  logger.info('Simulation Wave 6: Extended services (pricing + correlation + work-orders + audit)');
  await Promise.allSettled([
    axios.get(`${SERVICE_URLS.pricing}/api/pricing/current`, { timeout: 10000 })
      .then(r => { results.pricing = r.data; })
      .catch(err => { results.pricing = { error: err.message }; }),
    axios.post(`${SERVICE_URLS.correlation}/api/correlation/correlate`, {}, { timeout: 10000 })
      .then(r => { results.correlation = r.data; })
      .catch(err => { results.correlation = { error: err.message }; }),
    axios.get(`${SERVICE_URLS.workOrder}/api/work-orders/stats`, { timeout: 10000 })
      .then(r => { results.workOrders = r.data; })
      .catch(err => { results.workOrders = { error: err.message }; }),
    axios.get(`${SERVICE_URLS.audit}/api/audit/stats`, { timeout: 10000 })
      .then(r => { results.audit = r.data; })
      .catch(err => { results.audit = { error: err.message }; })
  ]);

  const durationMs = Date.now() - cycleStart;
  logger.info('Simulation cycle complete', { durationMs, waves: 6, services: Object.keys(results).length });

  // ---- Dynatrace Business Events per simulation cycle ----
  const bizEvents = [];
  const REGIONS = ['region-1', 'region-2', 'region-3', 'region-4', 'region-5'];
  const UNITS = ['Unit-A', 'Unit-B', 'Unit-C', 'Unit-D', 'Unit-E'];
  const CATEGORIES = ['category-1', 'category-2', 'category-3', 'category-4', 'category-5'];
  const PRIORITIES = ['low', 'medium', 'high', 'critical'];
  const CHANNELS = ['web', 'api', 'mobile', 'batch'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const rng = () => Math.random();
  const region = pick(REGIONS);
  const unit = pick(UNITS);

  // 1. Telemetry received
  bizEvents.push({ type: 'telemetry.received', data: {
    'event.provider': EVENT_PROVIDER,
    region, unit,
    'device.id': `DEV-${unit.replace('Unit-', '')}-${Math.floor(rng() * 100) + 1}`,
    metric: pick(['throughput', 'latency', 'error_rate', 'utilization', 'queue_depth']),
    value: Math.round(rng() * 100 * 100) / 100,
    timestamp: new Date().toISOString()
  }});

  // 2. External data received
  {
    const w = (results.external && !results.external.error) ? results.external : {};
    bizEvents.push({ type: 'external.data.received', data: {
      'event.provider': EVENT_PROVIDER,
      region, unit,
      'data.source': pick(['weather', 'market', 'regulatory', 'supplier']),
      'data.quality': +(0.7 + rng() * 0.29).toFixed(2),
      'risk.level': pick(['low', 'medium', 'high']),
      timestamp: new Date().toISOString()
    }});
  }

  // 3. Incident created
  {
    const incidentId = `INC-${Date.now()}-${Math.floor(rng() * 9000 + 1000)}`;
    bizEvents.push({ type: 'incident.created', data: {
      'event.provider': EVENT_PROVIDER,
      'incident.id': incidentId,
      region, unit,
      priority: pick(PRIORITIES),
      category: pick(CATEGORIES),
      'items.affected': Math.floor(rng() * 50) + 1,
      channel: pick(CHANNELS),
      timestamp: new Date().toISOString()
    }});
  }

  // 4. Reading recorded
  bizEvents.push({ type: 'reading.recorded', data: {
    'event.provider': EVENT_PROVIDER,
    'reading.id': `RDG-${pick(['A', 'B', 'C'])}-${String(Math.floor(rng() * 999) + 1).padStart(3, '0')}`,
    region, unit,
    'value.primary': Math.round(rng() * 1000 * 100) / 100,
    'value.secondary': Math.round(rng() * 500 * 100) / 100,
    'quality.score': Math.round((rng() * 0.3 + 0.7) * 1000) / 1000,
    timestamp: new Date().toISOString()
  }});

  // 5. Data ingested
  bizEvents.push({ type: 'data.ingested', data: {
    'event.provider': EVENT_PROVIDER,
    'source.id': `SRC-${String(Math.floor(rng() * 999) + 1).padStart(3, '0')}`,
    category: pick(CATEGORIES),
    'records.processed': Math.floor(rng() * 500 + 10),
    'records.rejected': Math.floor(rng() * 10),
    'processing.ms': Math.floor(rng() * 2000 + 50),
    timestamp: new Date().toISOString()
  }});

  // 6. Forecast generated
  bizEvents.push({ type: 'forecast.generated', data: {
    'event.provider': EVENT_PROVIDER,
    region, unit,
    category: pick(CATEGORIES),
    'predicted.value': Math.round(rng() * 500 * 100) / 100,
    confidence: Math.round((rng() * 0.3 + 0.7) * 1000) / 1000,
    'horizon.hours': pick([1, 6, 12, 24, 48]),
    timestamp: new Date().toISOString()
  }});

  // 7. Analytics calculated
  {
    const a = (results.analytics && !results.analytics.error) ? results.analytics : {};
    bizEvents.push({ type: 'analytics.calculated', data: {
      'event.provider': EVENT_PROVIDER,
      region, unit,
      'metric.primary': a.metricPrimary || +(0.5 + rng() * 3).toFixed(2),
      'metric.secondary': a.metricSecondary || +(0.3 + rng() * 1.5).toFixed(2),
      'total.events': a.totalEvents || Math.floor(1 + rng() * 20),
      timestamp: new Date().toISOString()
    }});
  }

  // 8. Work dispatched
  bizEvents.push({ type: 'work.dispatched', data: {
    'event.provider': EVENT_PROVIDER,
    'dispatch.id': `DSP-${Date.now()}`,
    region, unit,
    assignee: pick(['operator_a', 'operator_b', 'operator_c', 'team_east', 'team_west']),
    priority: pick(PRIORITIES),
    status: pick(['assigned', 'in_progress', 'completed', 'deferred']),
    'eta.minutes': Math.floor(rng() * 120) + 5,
    timestamp: new Date().toISOString()
  }});

  // 9. Notification sent
  bizEvents.push({ type: 'notification.sent', data: {
    'event.provider': EVENT_PROVIDER,
    channel: pick(['email', 'sms', 'push', 'webhook']),
    subject: pick(['Incident Update', 'Threshold Alert', 'Status Change', 'Resolution Notice', 'Scheduled Maintenance']),
    'delivery.status': rng() > 0.1 ? 'delivered' : 'failed',
    unit,
    timestamp: new Date().toISOString()
  }});

  // 10. Pricing calculated
  bizEvents.push({ type: 'pricing.calculated', data: {
    'event.provider': EVENT_PROVIDER,
    category: pick(CATEGORIES),
    unit,
    'cost.base': Math.round((rng() * 100 + 10) * 100) / 100,
    'cost.adjusted': Math.round((rng() * 100 + 8) * 100) / 100,
    'adjustment.reason': pick(['volume_discount', 'peak_surcharge', 'promotional', 'contract_rate', 'spot_rate']),
    timestamp: new Date().toISOString()
  }});

  // 11. Anomaly detected (~50% chance)
  if (rng() > 0.5) {
    bizEvents.push({ type: 'anomaly.detected', data: {
      'event.provider': EVENT_PROVIDER,
      'anomaly.id': `ANM-${Date.now()}`,
      region, unit,
      'risk.score': Math.round(rng() * 100),
      'anomaly.type': pick(['threshold_breach', 'pattern_deviation', 'rate_change', 'correlation_break']),
      severity: pick(['low', 'medium', 'high']),
      timestamp: new Date().toISOString()
    }});
  }

  // 12. Audit logged
  bizEvents.push({ type: 'audit.logged', data: {
    'event.provider': EVENT_PROVIDER,
    actor: pick(['admin_1', 'operator_a', 'operator_b', 'operator_c', 'system']),
    action: pick(['login', 'create', 'update', 'delete', 'approve', 'export']),
    'resource.type': pick(['incident', 'reading', 'dispatch', 'forecast', 'pricing']),
    'resource.id': `RES-${Math.floor(rng() * 90000 + 10000)}`,
    timestamp: new Date().toISOString()
  }});

  // 13. Work order completed
  bizEvents.push({ type: 'work.order.completed', data: {
    'event.provider': EVENT_PROVIDER,
    'work.order.id': `WO-${Date.now()}`,
    unit,
    assignee: pick(['operator_a', 'operator_b', 'operator_c']),
    priority: pick(PRIORITIES),
    'duration.minutes': Math.floor(rng() * 180) + 10,
    'work.type': pick(['maintenance', 'inspection', 'repair', 'upgrade', 'calibration']),
    timestamp: new Date().toISOString()
  }});

  // 14-25. Per-unit dashboard events (generate for each unit)
  for (const u of UNITS) {
    const r = pick(REGIONS);

    // Reading
    bizEvents.push({ type: 'unit.reading', data: {
      'event.provider': EVENT_PROVIDER,
      unit: u, region: r,
      'reading.id': `RDG-${u}-${Math.floor(rng() * 99999)}`,
      'value.primary': +(50 + rng() * 950).toFixed(2),
      'reading.quality': rng() > 0.05 ? 'valid' : 'estimated',
      timestamp: new Date().toISOString()
    }});

    // Status event
    bizEvents.push({ type: 'unit.status', data: {
      'event.provider': EVENT_PROVIDER,
      unit: u, region: r,
      'load.percent': +(40 + rng() * 55).toFixed(1),
      'capacity': Math.floor(2000 + rng() * 8000),
      'demand': Math.floor(1500 + rng() * 6000),
      timestamp: new Date().toISOString()
    }});

    // Work order completed (~80%)
    if (rng() > 0.2) {
      bizEvents.push({ type: 'unit.work.completed', data: {
        'event.provider': EVENT_PROVIDER,
        unit: u, region: r,
        'work.type': pick(['maintenance', 'inspection', 'repair', 'upgrade', 'calibration']),
        priority: pick(PRIORITIES),
        'duration.minutes': Math.floor(30 + rng() * 480),
        timestamp: new Date().toISOString()
      }});
    }

    // Incident reported (~80%)
    if (rng() > 0.2) {
      bizEvents.push({ type: 'unit.incident.reported', data: {
        'event.provider': EVENT_PROVIDER,
        unit: u, region: r,
        category: pick(CATEGORIES),
        'items.affected': Math.floor(10 + rng() * 5000),
        priority: pick(PRIORITIES),
        timestamp: new Date().toISOString()
      }});
    }

    // Incident resolved (~70%)
    if (rng() > 0.3) {
      bizEvents.push({ type: 'unit.incident.resolved', data: {
        'event.provider': EVENT_PROVIDER,
        unit: u, region: r,
        'resolution.minutes': Math.floor(15 + rng() * 360),
        'items.restored': Math.floor(10 + rng() * 5000),
        timestamp: new Date().toISOString()
      }});
    }
  }

  sendBizEvents(bizEvents);
  res.json({ status: 'Cycle complete', durationMs, bizEventsSent: bizEvents.length, results });
});

// ============================================================
// Aggregated Dashboard — phased sequential + parallel aggregation
// Creates rich distributed traces across all services
// AGENT: Update service URLs and field names after industry rename
// ============================================================
app.get('/api/dashboard', async (req, res) => {
  const dashStart = Date.now();
  logger.info('GET /api/dashboard - phased aggregation (sequential + parallel)');
  const results = {};

  // Phase 1: Infrastructure baseline (parallel) — topology + telemetry
  logger.info('Dashboard Phase 1: Infrastructure data (topology + telemetry)');
  const [topoResult, teleResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.topology}/api/topology/stats`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.telemetry}/api/telemetry/summary`, { timeout: 8000 }).then(r => r.data)
  ]);
  results.topology = topoResult.status === 'fulfilled' ? topoResult.value : null;
  results.telemetry = teleResult.status === 'fulfilled' ? teleResult.value : null;

  // Phase 2: Event data (parallel) — incidents + external data
  logger.info('Dashboard Phase 2: Event data (incidents + external)');
  const [incidentResult, externalResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.primary}/api/incidents/stats/summary`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.external}/api/external/summary`, { timeout: 8000 }).then(r => r.data)
  ]);
  results.incidents = incidentResult.status === 'fulfilled' ? incidentResult.value : null;
  results.external = externalResult.status === 'fulfilled' ? externalResult.value : null;

  // Phase 3: Analytics (sequential) — analytics depends on incident data, then forecast
  logger.info('Dashboard Phase 3: Analytics (analytics → forecast)');
  results.analytics = await axios.get(`${SERVICE_URLS.analytics}/api/analytics/indices`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);
  results.forecast = await axios.get(`${SERVICE_URLS.forecast}/api/forecasts/summary`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  // Phase 4: Operations (parallel) — readings, ingestion, dispatch, notifications
  logger.info('Dashboard Phase 4: Operations (readings + ingestion + dispatch + notifications)');
  const [readingsResult, ingestionResult, dispatchResult, notifResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.secondary}/api/readings/summary`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.ingestion}/api/ingestion/summary`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.dispatch}/api/dispatch/stats`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.notification}/api/notifications/stats`, { timeout: 8000 }).then(r => r.data)
  ]);
  results.readings = readingsResult.status === 'fulfilled' ? readingsResult.value : null;
  results.ingestion = ingestionResult.status === 'fulfilled' ? ingestionResult.value : null;
  results.dispatch = dispatchResult.status === 'fulfilled' ? dispatchResult.value : null;
  results.notifications = notifResult.status === 'fulfilled' ? notifResult.value : null;

  // Phase 5: Extended services (parallel) — pricing, users, work orders, correlation, audit
  logger.info('Dashboard Phase 5: Extended services');
  const [pricingResult, authResult, workOrderResult, corrResult, auditResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.pricing}/api/pricing/current`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.auth}/api/auth/users`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.workOrder}/api/work-orders/stats`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.correlation}/api/correlation/stats`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.audit}/api/audit/stats`, { timeout: 8000 }).then(r => r.data)
  ]);
  results.pricing = pricingResult.status === 'fulfilled' ? pricingResult.value : null;
  results.users = authResult.status === 'fulfilled' ? authResult.value : null;
  results.workOrders = workOrderResult.status === 'fulfilled' ? workOrderResult.value : null;
  results.correlation = corrResult.status === 'fulfilled' ? corrResult.value : null;
  results.auditLog = auditResult.status === 'fulfilled' ? auditResult.value : null;

  const durationMs = Date.now() - dashStart;
  logger.info('Dashboard aggregation complete', { durationMs, phases: 5 });
  res.json(results);
});

// ============================================================
// Enriched Chained Endpoints — deep waterfall traces for observability demos
// ============================================================

// Incident detail enriched: incident → dispatches → external context → topology impact
app.get('/api/incidents/:id/enriched', async (req, res) => {
  const enrichStart = Date.now();
  const incidentId = req.params.id;
  logger.info(`GET /api/incidents/${incidentId}/enriched - sequential enrichment chain`);

  // Step 1: Fetch base incident data
  const incident = await axios.get(`${SERVICE_URLS.primary}/api/incidents/${incidentId}`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  // Step 2: Active dispatches
  const dispatches = await axios.get(`${SERVICE_URLS.dispatch}/api/dispatch/active`, { timeout: 8000 })
    .then(r => r.data).catch(() => []);

  // Step 3: External data for the incident region
  const region = incident.region || incident.location || 'region-1';
  const externalData = await axios.get(`${SERVICE_URLS.external}/api/external/region/${encodeURIComponent(region)}`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  // Step 4: Topology impact + analytics (parallel)
  const [topoResult, analyticsResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.topology}/api/topology/stats`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.analytics}/api/analytics/indices`, { timeout: 8000 }).then(r => r.data)
  ]);

  const durationMs = Date.now() - enrichStart;
  res.json({
    incident,
    relatedDispatches: dispatches,
    externalContext: externalData,
    topologyImpact: topoResult.status === 'fulfilled' ? topoResult.value : null,
    analytics: analyticsResult.status === 'fulfilled' ? analyticsResult.value : null,
    enrichmentDurationMs: durationMs
  });
});

// Analytics correlation: external → incidents → telemetry → analytics (full sequential chain)
app.get('/api/analytics/correlation', async (req, res) => {
  const corrStart = Date.now();
  logger.info('GET /api/analytics/correlation - full sequential correlation chain');

  const externalData = await axios.get(`${SERVICE_URLS.external}/api/external/conditions`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  const incidents = await axios.get(`${SERVICE_URLS.primary}/api/incidents/active`, { timeout: 8000 })
    .then(r => r.data).catch(() => []);

  const telemetryAlerts = await axios.get(`${SERVICE_URLS.telemetry}/api/telemetry/alerts/active`, { timeout: 8000 })
    .then(r => r.data).catch(() => []);

  const analytics = await axios.get(`${SERVICE_URLS.analytics}/api/analytics/indices`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  const forecast = await axios.get(`${SERVICE_URLS.forecast}/api/forecasts/current`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  const durationMs = Date.now() - corrStart;
  res.json({
    externalData,
    activeIncidents: incidents,
    telemetryAlerts,
    analytics,
    forecast,
    correlationDurationMs: durationMs
  });
});

// Operational readiness: topology → teams → dispatches → notifications + forecast (mixed pattern)
app.get('/api/operations/readiness', async (req, res) => {
  const readStart = Date.now();
  logger.info('GET /api/operations/readiness - mixed sequential + parallel operations');

  // Step 1: Topology baseline (sequential)
  const topology = await axios.get(`${SERVICE_URLS.topology}/api/topology/hierarchy`, { timeout: 8000 })
    .then(r => r.data).catch(() => null);

  // Step 2: Teams + external data (parallel)
  const [teamsResult, externalResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.dispatch}/api/dispatch/teams`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.external}/api/external/conditions`, { timeout: 8000 }).then(r => r.data)
  ]);

  // Step 3: Active dispatches (sequential, depends on teams)
  const dispatches = await axios.get(`${SERVICE_URLS.dispatch}/api/dispatch/active`, { timeout: 8000 })
    .then(r => r.data).catch(() => []);

  // Step 4: Notifications + Forecast (parallel)
  const [notifResult, forecastResult] = await Promise.allSettled([
    axios.get(`${SERVICE_URLS.notification}/api/notifications/log`, { timeout: 8000 }).then(r => r.data),
    axios.get(`${SERVICE_URLS.forecast}/api/forecasts/current`, { timeout: 8000 }).then(r => r.data)
  ]);

  const durationMs = Date.now() - readStart;
  res.json({
    topology,
    teams: teamsResult.status === 'fulfilled' ? teamsResult.value : null,
    externalData: externalResult.status === 'fulfilled' ? externalResult.value : null,
    activeDispatches: dispatches,
    recentNotifications: notifResult.status === 'fulfilled' ? notifResult.value : null,
    forecast: forecastResult.status === 'fulfilled' ? forecastResult.value : null,
    readinessDurationMs: durationMs
  });
});

// ============================================================
// Health check — queries all services
// ============================================================
app.get('/api/health', async (req, res) => {
  const checks = Object.entries(SERVICE_URLS).map(([name, url]) => ({
    name, url: `${url}/api/${name === 'primary' ? 'incidents' : name === 'secondary' ? 'readings' : name}/health`
  }));
  const results = await Promise.all(checks.map(async c => {
    try {
      const { data } = await axios.get(c.url, { timeout: 3000 });
      return { ...c, status: 'Healthy', details: data };
    } catch (err) {
      return { ...c, status: 'Unhealthy', error: err.message };
    }
  }));
  const allHealthy = results.every(r => r.status === 'Healthy');
  res.status(allHealthy ? 200 : 207).json({
    status: allHealthy ? 'Healthy' : 'Degraded',
    service: 'api-gateway',
    services: results
  });
});

// ============================================================
// HTTP + WebSocket Server
// ============================================================
const port = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// WebSocket: broadcast live events to all connected UI clients
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  logger.info('WebSocket client connected', { total: wsClients.size });
  ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  ws.on('close', () => { wsClients.delete(ws); });
});

function broadcastEvent(event) {
  const msg = JSON.stringify(event);
  wsClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

// Periodic live event broadcaster — sends simulated events every 10s
setInterval(() => {
  if (wsClients.size === 0) return;
  const eventTypes = ['incident_detected', 'telemetry_alert', 'work_dispatched', 'external_warning', 'work_order_created', 'reading_anomaly', 'pricing_update'];
  const regions = ['region-1', 'region-2', 'region-3', 'region-4', 'region-5'];
  const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  broadcastEvent({
    type,
    region: regions[Math.floor(Math.random() * regions.length)],
    severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
    message: `Live event: ${type.replace(/_/g, ' ')}`,
    timestamp: new Date().toISOString()
  });
}, 10000);

server.listen(port, () => {
  logger.info(`API Gateway v2.0 running on port ${port} (HTTP + WebSocket)`);

  // Periodic simulation trigger
  const SIMULATE_INTERVAL = parseInt(process.env.SIMULATE_INTERVAL || '15000');
  setTimeout(() => {
    logger.info(`Starting simulation orchestrator (interval: ${SIMULATE_INTERVAL}ms)`);
    setInterval(() => {
      axios.post(`http://localhost:${port}/api/simulate/cycle`, {}, { timeout: 30000 })
        .then(r => logger.info('Simulation cycle triggered', { durationMs: r.data.durationMs }))
        .catch(err => logger.warn('Simulation cycle failed', { error: err.message }));
    }, SIMULATE_INTERVAL);
  }, 30000);
});
