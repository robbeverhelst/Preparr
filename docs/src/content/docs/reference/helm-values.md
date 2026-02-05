---
title: Helm Values Reference
description: Complete parameter reference for the PrepArr Helm chart
---

The PrepArr Helm chart deploys a complete media automation stack. Install it from the Helm repository or from a local checkout.

```bash
# From repository
helm repo add preparr https://robbeverhelst.github.io/Preparr
helm install media-stack preparr/preparr -f values.yaml

# From local checkout
helm install media-stack ./helm/preparr -f values.yaml
```

Find the chart on [ArtifactHub](https://artifacthub.io/packages/helm/preparr/preparr).

## Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.namespace` | Kubernetes namespace for all resources | `preparr` |

## PrepArr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `preparr.image.repository` | PrepArr container image | `ghcr.io/robbeverhelst/preparr` |
| `preparr.image.tag` | Image tag | `latest` |
| `preparr.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `preparr.health.port` | Health check server port | `9001` |
| `preparr.logLevel` | Log level (`debug`, `info`, `warn`, `error`) | `info` |

## PostgreSQL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `postgresql.image.repository` | PostgreSQL image | `postgres` |
| `postgresql.image.tag` | PostgreSQL version | `16-alpine` |
| `postgresql.auth.username` | Database superuser | `postgres` |
| `postgresql.auth.password` | Database password | `postgres123` |
| `postgresql.auth.database` | Default database | `servarr` |
| `postgresql.service.type` | Service type | `ClusterIP` |
| `postgresql.service.port` | Service port | `5432` |
| `postgresql.persistence.enabled` | Enable persistent volume | `false` |
| `postgresql.persistence.size` | Volume size | `8Gi` |
| `postgresql.persistence.storageClass` | Storage class | `""` |

### External PostgreSQL

Disable the built-in PostgreSQL and point to an external instance:

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

## Sonarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `sonarr.enabled` | Deploy Sonarr | `true` |
| `sonarr.image.repository` | Sonarr image | `linuxserver/sonarr` |
| `sonarr.image.tag` | Sonarr version | `latest` |
| `sonarr.apiKey` | API key (auto-generated if omitted) | — |
| `sonarr.adminPassword` | Admin password | `adminpass` |
| `sonarr.service.type` | Service type | `NodePort` |
| `sonarr.service.webui.port` | Web UI port | `8989` |
| `sonarr.service.webui.nodePort` | NodePort | `30989` |
| `sonarr.reconciliation.enabled` | Enable sidecar reconciliation | `true` |
| `sonarr.reconciliation.interval` | Reconciliation interval (seconds) | `30` |
| `sonarr.reconciliation.watch` | Watch config file for changes | `true` |
| `sonarr.storage.tv.enabled` | Create TV media PVC | `true` |
| `sonarr.storage.tv.size` | PVC size | `50Gi` |
| `sonarr.config` | Configuration as code (JSON structure) | See values.yaml |

## Radarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `radarr.enabled` | Deploy Radarr | `true` |
| `radarr.image.repository` | Radarr image | `linuxserver/radarr` |
| `radarr.image.tag` | Radarr version | `latest` |
| `radarr.apiKey` | API key (auto-generated if omitted) | — |
| `radarr.adminPassword` | Admin password | `adminpass` |
| `radarr.service.type` | Service type | `NodePort` |
| `radarr.service.webui.port` | Web UI port | `7878` |
| `radarr.service.webui.nodePort` | NodePort | `30878` |
| `radarr.reconciliation.enabled` | Enable sidecar reconciliation | `true` |
| `radarr.reconciliation.interval` | Reconciliation interval (seconds) | `30` |
| `radarr.storage.movies.enabled` | Create movie media PVC | `true` |
| `radarr.storage.movies.size` | PVC size | `100Gi` |

## Prowlarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `prowlarr.enabled` | Deploy Prowlarr | `true` |
| `prowlarr.image.repository` | Prowlarr image | `linuxserver/prowlarr` |
| `prowlarr.image.tag` | Prowlarr version | `latest` |
| `prowlarr.apiKey` | API key (auto-generated if omitted) | — |
| `prowlarr.adminPassword` | Admin password | `adminpass` |
| `prowlarr.service.type` | Service type | `NodePort` |
| `prowlarr.service.webui.port` | Web UI port | `9696` |

## qBittorrent Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `qbittorrent.enabled` | Deploy qBittorrent | `true` |
| `qbittorrent.image.repository` | qBittorrent image | `linuxserver/qbittorrent` |
| `qbittorrent.image.tag` | qBittorrent version | `latest` |
| `qbittorrent.auth.username` | Web UI username | `admin` |
| `qbittorrent.auth.password` | Web UI password | `adminpass` |
| `qbittorrent.service.type` | Service type | `NodePort` |
| `qbittorrent.service.webui.port` | Web UI port | `8080` |

## Example Configurations

### Minimal

```yaml
global:
  namespace: media

postgresql:
  auth:
    password: "db-password"

sonarr:
  adminPassword: "sonarr-pass"

radarr:
  adminPassword: "radarr-pass"

prowlarr:
  adminPassword: "prowlarr-pass"

qbittorrent:
  auth:
    password: "qbit-pass"
```

### Sonarr Only

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
    tag: "0.15.0"  # Pin version
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
      size: 500Gi
      storageClass: "network-nfs"
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "1000m"
  reconciliation:
    interval: 60
```

## Operations

### Install

```bash
helm install media-stack preparr/preparr -f values.yaml
```

### Upgrade

```bash
helm upgrade media-stack preparr/preparr -f values.yaml
```

### Uninstall

```bash
helm uninstall media-stack
kubectl delete namespace preparr
```

### Debug

```bash
# Lint chart
helm lint ./helm/preparr

# Dry run
helm install test preparr/preparr --dry-run --debug

# Template output
helm template test preparr/preparr > output.yaml
```
