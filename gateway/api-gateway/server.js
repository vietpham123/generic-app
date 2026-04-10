const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

// ============================================================
// Dynatrace Business Events Integration
// Sends CloudEvents to the Dynatrace Biz Events Ingest API
// ============================================================
const DT_TENANT_URL = process.env.DT_TENANT_URL || '';
const DT_BIZEVENT_TOKEN = process.env.DT_BIZEVENT_TOKEN || '';
const DT_BIZEVENT_ENABLED = !!(DT_TENANT_URL && DT_BIZEVENT_TOKEN);
const EVENT_PROVIDER = process.env.EVENT_PROVIDER || 'genericapp.event.provider';

if (DT_BIZEVENT_ENABLED) {
  console.log('Dynatrace Business Events ENABLED', DT_TENANT_URL);
} else {
  console.log('Dynatrace Business Events DISABLED (set DT_TENANT_URL and DT_BIZEVENT_TOKEN to enable)');
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
  } catch (err) {
    console.warn('BizEvent send failed:', eventType, err.message);
  }
}

function sendBizEvents(events) {
  if (!DT_BIZEVENT_ENABLED) return;
  events.forEach(e => sendBizEvent(e.type, e.data));
}

app.use(express.json());

// =========================================================
// AGENT: Update service names and ports after industry rename
// =========================================================
// Each route proxies to the corresponding microservice.
// Service names must match K8s service DNS names.

const routes = [
  // primary-service (Node.js:3001)
  { path: '/api/incidents',      target: 'http://primary-service:3001' },
  // secondary-service (Node.js:3002)
  { path: '/api/readings',       target: 'http://secondary-service:3002' },
  // telemetry-service (.NET:5001)
  { path: '/api/telemetry',      target: 'http://telemetry-service:5001' },
  // data-ingestion-service (Java:8081)
  { path: '/api/ingestion',      target: 'http://data-ingestion-service:8081' },
  // topology-service (Python:5002)
  { path: '/api/topology',       target: 'http://topology-service:5002' },
  // analytics-service (Go:8082)
  { path: '/api/analytics',      target: 'http://analytics-service:8082' },
  // forecast-service (Ruby:4567)
  { path: '/api/forecasts',      target: 'http://forecast-service:4567' },
  // dispatch-service (Kotlin:8083)
  { path: '/api/dispatch',       target: 'http://dispatch-service:8083' },
  // notification-service (PHP:8080)
  { path: '/api/notifications',  target: 'http://notification-service:8080' },
  // external-data-service (Elixir:4000)
  { path: '/api/external',       target: 'http://external-data-service:4000' },
  // aggregator-service (Rust:8084)
  { path: '/api/aggregation',    target: 'http://aggregator-service:8084' },
  // auth-service (Ruby:4568)
  { path: '/api/auth',           target: 'http://auth-service:4568' },
  // audit-service (Go:8085)
  { path: '/api/audit',          target: 'http://audit-service:8085' },
  // pricing-service (Python:5003)
  { path: '/api/pricing',        target: 'http://pricing-service:5003' },
  // work-order-service (Java:8086)
  { path: '/api/work-orders',    target: 'http://work-order-service:8086' },
  // correlation-service (.NET:5004)
  { path: '/api/correlation',    target: 'http://correlation-service:5004' },
];

// Register proxy routes
routes.forEach(({ path, target }) => {
  app.use(path, createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (reqPath) => reqPath, // preserve full path
    onError: (err, req, res) => {
      console.error(`Proxy error for ${path}: ${err.message}`);
      res.status(502).json({ error: `Service unavailable: ${path}`, detail: err.message });
    },
  }));
});

// Gateway health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', routes: routes.length });
});

// Service discovery endpoint (used by UI to know available services)
app.get('/api/services', (req, res) => {
  res.json(routes.map(r => ({ path: r.path, target: r.target })));
});

