#!/bin/bash
# Deploy the generic-app platform to Kubernetes
# Usage: ./scripts/deploy.sh <namespace> <registry>
# Example: ./scripts/deploy.sh my-app myregistry.azurecr.io

set -e

NAMESPACE=${1:?Usage: ./scripts/deploy.sh <namespace> <registry>}
REGISTRY=${2:?Usage: ./scripts/deploy.sh <namespace> <registry>}

echo "============================================"
echo "Deploying to namespace: $NAMESPACE"
echo "Registry: $REGISTRY"
echo "============================================"

# Create namespace
kubectl create namespace "$NAMESPACE" 2>/dev/null || true

# Replace registry placeholder in manifests
TMPDIR=$(mktemp -d)
cp k8s/infrastructure.yaml "$TMPDIR/"
cp k8s/all-in-one.yaml "$TMPDIR/"

sed -i.bak "s|<YOUR_REGISTRY>|$REGISTRY|g" "$TMPDIR/all-in-one.yaml"

echo "--- Deploying infrastructure ---"
kubectl apply -f "$TMPDIR/infrastructure.yaml" -n "$NAMESPACE"

echo ""
echo "--- Waiting for infrastructure to be ready ---"
kubectl wait --for=condition=ready pod -l app=timescaledb -n "$NAMESPACE" --timeout=120s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout=60s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l app=kafka -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo ""
echo "--- Deploying application services ---"
kubectl apply -f "$TMPDIR/all-in-one.yaml" -n "$NAMESPACE"

echo ""
echo "--- Waiting for pods ---"
sleep 10
kubectl get pods -n "$NAMESPACE"

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "============================================"
echo "Deployment complete!"
echo "Namespace: $NAMESPACE"
echo "============================================"
echo ""
echo "Check status: kubectl get pods -n $NAMESPACE"
echo "Access UI:    kubectl port-forward svc/web-ui 8080:80 -n $NAMESPACE"
echo "Access Locust: kubectl port-forward svc/load-generator 8089:8089 -n $NAMESPACE"
echo "Enable Browser Traffic: kubectl scale deployment/browser-traffic-gen --replicas=1 -n $NAMESPACE"
