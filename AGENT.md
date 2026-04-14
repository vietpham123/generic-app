# Agent Instructions — Generic App Customization

You are an AI agent tasked with customizing this generic multi-industry platform for a specific industry. This platform is a polyglot microservices observability demo with 16 backend services across 10 programming languages, a React web UI, API gateway with fault injection and multi-wave simulation, and Kubernetes deployment — all pre-integrated with Dynatrace.

## Reference Implementation

The **Utility Outage Analytics** app (in the `_meta/profiles/utility.yaml` profile) is the canonical reference implementation. It demonstrates how a fully customized industry deployment should look:

- **16 services** renamed: `outage-service`, `usage-service`, `scada-service`, `meter-data-service`, `grid-topology-service`, `reliability-service`, `demand-forecast-service`, `crew-dispatch-service`, `notification-service`, `weather-service`, `aggregator-service`, `customer-service`, `audit-service`, `pricing-service`, `work-order-service`, `alert-correlation-service`
- **70+ gateway routes** with domain-specific endpoints (e.g., `/api/outages/active`, `/api/scada/readings/latest`, `/api/grid/topology`)
- **18 UI sections** including maps, SCADA telemetry, reliability indices (SAIDI/SAIFI/CAIDI), crew dispatch, weather correlation
- **15 demo personas** (operator, engineer, manager, analyst, dispatcher, supervisor, technician, director) with weighted role-based journeys
- **Rich business events** (20+ types per simulation cycle) covering outage detection, meter readings, SCADA telemetry, weather correlation, crew dispatch, reliability metrics
- **Fault injection scenarios** simulating database outage, cascade failure, resource exhaustion, network partition
- **5-wave simulation pipeline** creating deep distributed traces in Dynatrace

## Input

Read `industry.yaml` in the repository root. It defines:

| Field | Purpose |
|-------|---------|
| `industry` | Target industry identifier (e.g., `utility`, `healthcare`, `retail`) |
| `display_name` | Human-readable name for the UI title bar |
| `entities` | Domain data models with table schemas, field definitions, Kafka topics |
| `services` | Generic → industry service name mappings (rename_to, description, entities) |
| `ui_tabs` | Tabs to render in the web UI with icons and API endpoints |
| `kpis` | Key performance indicator cards for the dashboard |
| `roles` | User roles for the auth system |
| `regions` | Geographic/logical regions for the business |
| `fault_scenarios` | Fault injection scenarios for resilience testing |
| `demo_users` | Pre-seeded demo user accounts with role assignments |
| `demo_password` | Shared password for all demo accounts |

See `_meta/schema.md` for detailed field documentation. Reference profiles are in `_meta/profiles/`.

## Mutation Workflow

### Step 1: Read Configuration

```
Read industry.yaml → extract all configuration
Read _meta/profiles/{industry}.yaml if it exists → use as detailed reference
Read _meta/schema.md → understand field constraints
```

### Step 2: Rename Services

For each entry in `services` where `rename_to` differs from the generic name:

1. Rename the folder under `services/` from the generic name to the `rename_to` value
2. Update all references in every file listed in the File-by-File Reference below

### Step 3: Customize Business Logic

For each service, update the main source file:

1. Replace generic entity names (incident, reading, asset) with domain-specific entities from `entities`
2. Update database table names to match `entities[].table`
3. Update Kafka topic names to match `entities[].kafka_topic`
4. Update RabbitMQ queue names to `{service-name}.tasks`
5. Update REST endpoint paths to match the industry terminology
6. Add domain-specific validation logic (e.g., voltage ranges for utility, dosage limits for healthcare)
7. Update sample/seed data generation to produce realistic industry data
8. Ensure each service's `/simulate` endpoint generates domain-appropriate data

### Step 4: Customize the Gateway

In `gateway/api-gateway/server.js`:

1. Update `SERVICE_URLS` to match renamed service K8s DNS names and ports
2. Update all route registrations (`app.get`, `app.post`) to use industry-specific paths
3. Update the fault injection `FAULT_SCENARIOS` to use industry-relevant descriptions and affected services
4. Update the multi-wave simulation pipeline endpoints to call the correct renamed services
5. Update the `/api/dashboard` aggregation endpoint to query the correct service endpoints
6. Update the enriched endpoints (`/api/incidents/:id/enriched`, `/api/analytics/correlation`, `/api/operations/readiness`) to chain the correct services
7. Update the `/api/search` global search endpoint to query the relevant services
8. Update all business event types and data fields to match industry terminology
9. Update the WebSocket live event broadcaster event types
10. Update `EVENT_PROVIDER` to match the industry (e.g., `utility.event.provider`)

### Step 5: Customize the UI

In `ui/web-ui/src/App.jsx`:

1. Update `APP_TITLE` to match `display_name`
2. Update `TAB_CONFIG` to match `ui_tabs` (labels, endpoints)
3. Update `KPI_CONFIG` to match `kpis` (names, fields, formats, colors)
4. Update the login flow if needed (password from `demo_password`)
5. Add industry-specific UI features (maps, charts, domain visualizations)

### Step 6: Customize the Browser Traffic Generator

In `browser-traffic-generator/generator.js`:

1. Update `PERSONAS` to match `demo_users` with appropriate roles, regions, and journey assignments
2. Update `JOURNEYS` to navigate industry-specific tabs (use `idx` matching the updated `TAB_CONFIG` order)
3. Update `DEPARTMENTS`, `SHIFTS` for the industry
4. Update `LOGIN_PASSWORD` if `demo_password` differs
5. Add industry-specific journey types (e.g., for utility: `storm_response`, `outage_triage`, `scada_investigation`)

### Step 7: Customize the Load Generator

In `load-generator/locustfile.py`:

1. Update `DEMO_USERNAMES` to match `demo_users` usernames
2. Update `DEMO_PASSWORD` to match `demo_password`
3. Update `SEARCH_TERMS` with industry-relevant terms
4. Update all `_nav_*` methods to call the renamed service endpoints with industry-specific paths
5. Update POST payloads in navigation methods to match domain entities
6. Ensure each nav method fires the same API calls the browser UI would make

### Step 8: Update K8s Manifests

In `k8s/all-in-one.yaml`:

1. Replace all generic service names in Deployment and Service resources with `rename_to` values
2. Update the `app-config` ConfigMap with industry-specific env vars
3. Update init-db SQL scripts to create domain-specific table schemas matching `entities`
4. Update image names in container specs

In `k8s/infrastructure.yaml`:
- No changes needed (TimescaleDB, Redis, Kafka, RabbitMQ stay the same)

### Step 9: Update Scripts

In `scripts/build-all.sh` and `scripts/push-all.sh`:
- Update the `SERVICES`/`IMAGES` arrays with renamed service directory names

In `scripts/deploy.sh`:
- Update any service-specific configuration

### Step 10: Update Documentation

1. Update `README.md`:
   - Project title and description
   - Architecture diagram service names
   - Services table with renamed services
   - Any industry-specific deployment notes

2. Ensure `industry.yaml` remains the single source of truth

## File-by-File Reference

### Key Files to Modify

| File | What to Change |
|------|---------------|
| `industry.yaml` | Source of truth — set by user before running agent |
| `gateway/api-gateway/server.js` | SERVICE_URLS, route paths, fault scenarios, simulation pipeline, dashboard aggregation, enriched endpoints, business events, search, WebSocket events |
| `gateway/api-gateway/package.json` | No changes needed (deps: axios, express, cors, ws) |
| `ui/web-ui/src/App.jsx` | APP_TITLE, TAB_CONFIG, KPI_CONFIG, login password |
| `k8s/all-in-one.yaml` | Service/Deployment names, ConfigMap, init SQL, image names |
| `load-generator/locustfile.py` | DEMO_USERNAMES, DEMO_PASSWORD, SEARCH_TERMS, all _nav_* methods, API paths |
| `browser-traffic-generator/generator.js` | PERSONAS, JOURNEYS, DEPARTMENTS, LOGIN_PASSWORD |
| `scripts/build-all.sh` | SERVICES array |
| `scripts/push-all.sh` | IMAGES array |
| `scripts/deploy.sh` | Service-specific config |
| `README.md` | Project title, description, architecture, service table |

### Service → Language Map (DO NOT change languages or ports)

| Generic Name | Language | Port | Rename Via |
|---|---|---|---|
| primary-service | Node.js | 3001 | `services.primary-service.rename_to` |
| secondary-service | Node.js | 3002 | `services.secondary-service.rename_to` |
| telemetry-service | .NET 6 | 5001 | `services.telemetry-service.rename_to` |
| data-ingestion-service | Java 17 | 8081 | `services.data-ingestion-service.rename_to` |
| topology-service | Python 3.11 | 5002 | `services.topology-service.rename_to` |
| analytics-service | Go 1.22 | 8082 | `services.analytics-service.rename_to` |
| forecast-service | Ruby 3.2 | 4567 | `services.forecast-service.rename_to` |
| dispatch-service | Kotlin | 8083 | `services.dispatch-service.rename_to` |
| notification-service | PHP 8.2 | 8080 | `services.notification-service.rename_to` |
| external-data-service | Elixir 1.16 | 4000 | `services.external-data-service.rename_to` |
| aggregator-service | Rust 1.75 | 8084 | `services.aggregator-service.rename_to` |
| auth-service | Ruby 3.2 | 4568 | — (keep name) |
| audit-service | Go 1.22 | 8085 | — (keep name) |
| pricing-service | Python 3.11 | 5003 | `services.pricing-service.rename_to` |
| work-order-service | Java 17 | 8086 | `services.work-order-service.rename_to` |
| correlation-service | .NET 6 | 5004 | `services.correlation-service.rename_to` |