// Simulation: trigger data generation across all services
app.post('/api/simulate/cycle', async (req, res) => {
  const http = require('http');
  const results = {};

  const simulateEndpoints = [
    { name: 'incidents', url: 'http://primary-service:3001/api/incidents/simulate' },
    { name: 'readings', url: 'http://secondary-service:3002/api/readings/simulate' },
    { name: 'topology', url: 'http://topology-service:5002/api/topology/simulate' },
    { name: 'forecasts', url: 'http://forecast-service:4567/api/forecasts/generate' },
    { name: 'notifications', url: 'http://notification-service:8080/api/notifications/simulate' },
    { name: 'pricing', url: 'http://pricing-service:5003/api/pricing/simulate' },
  ];

  for (const ep of simulateEndpoints) {
    try {
      const response = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5 }),
      });
      results[ep.name] = { status: response.status };
    } catch (err) {
      results[ep.name] = { error: err.message };
    }
  }

  res.json({ simulation: 'complete', results });
});

// ============================================================
// Automatic Simulation Loop — fires every 15 seconds
// Generates business events per cycle (industry-agnostic)
// ============================================================
const SIMULATE_INTERVAL = parseInt(process.env.SIMULATE_INTERVAL || '15000', 10);

async function runSimulationCycle() {
  const cycleStart = Date.now();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rng = () => Math.random();
  const bizEvents = [];

  const units = ['Unit-A', 'Unit-B', 'Unit-C'];
  const regions = ['Region-North', 'Region-South', 'Region-East', 'Region-West'];
  const categories = ['category-1', 'category-2', 'category-3', 'category-4', 'category-5'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const channels = ['web', 'api', 'mobile', 'batch'];

  // 1. Incident created event
  const incidentId = `INC-${Date.now()}-${Math.floor(rng() * 9000 + 1000)}`;
  bizEvents.push({ type: 'incident.created', data: {
    'event.provider': EVENT_PROVIDER,
    'incident.id': incidentId,
    unit: pick(units),
    region: pick(regions),
    priority: pick(priorities),
    category: pick(categories),
    'items.affected': Math.floor(rng() * 50) + 1,
    channel: pick(channels),
    timestamp: new Date().toISOString()
  }});

  // 2. Reading recorded event
  const readingId = `RDG-${pick(['A', 'B', 'C'])}-${String(Math.floor(rng() * 999) + 1).padStart(3, '0')}`;
  bizEvents.push({ type: 'reading.recorded', data: {
    'event.provider': EVENT_PROVIDER,
    'reading.id': readingId,
    unit: pick(units),
    region: pick(regions),
    'value.primary': Math.round(rng() * 1000 * 100) / 100,
    'value.secondary': Math.round(rng() * 500 * 100) / 100,
    'quality.score': Math.round((rng() * 0.3 + 0.7) * 1000) / 1000,
    timestamp: new Date().toISOString()
  }});

  // 3. Telemetry event
  bizEvents.push({ type: 'telemetry.received', data: {
    'event.provider': EVENT_PROVIDER,
    'device.id': `DEV-${pick(units).replace('Unit-', '')}-${Math.floor(rng() * 100) + 1}`,
    unit: pick(units),
    metric: pick(['throughput', 'latency', 'error_rate', 'utilization', 'queue_depth']),
    value: Math.round(rng() * 100 * 100) / 100,
    timestamp: new Date().toISOString()
  }});

  // 4. Data ingestion event
  bizEvents.push({ type: 'data.ingested', data: {
    'event.provider': EVENT_PROVIDER,
    'source.id': `SRC-${String(Math.floor(rng() * 999) + 1).padStart(3, '0')}`,
    category: pick(categories),
    'records.processed': Math.floor(rng() * 500 + 10),
    'records.rejected': Math.floor(rng() * 10),
    'processing.ms': Math.floor(rng() * 2000 + 50),
    timestamp: new Date().toISOString()
  }});

  // 5. Forecast generated event
  bizEvents.push({ type: 'forecast.generated', data: {
    'event.provider': EVENT_PROVIDER,
    unit: pick(units),
    category: pick(categories),
    'predicted.value': Math.round(rng() * 500 * 100) / 100,
    confidence: Math.round((rng() * 0.3 + 0.7) * 1000) / 1000,
    'horizon.hours': pick([1, 6, 12, 24, 48]),
    timestamp: new Date().toISOString()
  }});

  // 6. Dispatch event
  bizEvents.push({ type: 'work.dispatched', data: {
    'event.provider': EVENT_PROVIDER,
    'dispatch.id': `DSP-${Date.now()}`,
    'incident.id': incidentId,
    assignee: pick(['operator_a', 'operator_b', 'operator_c', 'team_east', 'team_west']),
    priority: pick(priorities),
    status: pick(['assigned', 'in_progress', 'completed', 'deferred']),
    'eta.minutes': Math.floor(rng() * 120) + 5,
    timestamp: new Date().toISOString()
  }});

  // 7. Notification sent event
  bizEvents.push({ type: 'notification.sent', data: {
    'event.provider': EVENT_PROVIDER,
    channel: pick(['email', 'sms', 'push', 'webhook']),
    subject: pick(['Incident Update', 'Threshold Alert', 'Status Change', 'Resolution Notice', 'Scheduled Maintenance']),
    'delivery.status': rng() > 0.1 ? 'delivered' : 'failed',
    unit: pick(units),
    timestamp: new Date().toISOString()
  }});

  // 8. Pricing/cost event
  bizEvents.push({ type: 'pricing.calculated', data: {
    'event.provider': EVENT_PROVIDER,
    category: pick(categories),
    unit: pick(units),
    'cost.base': Math.round((rng() * 100 + 10) * 100) / 100,
    'cost.adjusted': Math.round((rng() * 100 + 8) * 100) / 100,
    'adjustment.reason': pick(['volume_discount', 'peak_surcharge', 'promotional', 'contract_rate', 'spot_rate']),
    timestamp: new Date().toISOString()
  }});

  // 9. Correlation/anomaly event
  if (rng() > 0.5) {
    bizEvents.push({ type: 'anomaly.detected', data: {
      'event.provider': EVENT_PROVIDER,
      'anomaly.id': `ANM-${Date.now()}`,
      unit: pick(units),
      region: pick(regions),
      'risk.score': Math.round(rng() * 100),
      'anomaly.type': pick(['threshold_breach', 'pattern_deviation', 'rate_change', 'correlation_break']),
      severity: pick(['low', 'medium', 'high']),
      timestamp: new Date().toISOString()
    }});
  }

  // 10. Audit event
  bizEvents.push({ type: 'audit.logged', data: {
    'event.provider': EVENT_PROVIDER,
    actor: pick(['admin_1', 'operator_a', 'operator_b', 'operator_c', 'system']),
    action: pick(['login', 'create', 'update', 'delete', 'approve', 'export']),
    'resource.type': pick(['incident', 'reading', 'dispatch', 'forecast', 'pricing']),
    'resource.id': `RES-${Math.floor(rng() * 90000 + 10000)}`,
    timestamp: new Date().toISOString()
  }});

  // 11. Work order completed event
  bizEvents.push({ type: 'work.order.completed', data: {
    'event.provider': EVENT_PROVIDER,
    'work.order.id': `WO-${Date.now()}`,
    unit: pick(units),
    assignee: pick(['operator_a', 'operator_b', 'operator_c']),
    priority: pick(priorities),
    'duration.minutes': Math.floor(rng() * 180) + 10,
    'work.type': pick(['maintenance', 'inspection', 'repair', 'upgrade', 'calibration']),
    timestamp: new Date().toISOString()
  }});

  sendBizEvents(bizEvents);

  const durationMs = Date.now() - cycleStart;
  console.log(`Simulation cycle complete: ${bizEvents.length} bizevents, ${durationMs}ms`);
}

if (DT_BIZEVENT_ENABLED) {
  setInterval(runSimulationCycle, SIMULATE_INTERVAL);
  console.log(`Auto-simulation enabled: every ${SIMULATE_INTERVAL}ms`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`api-gateway listening on port ${PORT}`);
  console.log(`Registered ${routes.length} proxy routes`);
});
