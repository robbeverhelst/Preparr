# Complete Setup Guide

This guide covers detailed deployment of PrepArr across different orchestration platforms.

## Prerequisites

- **PostgreSQL Database** - PrepArr requires PostgreSQL, SQLite is not supported
- **Docker** or **Kubernetes** - For container orchestration
- **Networking** - Services must be able to communicate (same network/namespace)

## Environment Variables

All PrepArr containers require these environment variables:

### Core Configuration
```bash
# PostgreSQL Connection
POSTGRES_HOST=postgres
POSTGRES_PORT=5432                    # Optional, defaults to 5432
POSTGRES_USER=postgres               # Optional, defaults to postgres  
POSTGRES_PASSWORD=your-password      # Required
POSTGRES_DB=servarr                  # Optional, defaults to servarr

# Servarr Application
SERVARR_URL=http://sonarr:8989      # Required, full URL to Servarr app
SERVARR_TYPE=sonarr                 # Required: sonarr|radarr|prowlarr|lidarr|readarr
SERVARR_ADMIN_USER=admin            # Optional, defaults to admin
SERVARR_ADMIN_PASSWORD=password     # Required for init containers

# Configuration
CONFIG_PATH=/config/sonarr-config.json    # Required, path to JSON config
CONFIG_WATCH=true                          # Optional, enables file watching
CONFIG_RECONCILE_INTERVAL=60              # Optional, reconciliation interval in seconds

# Health & Monitoring  
HEALTH_PORT=9001                          # Optional, health check port
LOG_LEVEL=info                            # Optional: debug|info|warn|error
LOG_FORMAT=json                           # Optional: json|pretty
```

### Service Integration (Optional)
```bash
# qBittorrent Integration
QBITTORRENT_URL=http://qbittorrent:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminpass

# Prowlarr Integration  
PROWLARR_URL=http://prowlarr:9696
PROWLARR_API_KEY=your-api-key
```

## Docker Compose Deployment

### Single Service (Sonarr)

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
      POSTGRES_DB: servarr
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 1. Init Container - Database and config setup
  sonarr-init:
    image: ghcr.io/robbeverhelst/preparr:latest
    command: ["bun", "run", "dist/index.js", "--init"]
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PASSWORD: postgres123
      SERVARR_URL: http://sonarr:8989
      SERVARR_TYPE: sonarr
      SERVARR_ADMIN_PASSWORD: adminpass
      CONFIG_PATH: /config/sonarr-config.json
    volumes:
      - sonarr_config:/config
      - ./sonarr-config.json:/config/sonarr-config.json:ro
    depends_on:
      postgres:
        condition: service_healthy

  # 2. Servarr Application
  sonarr:
    image: linuxserver/sonarr:latest
    ports:
      - "8989:8989"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - sonarr_config:/config
      - ./tv:/tv
      - ./downloads:/downloads
    depends_on:
      sonarr-init:
        condition: service_completed_successfully

  # 3. Sidecar - Continuous configuration
  sonarr-sidecar:
    image: ghcr.io/robbeverhelst/preparr:latest
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_PASSWORD: postgres123
      SERVARR_URL: http://sonarr:8989
      SERVARR_TYPE: sonarr
      SERVARR_ADMIN_PASSWORD: adminpass
      CONFIG_PATH: /config/sonarr-config.json
      CONFIG_WATCH: "true"
      CONFIG_RECONCILE_INTERVAL: "60"
      HEALTH_PORT: "9001"
      LOG_LEVEL: info
    ports:
      - "9001:9001"
    volumes:
      - sonarr_config:/config
      - ./sonarr-config.json:/config/sonarr-config.json:ro
    depends_on:
      - sonarr
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  sonarr_config:
```

**sonarr-config.json**:
```json
{
  "apiKey": "2bac5d00dca43258313c734821a15c4c",
  "prowlarrSync": true,
  "rootFolders": [
    {
      "path": "/tv",
      "accessible": true
    }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p", 
      "cutoff": 1080,
      "items": [
        {
          "quality": { "id": 1, "name": "HDTV-1080p" },
          "allowed": true
        }
      ]
    }
  ],
  "downloadClients": [
    {
      "name": "qBittorrent",
      "implementation": "QBittorrent",
      "implementationName": "qBittorrent", 
      "configContract": "QBittorrentSettings",
      "fields": [
        { "name": "host", "value": "qbittorrent" },
        { "name": "port", "value": 8080 },
        { "name": "username", "value": "admin" },
        { "name": "password", "value": "adminpass" },
        { "name": "category", "value": "tv" }
      ],
      "enable": true,
      "priority": 1
    }
  ]
}
```

### Multi-Service Stack

For a complete Prowlarr + Sonarr + Radarr + qBittorrent setup, see [docker-compose.test.yml](../docker-compose.test.yml).

## Kubernetes Deployment

### Namespace and ConfigMaps

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: media-stack
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: sonarr-config
  namespace: media-stack
data:
  sonarr-config.json: |
    {
      "apiKey": "2bac5d00dca43258313c734821a15c4c",
      "prowlarrSync": true,
      "rootFolders": [
        {
          "path": "/tv",
          "accessible": true
        }
      ],
      "downloadClients": [
        {
          "name": "qBittorrent",
          "implementation": "QBittorrent",
          "implementationName": "qBittorrent",
          "configContract": "QBittorrentSettings", 
          "fields": [
            { "name": "host", "value": "qbittorrent" },
            { "name": "port", "value": 8080 },
            { "name": "username", "value": "admin" },
            { "name": "password", "value": "adminpass" },
            { "name": "category", "value": "tv" }
          ],
          "enable": true,
          "priority": 1
        }
      ]
    }
```

