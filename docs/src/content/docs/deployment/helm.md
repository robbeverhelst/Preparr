---
title: Helm Chart
description: Deploy a complete media stack with the PrepArr Helm chart
---

The Helm chart deploys a complete media automation stack including PostgreSQL, qBittorrent, Prowlarr, Sonarr, and Radarr with PrepArr init and sidecar containers.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.8+
- kubectl configured for your cluster

## Quick Start

```bash
# Install with default values
helm install my-media-stack oci://ghcr.io/robbeverhelst/charts/preparr --version <version>

# Or install with custom values
helm install my-media-stack oci://ghcr.io/robbeverhelst/charts/preparr --version <version> -f custom-values.yaml
```

The chart is also available on [ArtifactHub](https://artifacthub.io/packages/helm/preparr/preparr).

## What Gets Deployed

For each enabled Servarr application, the chart creates:

- **Init container** -- One-time database setup and config.xml generation
- **Application container** -- The Servarr app (Sonarr, Radarr, etc.)
- **Sidecar container** -- Continuous configuration reconciliation
- **Service** -- Kubernetes service for network access
- **ConfigMap** -- Configuration file from Helm values
- **Health endpoints** -- Kubernetes-ready liveness and readiness probes

## Configuration Examples

### Minimal

```yaml
global:
  namespace: my-media

postgresql:
  auth:
    password: "my-secure-password"

qbittorrent:
  auth:
    password: "qbit-password"

sonarr:
  adminPassword: "sonarr-password"

radarr:
  adminPassword: "radarr-password"

prowlarr:
  adminPassword: "prowlarr-password"
```

### Selective Deployment

Deploy only Sonarr:

```yaml
radarr:
  enabled: false
prowlarr:
  enabled: false

sonarr:
  enabled: true
  adminPassword: "secure-password"
  config:
    rootFolders:
      - path: "/tv"
    downloadClients:
      - name: "qBittorrent"
        implementation: "QBittorrent"
        fields:
          - name: "host"
            value: "qbittorrent"
          - name: "port"
            value: 8080
```

### Production

```yaml
global:
  namespace: media-prod

preparr:
  image:
    tag: "0.15.0"
    pullPolicy: IfNotPresent
  logLevel: info

postgresql:
  persistence:
    enabled: true
    size: 20Gi
    storageClass: "fast-ssd"
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "1000m"

sonarr:
  service:
    type: ClusterIP
  storage:
    tv:
      enabled: true
      size: 200Gi
      storageClass: "bulk-storage"
  resources:
    requests:
      memory: "512Mi"
    limits:
      memory: "1Gi"
```

## Advanced Usage

### External PostgreSQL

```yaml
postgresql:
  enabled: false
  externalHost: "postgres.database.svc.cluster.local"
  service:
    port: 5432
  auth:
    username: "servarr_user"
    password: "external-db-password"
    database: "servarr"
```

### Custom API Keys

```yaml
sonarr:
  apiKey: "your-custom-sonarr-api-key"
radarr:
  apiKey: "your-custom-radarr-api-key"
prowlarr:
  apiKey: "your-custom-prowlarr-api-key"
```

## Operations

```bash
# Upgrade with new values
helm upgrade media-stack oci://ghcr.io/robbeverhelst/charts/preparr --version <version> -f values.yaml

# Uninstall
helm uninstall media-stack

# Dry run to preview
helm install test ./preparr --dry-run --debug

# Template output
helm template test ./preparr > rendered.yaml
```

## Access Services

```bash
# Port forward
kubectl port-forward -n preparr svc/sonarr 8989:8989
kubectl port-forward -n preparr svc/radarr 7878:7878
kubectl port-forward -n preparr svc/prowlarr 9696:9696
```

For the full list of configurable parameters, see the [Helm Values Reference](/Preparr/reference/helm-values/).
