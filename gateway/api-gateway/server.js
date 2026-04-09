const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`api-gateway listening on port ${PORT}`);
  console.log(`Registered ${routes.length} proxy routes`);
});
