# Agent Instructions — Generic App Customization

You are an AI agent tasked with customizing this generic multi-industry platform for a specific industry. Follow these instructions precisely.

## Input

Read `industry.yaml` in the repository root. It defines:
- The target **industry** (e.g., utility, healthcare, retail, logistics)
- **entities** — the domain data models
- **services** — mapping of generic service names → industry-specific names + descriptions
- **ui_tabs** — the tabs to show in the web UI
- **kpis** — key performance indicators to display on dashboards
- **roles** — user roles for the auth system
- **regions** — geographic regions for the business
- **fault_scenarios** — fault injection scenarios for resilience testing

## Mutation Workflow

### Step 1: Read Configuration
```
Read industry.yaml → extract all configuration
Read _meta/profiles/{industry}.yaml if it exists → use as reference
```

### Step 2: Rename Services
For each entry in `services`:
1. Rename the folder under `services/` from the generic name to the `rename_to` value
2. Update all references in:
   - `gateway/api-gateway/server.js` (proxy routes)
   - `k8s/all-in-one.yaml` (deployments, services, labels)
   - `load-generator/locustfile.py` (API endpoints)
   - `scripts/build-all.sh` and `scripts/push-all.sh`
   - `ui/web-ui/src/App.jsx` (API calls, tab labels)

### Step 3: Customize Business Logic
For each service, update the source code:
1. Replace generic entity names with domain-specific entities from `entities`
2. Update database table names (TimescaleDB schemas)
3. Update Kafka topic names
4. Update RabbitMQ queue names
5. Update REST endpoint paths
6. Add domain-specific validation logic
7. Add realistic sample/seed data generation

### Step 4: Customize the UI
In `ui/web-ui/src/App.jsx`:
1. Replace tab labels with values from `ui_tabs`
2. Update the app title to match `display_name`
3. Update KPI dashboard cards with values from `kpis`
4. Update data table columns to match entity fields
5. Update chart labels and data sources

### Step 5: Customize the Load Generator
In `load-generator/locustfile.py`:
1. Update endpoint URLs to match renamed services
2. Update request payloads to match domain entities
3. Update user behavior profiles to match `roles`

### Step 6: Update K8s Manifests
In `k8s/all-in-one.yaml`:
1. Replace all generic service names with `rename_to` values
2. Update environment variables for domain-specific config
3. Update init-db SQL scripts with domain-specific table schemas

### Step 7: Update Documentation
1. Update `README.md` with industry-specific descriptions
2. Update the architecture diagram service names
3. Update the services table

## File-by-File Reference

### Services Directory Structure
```
services/
  {service-name}/
    Dockerfile           # Usually no changes needed
    {source-files}       # Customize business logic here
```

### Key Files to Modify
| File | What to Change |
|------|---------------|
| `industry.yaml` | Source of truth — already set by user |
| `gateway/api-gateway/server.js` | Route names, proxy targets |
| `ui/web-ui/src/App.jsx` | Tab names, API endpoints, KPI cards |
| `k8s/all-in-one.yaml` | Service names, env vars, init SQL |
| `load-generator/locustfile.py` | Endpoints, payloads, user profiles |
| `scripts/build-all.sh` | Image names |
| `scripts/push-all.sh` | Image names |
| `README.md` | Project description, service table |

### Service → Language Map (Do NOT change languages)
| Generic Name | Language | Rename Via |
|---|---|---|
| primary-service | Node.js | `services.primary-service.rename_to` |
| secondary-service | Node.js | `services.secondary-service.rename_to` |
| telemetry-service | .NET 6 | `services.telemetry-service.rename_to` |
| data-ingestion-service | Java 17 | `services.data-ingestion-service.rename_to` |
| topology-service | Python 3.11 | `services.topology-service.rename_to` |
| analytics-service | Go 1.22 | `services.analytics-service.rename_to` |
| forecast-service | Ruby 3.2 | `services.forecast-service.rename_to` |
| dispatch-service | Kotlin | `services.dispatch-service.rename_to` |
| notification-service | PHP 8.2 | `services.notification-service.rename_to` |
| external-data-service | Elixir 1.16 | `services.external-data-service.rename_to` |
| aggregator-service | Rust 1.75 | `services.aggregator-service.rename_to` |
| auth-service | Ruby 3.2 | — (keep name) |
| audit-service | Go 1.22 | — (keep name) |
| pricing-service | Python 3.11 | `services.pricing-service.rename_to` |
| work-order-service | Java 17 | `services.work-order-service.rename_to` |
| correlation-service | .NET 6 | `services.correlation-service.rename_to` |

### Infrastructure (Do NOT modify)
These services remain constant across all industries:
- TimescaleDB (PostgreSQL 15) — port 5432
- Redis 7 — port 6379
- Kafka (KRaft mode) — port 9092
- RabbitMQ 3.13 — port 5672

### Database Schema Convention
Each service that uses TimescaleDB should create its tables in the `public` schema. Table names should match the entity names from `industry.yaml`. Use `created_at TIMESTAMPTZ` as the time column for hypertables.

### Kafka Topic Convention
Topic names follow: `{industry}.{entity}.{event}` (e.g., `utility.outage.created`, `healthcare.patient.admitted`)

### RabbitMQ Queue Convention
Queue names follow: `{service-name}.tasks` (e.g., `dispatch-service.tasks`)

## Validation Checklist

After customization, verify:
- [ ] All services build with `./scripts/build-all.sh`
- [ ] `k8s/all-in-one.yaml` has no references to generic service names
- [ ] Gateway routes match actual service names
- [ ] UI tabs match `ui_tabs` from `industry.yaml`
- [ ] Load generator hits the correct endpoints
- [ ] README reflects the customized industry

## Example: Customizing for "Utility"

```yaml
# industry.yaml
industry: utility
display_name: "Utility Management Platform"
services:
  primary-service:
    rename_to: outage-service
    description: "Tracks power outage events"
  secondary-service:
    rename_to: usage-service
    description: "Monitors energy consumption"
  ...
```

The agent would then:
1. `mv services/primary-service services/outage-service`
2. Update `server.js` in outage-service with outage-specific endpoints
3. Update gateway routes: `/api/outages` → `outage-service:3001`
4. Update K8s manifest: deployment name `outage-service`, service name `outage-service`
5. Update UI: "Outages" tab calling `/api/outages`
6. Update load-generator: `GET /api/outages`, `POST /api/outages` with realistic payloads
