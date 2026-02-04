---
title: Health Endpoints
description: HTTP endpoint reference for health checks, metrics, and reconciliation control
---

PrepArr exposes an HTTP server for health checks, Prometheus metrics, and reconciliation control. The server runs on port `9001` by default (configurable via `HEALTH_PORT` or `--health-port`).

## Endpoints

### GET /health

**Readiness probe.** Returns `200` when healthy, `503` when unhealthy or starting.

```json
{
  "status": "healthy"
}
```

Possible `status` values: `healthy`, `unhealthy`, `starting`.

Use this for Kubernetes readiness probes and Docker health checks.

### GET /health/ready

Alias for `/health`.

### GET /health/live

**Liveness probe.** Always returns `200` while the process is running.

```
OK
```

Use this for Kubernetes liveness probes. A non-200 response means the process has crashed and should be restarted.

### GET /health/liveness

Alias for `/health/live`.

### GET /health/status

**Detailed health status.** Always returns `200` with comprehensive state information.

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 3600,
  "reconciliation": {
    "status": "active",
    "reconciliationCount": 120,
    "errors": 0,
    "lastReconciliation": "2025-01-15T11:59:55.000Z",
    "lastError": null
  },
  "checks": {
    "server": {
      "status": "pass",
      "message": "Health server is running",
      "lastChecked": "2025-01-15T12:00:00.000Z"
    },
    "reconciliation": {
      "status": "pass",
      "message": "Reconciliation manager active",
      "lastChecked": "2025-01-15T12:00:00.000Z"
    }
  }
}
```

#### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall health: `healthy`, `unhealthy`, `starting` |
| `timestamp` | string | Current server time (ISO 8601) |
| `uptime` | number | Seconds since process start |
| `reconciliation.status` | string | `active`, `inactive`, `error` |
| `reconciliation.reconciliationCount` | number | Total completed reconciliation cycles |
| `reconciliation.errors` | number | Total error count |
| `reconciliation.lastReconciliation` | string | Timestamp of last successful cycle |
| `reconciliation.lastError` | string \| null | Last error message, if any |
| `checks.*.status` | string | `pass`, `fail`, `warn` |
| `checks.*.message` | string | Human-readable status description |
| `checks.*.lastChecked` | string | When this check last ran |

### GET /metrics

**Prometheus metrics.** Returns metrics in Prometheus text exposition format.

```
# HELP preparr_uptime_seconds Uptime in seconds
# TYPE preparr_uptime_seconds counter
preparr_uptime_seconds 3600

# HELP preparr_health_status Health status (1=healthy, 0=unhealthy)
# TYPE preparr_health_status gauge
preparr_health_status 1

# HELP preparr_reconciliation_total Total number of reconciliation cycles
# TYPE preparr_reconciliation_total counter
preparr_reconciliation_total 120

# HELP preparr_reconciliation_errors_total Total number of reconciliation errors
# TYPE preparr_reconciliation_errors_total counter
preparr_reconciliation_errors_total 0
```

#### Metrics Reference

| Metric | Type | Description |
|--------|------|-------------|
| `preparr_uptime_seconds` | counter | Process uptime in seconds |
| `preparr_health_status` | gauge | `1` = healthy, `0` = unhealthy |
| `preparr_reconciliation_total` | counter | Total reconciliation cycles completed |
| `preparr_reconciliation_errors_total` | counter | Total reconciliation errors |

### GET /reconciliation/status

**Reconciliation state.** Returns current reconciliation manager status.

```json
{
  "reconciliationCount": 120,
  "errors": 0,
  "lastReconciliation": "2025-01-15T11:59:55.000Z",
  "lastError": null
}
```

### POST /reconciliation/force

**Trigger reconciliation.** Manually starts a reconciliation cycle immediately.

Success response (`200`):

```json
{
  "message": "Reconciliation triggered successfully"
}
```

Error response (`503` or `500`):

```json
{
  "error": "Reconciliation manager not available",
  "details": "error message"
}
```

## CORS

All endpoints support CORS with wildcard origin (`*`) for development and tooling compatibility.

## Usage Examples

### Docker Compose Health Check

```yaml
sonarr-sidecar:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Kubernetes Probes

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

### Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: preparr
    static_configs:
      - targets:
          - sonarr-sidecar:9001
          - radarr-sidecar:9001
    metrics_path: /metrics
    scrape_interval: 30s
```

### Manual Debugging

```bash
# Quick health check
curl http://localhost:9001/health

# Detailed status
curl http://localhost:9001/health/status | jq .

# Force a reconciliation
curl -X POST http://localhost:9001/reconciliation/force

# Check reconciliation state
curl http://localhost:9001/reconciliation/status | jq .
```
