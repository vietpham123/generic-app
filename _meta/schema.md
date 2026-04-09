# Industry Configuration Schema

This document describes every field in `industry.yaml`.

## Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `industry` | string | yes | Short identifier (e.g., `utility`, `healthcare`) |
| `display_name` | string | yes | Human-readable name shown in UI title bar |
| `entities` | list | yes | Domain data models |
| `services` | map | yes | Service name mappings and config |
| `ui_tabs` | list | yes | Tabs rendered in the web UI |
| `kpis` | list | yes | KPI cards on the dashboard |
| `roles` | list | yes | User roles for auth-service |
| `regions` | list | yes | Geographic/logical regions |
| `fault_scenarios` | list | no | Chaos engineering scenarios |
| `demo_users` | list | yes | Pre-seeded demo accounts |
| `demo_password` | string | yes | Shared password for demo accounts |

## Entity Schema

```yaml
entities:
  - name: string          # snake_case identifier
    description: string    # One-line description
    table: string          # TimescaleDB table name
    fields:                # Column definitions
      - name: string
        type: string       # uuid | string | integer | float | boolean | enum | timestamptz
        primary: boolean   # optional, marks primary key
        nullable: boolean  # optional, defaults to false
        values: [string]   # required when type=enum
    primary_service: string  # Which service owns this entity
    kafka_topic: string      # Kafka topic for entity events
```

## Service Schema

```yaml
services:
  generic-name:
    rename_to: string      # Industry-specific name
    language: string       # DO NOT CHANGE — fixed per service
    port: integer          # DO NOT CHANGE — fixed per service
    description: string    # What this service does in the industry context
    entities: [string]     # Which entities this service works with
```

## UI Tab Schema

```yaml
ui_tabs:
  - label: string          # Tab display name
    icon: string           # Material UI icon name
    endpoint: string       # API endpoint the tab calls
    description: string    # Tooltip text
```

## KPI Schema

```yaml
kpis:
  - name: string           # KPI display name
    source: string         # API endpoint
    field: string          # JSON field in response
    format: string         # number | percent | currency | minutes
    color: string          # Hex color for the card
```
