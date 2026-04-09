#!/bin/bash
# Build all Docker images for the generic-app platform
# Usage: ./scripts/build-all.sh <registry>
# Example: ./scripts/build-all.sh myregistry.azurecr.io

set -e

REGISTRY=${1:?Usage: ./scripts/build-all.sh <registry>}

echo "============================================"
echo "Building all service images"
echo "Registry: $REGISTRY"
echo "============================================"

# AGENT: Update service names after industry customization
SERVICES=(
  "services/primary-service"
  "services/secondary-service"
  "services/telemetry-service"
  "services/data-ingestion-service"
  "services/topology-service"
  "services/analytics-service"
  "services/forecast-service"
  "services/dispatch-service"
  "services/notification-service"
  "services/external-data-service"
  "services/aggregator-service"
  "services/auth-service"
  "services/audit-service"
  "services/pricing-service"
  "services/work-order-service"
  "services/correlation-service"
  "gateway/api-gateway"
  "ui/web-ui"
  "load-generator"
)

for svc_path in "${SERVICES[@]}"; do
  svc_name=$(basename "$svc_path")
  echo ""
  echo "--- Building $svc_name ---"
  docker build -t "$REGISTRY/$svc_name:latest" "$svc_path" 2>&1 | tail -5
  echo "  ✓ $svc_name built"
done

echo ""
echo "============================================"
echo "All ${#SERVICES[@]} images built successfully"
echo "============================================"
