# PrepArr Helm Chart

Complete Infrastructure as Code for Servarr applications using Helm. Deploy your entire media stack (Prowlarr, Sonarr, Radarr, qBittorrent) with zero manual configuration.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.8+
- kubectl configured to communicate with your cluster

## Quick Start

### 1. Add Helm Repository (Future)

```bash
# Once published to a Helm repository
helm repo add preparr https://robbeverhelst.github.io/preparr
helm repo update
```

### 2. Install from Local Chart

```bash
# Clone the repository
git clone https://github.com/robbeverhelst/Preparr.git
cd Preparr/helm

# Install with default values
helm install my-media-stack ./preparr

# Or install with custom values
helm install my-media-stack ./preparr -f custom-values.yaml
```

### 3. Access Your Services

```bash
# Get service URLs (NodePort)
kubectl get svc -n preparr

# Forward ports for local access
kubectl port-forward -n preparr svc/sonarr 8989:8989
kubectl port-forward -n preparr svc/radarr 7878:7878
kubectl port-forward -n preparr svc/prowlarr 9696:9696
kubectl port-forward -n preparr svc/qbittorrent 8080:8080
```

## What Gets Deployed

This Helm chart deploys a complete media automation stack:

### Core Components

1. **PostgreSQL** - Shared database for all Servarr apps
2. **qBittorrent** - Download client with automated configuration
3. **Prowlarr** - Indexer manager with automatic sync to Sonarr/Radarr
4. **Sonarr** - TV show management
5. **Radarr** - Movie management

### PrepArr Automation

For each Servarr application, PrepArr provides:

- **Init Container** - One-time setup (databases, config.xml, API keys)
- **Sidecar Container** - Continuous configuration reconciliation
- **Health Endpoints** - Kubernetes-ready health checks

## Configuration

### Minimal Configuration

```yaml
# minimal-values.yaml
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

```bash
helm install media-stack ./preparr -f minimal-values.yaml
```

### Selective Deployment

Deploy only specific services:

```yaml
# only-sonarr.yaml
global:
  namespace: tv-shows

# Disable unneeded services
radarr:
  enabled: false

prowlarr:
  enabled: false

qbittorrent:
  enabled: true

postgresql:
  enabled: true

sonarr:
  enabled: true
  adminPassword: "secure-password"
  config:
    apiKey: "2bac5d00dca43258313c734821a15c4c"
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

```bash
helm install tv-stack ./preparr -f only-sonarr.yaml
```

### Production Configuration

```yaml
# production-values.yaml
global:
  namespace: media-prod

preparr:
  image:
    repository: ghcr.io/robbeverhelst/preparr
    tag: "0.1.10"
    pullPolicy: IfNotPresent
  logLevel: info

postgresql:
  enabled: true
  auth:
    password: "production-db-password"
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

qbittorrent:
  enabled: true
  service:
    type: ClusterIP  # Use Ingress instead
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "2Gi"
      cpu: "2000m"

sonarr:
  enabled: true
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
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "1000m"
  reconciliation:
    enabled: true
    interval: 60
    watch: true

radarr:
  enabled: true
  service:
    type: ClusterIP
  storage:
    movies:
      enabled: true
      size: 500Gi
      storageClass: "bulk-storage"
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "1000m"

prowlarr:
  enabled: true
  service:
    type: ClusterIP
```

```bash
helm install prod-media ./preparr -f production-values.yaml
```

## Configuration Parameters

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.namespace` | Kubernetes namespace | `preparr` |

### PrepArr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `preparr.image.repository` | PrepArr image repository | `ghcr.io/robbeverhelst/preparr` |
| `preparr.image.tag` | PrepArr image tag | `latest` |
| `preparr.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `preparr.health.port` | Health check port | `9001` |
| `preparr.logLevel` | Log level (debug/info/warn/error) | `info` |

### PostgreSQL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Enable PostgreSQL deployment | `true` |
| `postgresql.image.repository` | PostgreSQL image | `postgres` |
| `postgresql.image.tag` | PostgreSQL version | `16-alpine` |
| `postgresql.auth.username` | Database username | `postgres` |
| `postgresql.auth.password` | Database password | `postgres123` |
| `postgresql.auth.database` | Default database name | `servarr` |
| `postgresql.service.type` | Service type | `ClusterIP` |
| `postgresql.service.port` | Service port | `5432` |
| `postgresql.persistence.enabled` | Enable persistence | `false` |
| `postgresql.persistence.size` | Storage size | `8Gi` |
| `postgresql.persistence.storageClass` | Storage class | `""` |

### Sonarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `sonarr.enabled` | Enable Sonarr deployment | `true` |
| `sonarr.image.repository` | Sonarr image | `linuxserver/sonarr` |
| `sonarr.image.tag` | Sonarr version | `latest` |
| `sonarr.apiKey` | Sonarr API key | Auto-generated |
| `sonarr.adminPassword` | Admin password | `adminpass` |
| `sonarr.service.type` | Service type | `NodePort` |
| `sonarr.service.webui.port` | Web UI port | `8989` |
| `sonarr.service.webui.nodePort` | NodePort for web UI | `30989` |
| `sonarr.reconciliation.enabled` | Enable config reconciliation | `true` |
| `sonarr.reconciliation.interval` | Reconciliation interval (seconds) | `30` |
| `sonarr.reconciliation.watch` | Watch config file for changes | `true` |
| `sonarr.storage.tv.enabled` | Enable TV storage PVC | `true` |
| `sonarr.storage.tv.size` | Storage size | `50Gi` |
| `sonarr.config` | Configuration as code (JSON) | See values.yaml |

### Radarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `radarr.enabled` | Enable Radarr deployment | `true` |
| `radarr.image.repository` | Radarr image | `linuxserver/radarr` |
| `radarr.image.tag` | Radarr version | `latest` |
| `radarr.apiKey` | Radarr API key | Auto-generated |
| `radarr.adminPassword` | Admin password | `adminpass` |
| `radarr.service.type` | Service type | `NodePort` |
| `radarr.service.webui.port` | Web UI port | `7878` |
| `radarr.service.webui.nodePort` | NodePort for web UI | `30878` |
| `radarr.reconciliation.enabled` | Enable config reconciliation | `true` |
| `radarr.reconciliation.interval` | Reconciliation interval (seconds) | `30` |
| `radarr.storage.movies.enabled` | Enable movie storage PVC | `true` |
| `radarr.storage.movies.size` | Storage size | `100Gi` |

### Prowlarr Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `prowlarr.enabled` | Enable Prowlarr deployment | `true` |
| `prowlarr.image.repository` | Prowlarr image | `linuxserver/prowlarr` |
| `prowlarr.image.tag` | Prowlarr version | `latest` |
| `prowlarr.apiKey` | Prowlarr API key | Auto-generated |
| `prowlarr.adminPassword` | Admin password | `adminpass` |
| `prowlarr.service.type` | Service type | `NodePort` |
| `prowlarr.service.webui.port` | Web UI port | `9696` |

### qBittorrent Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `qbittorrent.enabled` | Enable qBittorrent deployment | `true` |
| `qbittorrent.image.repository` | qBittorrent image | `linuxserver/qbittorrent` |
| `qbittorrent.image.tag` | qBittorrent version | `latest` |
| `qbittorrent.auth.username` | Web UI username | `admin` |
| `qbittorrent.auth.password` | Web UI password | `adminpass` |
| `qbittorrent.service.type` | Service type | `NodePort` |
| `qbittorrent.service.webui.port` | Web UI port | `8080` |

## Advanced Usage

### Using External PostgreSQL

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

### Ingress Configuration

Create an ingress resource separately:

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: media-stack
  namespace: preparr
spec:
  rules:
  - host: sonarr.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sonarr
            port:
              number: 8989
  - host: radarr.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: radarr
            port:
              number: 7878
```

### Storage Classes

```yaml
postgresql:
  persistence:
    enabled: true
    storageClass: "fast-ssd"
    size: 20Gi

sonarr:
  storage:
    tv:
      enabled: true
      storageClass: "network-nfs"
      size: 500Gi

radarr:
  storage:
    movies:
      enabled: true
      storageClass: "network-nfs"
      size: 1Ti
```

## Upgrade

```bash
# Upgrade with new values
helm upgrade media-stack ./preparr -f custom-values.yaml

# Upgrade to new chart version
helm upgrade media-stack ./preparr --version 0.2.0
```

## Uninstall

```bash
# Uninstall the release
helm uninstall media-stack

# Clean up namespace
kubectl delete namespace preparr
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n preparr
kubectl describe pod <pod-name> -n preparr
```

### View Logs

```bash
# Init container logs
kubectl logs -n preparr <pod-name> -c preparr-init

# Sidecar logs
kubectl logs -n preparr <pod-name> -c preparr-sidecar -f

# Application logs
kubectl logs -n preparr <pod-name> -c sonarr -f
```

### Health Checks

```bash
# Check sidecar health
kubectl port-forward -n preparr svc/sonarr 9001:9001
curl http://localhost:9001/health

# Check application health
kubectl exec -n preparr <pod-name> -c sonarr -- wget -O- http://localhost:8989/api/v3/system/status
```

### Common Issues

**Init container fails**
- Check PostgreSQL is running: `kubectl get pods -n preparr | grep postgres`
- Verify database credentials in values.yaml
- Check init logs: `kubectl logs -n preparr <pod-name> -c preparr-init`

**Sidecar not reconciling**
- Verify config is mounted: `kubectl exec -n preparr <pod-name> -c preparr-sidecar -- cat /config/sonarr-config.json`
- Check sidecar health: `curl http://localhost:9001/health`
- Review sidecar logs for errors

**Application won't start**
- Ensure init container completed successfully
- Verify config.xml was created: `kubectl exec -n preparr <pod-name> -c sonarr -- ls -la /config/`
- Check application logs for errors

## Development

### Test Locally

```bash
# Lint the chart
helm lint ./preparr

# Dry run
helm install test-stack ./preparr --dry-run --debug

# Template output
helm template test-stack ./preparr > output.yaml
```

### Package Chart

```bash
# Package for distribution
helm package ./preparr

# Generate index
helm repo index .
```

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

## Resources

- **GitHub**: https://github.com/robbeverhelst/Preparr
- **Documentation**: https://github.com/robbeverhelst/Preparr/tree/main/docs
- **Issues**: https://github.com/robbeverhelst/Preparr/issues
