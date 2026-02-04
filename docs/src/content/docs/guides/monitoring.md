---
title: Monitoring & Health
description: Health endpoints, Prometheus metrics, and probe configuration
---

PrepArr exposes health endpoints for orchestrator integration and observability.

## Health Endpoints

| Endpoint | Method | Purpose | Response Code |
|----------|--------|---------|---------------|
| `/health` | GET | Readiness probe | 200 / 503 |
| `/health/ready` | GET | Alias for `/health` | 200 / 503 |
| `/health/live` | GET | Liveness probe | Always 200 |
| `/health/liveness` | GET | Alias for `/health/live` | Always 200 |
| `/health/status` | GET | Detailed health status | Always 200 |
| `/metrics` | GET | Prometheus metrics | 200 |
| `/reconciliation/status` | GET | Reconciliation state | 200 |
| `/reconciliation/force` | POST | Trigger reconciliation | 200 |

## Health Status Response

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "pass", "lastChecked": "2025-01-15T12:00:00.000Z" },
    "servarr": { "status": "pass", "lastChecked": "2025-01-15T12:00:00.000Z" },
    "configuration": { "status": "pass", "lastChecked": "2025-01-15T12:00:00.000Z" }
  },
  "reconciliation": {
    "status": "active",
    "totalRuns": 42,
    "errors": 0
  }
}
```

## Prometheus Metrics

```
preparr_uptime_seconds 3600
preparr_health_status 1
preparr_reconciliation_total 42
preparr_reconciliation_errors_total 0
```

## Docker Compose Health Check

```yaml
sonarr-sidecar:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Kubernetes Probes

```yaml
containers:
- name: preparr-sidecar
  livenessProbe:
    httpGet:
      path: /health/live
      port: 9001
    initialDelaySeconds: 30
    periodSeconds: 30
  readinessProbe:
    httpGet:
      path: /health/ready
      port: 9001
    initialDelaySeconds: 10
    periodSeconds: 10
```

Use `/health/live` for liveness (always returns 200 while the process runs) and `/health/ready` for readiness (returns 503 when unhealthy).

## Forcing Reconciliation

Trigger an immediate reconciliation cycle:

```bash
curl -X POST http://localhost:9001/reconciliation/force
```

Response:

```json
{
  "message": "Reconciliation triggered successfully"
}
```

## Debugging with Health Endpoints

```bash
# Detailed status
curl http://localhost:9001/health/status | jq .

# Check reconciliation state
curl http://localhost:9001/reconciliation/status | jq .
```
