# Generic Multi-Industry Platform

A polyglot microservices platform template designed to be rapidly customized for **any industry** by an AI agent or human developer. Ships with 20 services across 10 programming languages, backed by production-grade infrastructure.

## Quick Start

1. **Choose your industry** — Edit `industry.yaml` and set the `industry` field
2. **Run the AI agent** — Point an agent at `AGENT.md` to auto-customize the entire codebase
3. **Build & Deploy** — Use the provided scripts to build, push, and deploy to Kubernetes

```bash
# Build all images
./scripts/build-all.sh <your-registry>

# Push to registry
./scripts/push-all.sh <your-registry>

# Deploy to Kubernetes
./scripts/deploy.sh <your-namespace> <your-registry>
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (React)                           │
│                     Port 80 / Nginx                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    API Gateway (Node.js)                         │
│                     Port 3000                                    │
│    Routes all /api/* traffic to backend microservices            │
└──┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬──┘
   │   │   │   │   │   │   │   │   │   │   │   │   │   │   │
   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Microservices                         │
│                                                                 │
│  primary-service ···········  Node.js    (port 3001)            │
│  secondary-service ·········  Node.js    (port 3002)            │
│  telemetry-service ·········  .NET 6     (port 5001)            │
│  data-ingestion-service ····  Java 17    (port 8081)            │
│  topology-service ··········  Python 3.11(port 5002)            │
│  analytics-service ·········  Go 1.22    (port 8082)            │
│  forecast-service ··········  Ruby 3.2   (port 4567)            │
│  dispatch-service ··········  Kotlin     (port 8083)            │
│  notification-service ······  PHP 8.2    (port 8080)            │
│  external-data-service ·····  Elixir 1.16(port 4000)            │
│  aggregator-service ·········  Rust 1.75  (port 8084)            │
│  auth-service ··············  Ruby 3.2   (port 4568)            │
│  audit-service ·············  Go 1.22    (port 8085)            │
│  pricing-service ···········  Python 3.11(port 5003)            │
│  work-order-service ·········  Java 17    (port 8086)            │
│  correlation-service ·······  .NET 6     (port 5004)            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                    Infrastructure Layer                          │
│                                                                 │
│  TimescaleDB (PostgreSQL 15) ·  Port 5432  ·  Time-series data  │
│  Redis 7 ····················  Port 6379  ·  Cache / pub-sub    │
│  Kafka (KRaft) ··············  Port 9092  ·  Event streaming    │
│  RabbitMQ 3.13 ··············  Port 5672  ·  Task queuing       │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer          | Technology                                                        |
|----------------|-------------------------------------------------------------------|
| **Languages**  | Node.js, .NET 6, Java 17, Python 3.11, Go 1.22, Ruby 3.2, Kotlin, PHP 8.2, Elixir 1.16, Rust 1.75 |
| **Frontend**   | React 18, Material UI, Recharts                                   |
| **Gateway**    | Express.js with http-proxy-middleware                             |
| **Databases**  | TimescaleDB (PostgreSQL 15)                                       |
| **Cache**      | Redis 7                                                           |
| **Messaging**  | Apache Kafka (KRaft mode), RabbitMQ 3.13                         |
| **Container**  | Docker, Kubernetes                                                |
| **Traffic**    | Locust (Python) load generator, Playwright (Chromium) browser traffic generator |

## Services Overview

| #  | Service                  | Language   | Purpose                           |
|----|--------------------------|------------|-----------------------------------|
| 1  | primary-service          | Node.js    | Core domain data management       |
| 2  | secondary-service        | Node.js    | Supporting domain operations      |
| 3  | telemetry-service        | .NET 6     | Sensor / telemetry ingestion      |
| 4  | data-ingestion-service   | Java 17    | Batch data processing             |
| 5  | topology-service         | Python     | Graph / topology modeling         |
| 6  | analytics-service        | Go         | Real-time analytics engine        |
| 7  | forecast-service         | Ruby       | Predictive modeling               |
| 8  | dispatch-service         | Kotlin     | Task assignment & scheduling      |
| 9  | notification-service     | PHP        | Multi-channel notifications       |
| 10 | external-data-service    | Elixir     | External API integration          |
| 11 | aggregator-service       | Rust       | High-perf data aggregation        |
| 12 | auth-service             | Ruby       | Authentication & user management  |
| 13 | audit-service            | Go         | Audit trail logging               |
| 14 | pricing-service          | Python     | Dynamic pricing engine            |
| 15 | work-order-service       | Java       | Work order lifecycle              |
| 16 | correlation-service      | .NET       | Event correlation & analysis      |
| 17 | api-gateway              | Node.js    | API routing & aggregation         |
| 18 | web-ui                   | React      | Single-page application           |
| 19 | load-generator           | Locust     | HTTP traffic simulation                |
| 20 | browser-traffic-gen      | Playwright | Real browser sessions for Dynatrace RUM |

## Customization

See [`AGENT.md`](AGENT.md) for full agent instructions. See [`industry.yaml`](industry.yaml) for the configuration file.

### Example Industry Profiles

Pre-built profiles are available in `_meta/profiles/`:
- **Utility** — Power grid, outages, meter data, SCADA
- **Healthcare** — Patients, appointments, lab results, prescriptions
- **Retail** — Products, orders, inventory, shipping
- **Logistics** — Shipments, routes, warehouses, fleet tracking

## Deployment

### Prerequisites
- Docker
- Kubernetes cluster (AKS, EKS, GKE, or local)
- Container registry access
- `kubectl` configured

### Deploy

```bash
# 1. Build all service images
./scripts/build-all.sh <your-registry>

# 2. Push to your container registry
./scripts/push-all.sh <your-registry>

# 3. Deploy to Kubernetes
./scripts/deploy.sh <your-namespace> <your-registry>

# 4. (Optional) Add TLS ingress
kubectl apply -f k8s/ingress.yaml
```

### Verify

```bash
kubectl get pods -n <your-namespace>
# All 24 pods should be Running (browser-traffic-gen starts at 0 replicas)
```

### Browser Traffic Generator

The browser traffic generator uses Playwright (headless Chromium) to create real browser sessions detectable by Dynatrace RUM. Unlike Locust (HTTP-only), it executes the Dynatrace JS agent in a real browser.

```bash
# Enable browser traffic generation
kubectl scale deployment/browser-traffic-gen --replicas=1 -n <your-namespace>

# Disable
kubectl scale deployment/browser-traffic-gen --replicas=0 -n <your-namespace>
```

Configuration via environment variables: `CONCURRENT_USERS`, `NAVIGATIONS_PER_SESSION`, `SESSION_INTERVAL`. See `browser-traffic-generator/generator.js` for full options.

## License

MIT
