#!/bin/bash
# Push all Docker images to the container registry
# Usage: ./scripts/push-all.sh <registry>

set -e

REGISTRY=${1:?Usage: ./scripts/push-all.sh <registry>}

echo "============================================"
echo "Pushing all images to $REGISTRY"
echo "============================================"

# AGENT: Update service names after industry customization
IMAGES=(
  "primary-service"
  "secondary-service"
  "telemetry-service"
  "data-ingestion-service"
  "topology-service"
  "analytics-service"
  "forecast-service"
  "dispatch-service"
  "notification-service"
  "external-data-service"
  "aggregator-service"
  "auth-service"
  "audit-service"
  "pricing-service"
  "work-order-service"
  "correlation-service"
  "api-gateway"
  "web-ui"
  "load-generator"
  "browser-traffic-gen"
)

for img in "${IMAGES[@]}"; do
  echo "Pushing $img..."
  docker push "$REGISTRY/$img:latest" 2>&1 | tail -3
done

echo ""
echo "============================================"
echo "All ${#IMAGES[@]} images pushed"
echo "============================================"