### Secret for Database

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: media-stack
type: Opaque
data:
  password: cG9zdGdyZXMxMjM=  # base64 encoded 'postgres123'
```

### Deployment with Init Container

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonarr
  namespace: media-stack
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sonarr
  template:
    metadata:
      labels:
        app: sonarr
    spec:
      initContainers:
      - name: preparr-init
        image: ghcr.io/robbeverhelst/preparr:latest
        command: ["bun", "run", "dist/index.js", "--init"]
        env:
        - name: POSTGRES_HOST
          value: "postgres-service"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: SERVARR_URL
          value: "http://localhost:8989"
        - name: SERVARR_TYPE
          value: "sonarr"
        - name: SERVARR_ADMIN_PASSWORD
          value: "adminpass"
        - name: CONFIG_PATH
          value: "/config/sonarr-config.json"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: config-json
          mountPath: /config/sonarr-config.json
          subPath: sonarr-config.json
      
      containers:
      - name: sonarr
        image: linuxserver/sonarr:latest
        ports:
        - containerPort: 8989
        env:
        - name: PUID
          value: "1000"
        - name: PGID  
          value: "1000"
        - name: TZ
          value: "UTC"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: tv-storage
          mountPath: /tv
        - name: downloads-storage
          mountPath: /downloads
        livenessProbe:
          httpGet:
            path: /
            port: 8989
          initialDelaySeconds: 60
          periodSeconds: 30
        
      - name: preparr-sidecar
        image: ghcr.io/robbeverhelst/preparr:latest
        ports:
        - containerPort: 9001
          name: health
        env:
        - name: POSTGRES_HOST
          value: "postgres-service"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: SERVARR_URL
          value: "http://localhost:8989"
        - name: SERVARR_TYPE
          value: "sonarr"
        - name: SERVARR_ADMIN_PASSWORD
          value: "adminpass"
        - name: CONFIG_PATH
          value: "/config/sonarr-config.json"
        - name: CONFIG_WATCH
          value: "true"
        - name: HEALTH_PORT
          value: "9001"
        volumeMounts:
        - name: sonarr-config-volume
          mountPath: /config
        - name: config-json
          mountPath: /config/sonarr-config.json
          subPath: sonarr-config.json
        livenessProbe:
          httpGet:
            path: /health
            port: 9001
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 9001
          initialDelaySeconds: 10
          periodSeconds: 10

      volumes:
      - name: sonarr-config-volume
        emptyDir: {}
      - name: config-json
        configMap:
          name: sonarr-config
      - name: tv-storage
        persistentVolumeClaim:
          claimName: tv-pvc
      - name: downloads-storage
        persistentVolumeClaim:
          claimName: downloads-pvc
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sonarr-service
  namespace: media-stack
spec:
  selector:
    app: sonarr
  ports:
  - name: http
    port: 8989
    targetPort: 8989
  - name: health
    port: 9001
    targetPort: 9001
```

## Deployment Commands

### Docker Compose
```bash
# Start services
docker compose up -d

# View logs
docker compose logs sonarr-sidecar

# Restart specific service
docker compose restart sonarr-sidecar

# Stop and clean up
docker compose down -v
```

### Kubernetes
```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n media-stack

# View logs
kubectl logs -n media-stack deployment/sonarr -c preparr-sidecar

# Port forward for access
kubectl port-forward -n media-stack svc/sonarr-service 8989:8989
```

## Health Checks

PrepArr exposes health endpoints on the configured health port (default 9001):

- **`GET /health`** - Overall health status
- **`GET /ready`** - Readiness for traffic
- **`GET /metrics`** - Prometheus metrics (if enabled)

### Health Check Responses

**Healthy**:
```json
{
  "status": "healthy",
  "timestamp": "2023-09-08T12:00:00Z",
  "checks": {
    "database": "ok",
    "servarr": "ok", 
    "configuration": "ok"
  }
}
```

**Unhealthy**:
```json
{
  "status": "unhealthy",
  "timestamp": "2023-09-08T12:00:00Z",
  "checks": {
    "database": "ok",
    "servarr": "error",
    "configuration": "ok"
  },
  "error": "Servarr API unreachable"
}
```

## Updating Configuration

### Docker Compose
1. Edit your JSON config file
2. Restart sidecar: `docker compose restart sonarr-sidecar`
3. Changes applied automatically via file watching

### Kubernetes
1. Update ConfigMap: `kubectl apply -f config-map.yaml`
2. Restart deployment: `kubectl rollout restart deployment/sonarr -n media-stack`
3. Changes applied on pod restart

## Data Persistence

PrepArr is designed to be **stateless**:

- **Configuration** comes from JSON files (ConfigMaps in K8s)
- **Database** stored in PostgreSQL
- **Servarr config** generated at runtime and stored in shared volumes
- **Media files** stored in persistent volumes

This enables:
- GitOps workflows
- Easy disaster recovery
- Horizontal scaling
- Blue-green deployments

## Security Considerations

### Secrets Management
- Use Docker Secrets or Kubernetes Secrets for passwords
- Never hardcode credentials in configuration files
- Rotate API keys and database passwords regularly

### Network Security
- Use private networks/namespaces
- Implement ingress controllers with TLS
- Consider service mesh for mTLS

### Runtime Security
- PrepArr runs as non-root user (bun:bun)
- Use read-only root filesystems where possible
- Apply resource limits and security contexts

## Next Steps

- Review [Configuration Reference](configuration.md) for all options
- See [Troubleshooting Guide](troubleshooting.md) for common issues
- Check [Monitoring Guide](monitoring.md) for observability setup