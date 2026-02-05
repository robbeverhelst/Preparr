---
title: Production Checklist
description: Security, reliability, and performance recommendations for production deployments
---

## Security

- **Use secrets management** -- Docker Secrets, Kubernetes Secrets, or a vault solution for passwords and API keys. Avoid plaintext environment variables in production manifests.
- **Run as non-root** -- PrepArr runs as a non-root user (`bun:bun`) by default.
- **Read-only root filesystem** -- Where possible, mount the root filesystem as read-only.
- **Network isolation** -- Use private networks (Docker) or network policies (Kubernetes) to restrict inter-service communication.
- **Rotate credentials** -- Rotate API keys and database passwords regularly.
- **Generate unique API keys** -- Each Servarr instance should have its own unique API key.

## Resource Limits

Set resource limits on PrepArr sidecar containers:

### Docker Compose

```yaml
sonarr-sidecar:
  deploy:
    resources:
      limits:
        memory: 256M
        cpus: '0.2'
      reservations:
        memory: 128M
        cpus: '0.1'
```

### Kubernetes

```yaml
resources:
  requests:
    memory: 128Mi
    cpu: 100m
  limits:
    memory: 256Mi
    cpu: 200m
```

## Persistence

- **PostgreSQL** -- Always use persistent volumes for database data. Enable backups.
- **Media files** -- Use persistent volumes or NFS mounts.
- **Config files** -- Mount from host (Docker) or ConfigMaps (Kubernetes). Version control with Git.
- **config.xml** -- Ephemeral. PrepArr regenerates it on every init run.

## Monitoring

- Enable [health endpoints](/Preparr/guides/monitoring/) on all sidecars
- Configure liveness and readiness probes in your orchestrator
- Set up alerting on unhealthy sidecars
- Use `LOG_LEVEL=info` or `warn` in production (not `debug`)
- Use `LOG_FORMAT=json` for log aggregation systems

## Reconciliation Settings

- **`CONFIG_RECONCILE_INTERVAL`** -- Set to 60-300 seconds for production. Lower intervals increase API load.
- **`CONFIG_WATCH=true`** -- Enable file watching for immediate change detection.
- **`prowlarrSync=true`** -- Use Prowlarr for centralized indexer management to reduce per-service API calls.

## PostgreSQL Tuning

For multi-service stacks sharing a PostgreSQL instance:

```yaml
postgres:
  environment:
    POSTGRES_SHARED_BUFFERS: 256MB
    POSTGRES_MAX_CONNECTIONS: 100
```

## Backup Strategy

- **PostgreSQL** -- Use `pg_dump` on a schedule. Store backups off-cluster.
- **Config files** -- Version controlled in Git (already backed up).
- **Disaster recovery test** -- Periodically delete the config volume, redeploy, and verify PrepArr recreates everything correctly.

## Image Pinning

Pin PrepArr and Servarr images to specific versions in production:

```yaml
preparr:
  image: ghcr.io/robbeverhelst/preparr:0.15.0    # Not :latest

sonarr:
  image: linuxserver/sonarr:4.0.0                 # Not :latest
```