### Infrastructure (DO NOT modify)

These remain constant across all industries:
- **TimescaleDB** (PostgreSQL 15) — port 5432 — time-series data with hypertables
- **Redis 7** — port 6379 — caching and pub/sub
- **Kafka** (KRaft mode) — port 9092 — event streaming
- **RabbitMQ 3.13** — port 5672 — task queuing

### Gateway Features (all must be preserved during customization)

| Feature | Location in server.js | What to customize |
|---------|----------------------|-------------------|
| Structured logging | `logger.*` calls | No changes needed |
| Fault injection | `FAULT_SCENARIOS`, `/api/fault/*` | Update scenario names, descriptions, affected services |
| Request logging middleware | `app.use((req, res, next) => ...)` | No changes needed |
| Sporadic gateway timeout | `Math.random() < 0.02` block | No changes needed |
| Proxy helper | `function proxy(targetUrl)` | No changes needed |
| Route registration | `app.get/post('/api/...')` | Update paths and service URLs |
| Global search | `GET /api/search` | Update services queried and response fields |
| Multi-wave simulation | `POST /api/simulate/cycle` | Update service URLs and endpoint paths |
| Aggregated dashboard | `GET /api/dashboard` | Update service URLs and endpoint paths |
| Enriched endpoints | `GET /api/incidents/:id/enriched`, etc. | Update service URLs and chaining logic |
| Business events | `sendBizEvents(bizEvents)` | Update event types, field names, domain values |
| WebSocket broadcast | `broadcastEvent(...)` | Update event types |
| Health check | `GET /api/health` | Update service URL list |
| Service discovery | `GET /api/services` | Auto-populated from SERVICE_URLS |

### Database Schema Convention

- Each service creates its tables in the `public` schema
- Table names match `entities[].table` from `industry.yaml`
- Time columns use `created_at TIMESTAMPTZ` for hypertables
- Use `SELECT create_hypertable(...)` for time-series tables

### Kafka Topic Convention

Topic names: `{industry}.{entity}.{event}` (e.g., `utility.outage.created`, `healthcare.patient.admitted`)

### RabbitMQ Queue Convention

Queue names: `{service-name}.tasks` (e.g., `crew-dispatch-service.tasks`)

## Validation Checklist

After customization, verify:

- [ ] All services build with `./scripts/build-all.sh`
- [ ] `k8s/all-in-one.yaml` has no references to generic service names
- [ ] Gateway SERVICE_URLS match actual K8s service DNS names
- [ ] Gateway routes match renamed service endpoints
- [ ] Fault injection scenarios reference correct service names
- [ ] Simulation pipeline calls correct service endpoints
- [ ] Dashboard aggregation queries correct service endpoints
- [ ] Enriched endpoints chain correct services
- [ ] Global search queries correct services
- [ ] Business event types use industry terminology
- [ ] UI APP_TITLE matches `display_name`
- [ ] UI TAB_CONFIG matches `ui_tabs`
- [ ] UI KPI_CONFIG matches `kpis`
- [ ] Browser traffic generator PERSONAS match `demo_users`
- [ ] Browser traffic generator JOURNEYS navigate correct tabs
- [ ] Load generator endpoints match gateway routes
- [ ] README reflects the customized industry

## Example: Customizing for "Utility"

Given `_meta/profiles/utility.yaml`, the agent would:

1. **Rename services**: `primary-service` → `outage-service`, `secondary-service` → `usage-service`, `telemetry-service` → `scada-service`, etc.
2. **Update gateway**: Change `SERVICE_URLS.primary` to `http://outage-service:3001`, add routes like `/api/outages/active`, `/api/scada/readings/latest`, `/api/grid/topology`, `/api/reliability/indices`
3. **Update fault scenarios**: "TimescaleDB connection pool exhausted — outage + usage + reliability services fail"
4. **Update simulation**: Wave 1 triggers SCADA + Weather simulation, Wave 3 triggers Outage + Usage + Forecast + Meter data
5. **Update business events**: `outage.detected`, `scada.telemetry.received`, `weather.correlation.completed`, `reliability.calculated`, `crew.dispatched`
6. **Update UI**: Tabs for "Outages", "SCADA", "Grid Topology", "Reliability", "Crew Dispatch", "Weather"; KPIs for "Active Outages", "Customers Affected", "Grid Uptime", "SAIDI"
7. **Update browser generator**: Personas like `operator_jones`, `engineer_chen`, `dispatcher_lee` with journeys like `storm_response`, `outage_triage`, `scada_investigation`
8. **Update load generator**: Nav methods calling `/api/outages`, `/api/scada/summary`, `/api/grid/stats`, `/api/reliability/indices`
9. **Update K8s**: All deployment names, service names, ConfigMap values for utility domain
