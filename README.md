# PrepArr

[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
[![Renovate enabled](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A lightweight Docker sidecar for complete Servarr initialization and automation

## 🎯 Overview

PrepArr is a Docker sidecar container that solves the "manual setup problem" with Servarr applications. It fully automates Servarr instance initialization, eliminating the need for manual configuration steps. While designed with Kubernetes in mind, PrepArr works in any Docker environment.

### The Problem PrepArr Solves

Fresh Servarr instances require extensive manual setup:
- 🔑 **Manual API key generation** - Extract API keys from config files after first startup
- 👤 **Initial user creation** - Set up authentication through the web UI
- 🔗 **Service linking** - Manually connect to qBittorrent, Prowlarr, NZBGet, etc.
- ⚙️ **Profile configuration** - Create quality profiles, root folders, indexers
- 🎛️ **Settings management** - Configure download clients, metadata providers

### PrepArr's Solution

PrepArr "prepares" your Servarr instances from config files to fully working systems:
- **Zero manual steps** - Complete automation from deployment to ready-to-use
- **Stateless** - No persistent configuration files needed
- **Reproducible** - Identical setups across environments
- **GitOps-ready** - Configuration stored in version control
- **Environment migration** - Easy dev → staging → prod deployments

## ✨ Features

- 🚀 **Complete Automation** - From deployment to fully configured Servarr instance
- 🔑 **API Key Management** - Automatically generates and configures API keys
- 👤 **User Setup** - Creates initial admin users and authentication
- 🔗 **Service Integration** - Links qBittorrent, Prowlarr, and other services automatically
- 🗄️ **Database Setup** - PostgreSQL initialization with users, roles, and permissions
- 🔧 **Full Configuration** - Quality profiles, root folders, indexers, download clients
- 🔄 **Continuous Sync** - Watches and applies configuration changes in real-time
- 📦 **Lightweight** - Docker image < 100MB
- 🎮 **Multi-App Support** - Sonarr, Radarr, Lidarr, Readarr, Prowlarr
- 🔒 **Secure** - Credentials via environment variables (Docker Secrets, K8s Secrets, etc.)

## 🚀 Quick Start

### Prerequisites

- Docker or Kubernetes environment
- PostgreSQL database (14+)
- Servarr application (Radarr/Sonarr/etc.)

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonarr
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
      containers:
        # Main Sonarr container
        - name: sonarr
          image: linuxserver/sonarr:latest
          ports:
            - containerPort: 8989
          env:
            - name: PUID
              value: "1000"
            - name: PGID
              value: "1000"

        # PrepArr sidecar
        - name: preparr
          image: ghcr.io/robbeverhelst/preparr:latest
          env:
            - name: SERVARR_URL
              value: "http://localhost:8989"
            - name: SERVARR_TYPE
              value: "sonarr"
            - name: POSTGRES_HOST
              value: postgres.default.svc.cluster.local
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: username
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: password
          volumeMounts:
            - name: config
              mountPath: /config
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10

      volumes:
        - name: config
          configMap:
            name: sonarr-config
```

### Configuration

Create a ConfigMap with your desired Servarr configuration:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sonarr-config
data:
  config.yaml: |
    apiVersion: preparr.io/v1
    kind: ServarrConfig
    metadata:
      name: sonarr-config
    spec:
      postgres:
        databases:
          - name: sonarr_main
          - name: sonarr_log
        users:
          - name: sonarr
            password: ${SONARR_DB_PASSWORD}
            databases: [sonarr_main, sonarr_log]
      
      servarr:
        profiles:
          - name: "HD-1080p"
            cutoff: HDTV-1080p
            items:
              - quality: HDTV-1080p
                allowed: true
              - quality: WEBDL-1080p
                allowed: true
        
        rootFolders:
          - path: /tv
            
        indexers:
          - name: "NZBgeek"
            type: newznab
            url: https://api.nzbgeek.info
            apiKey: ${NZBGEEK_API_KEY}
        
        downloadClients:
          - name: "qBittorrent"
            type: qbittorrent
            host: qbittorrent.default.svc.cluster.local
            port: 8080
            username: ${QBITTORRENT_USER}
            password: ${QBITTORRENT_PASSWORD}
            
        prowlarr:
          url: http://prowlarr.default.svc.cluster.local:9696
          apiKey: ${PROWLARR_API_KEY}
```

### Docker Compose Deployment

PrepArr also works great with Docker Compose:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: servarr
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  sonarr:
    image: linuxserver/sonarr:latest
    environment:
      PUID: 1000
      PGID: 1000
    volumes:
      - sonarr_config:/config
      - ${MEDIA_PATH}:/tv
    ports:
      - "8989:8989"

  preparr:
    image: ghcr.io/robbeverhelst/preparr:latest
    environment:
      SERVARR_URL: http://sonarr:8989
      SERVARR_TYPE: sonarr
      SERVARR_ADMIN_USER: admin
      SERVARR_ADMIN_PASSWORD: ${SERVARR_ADMIN_PASSWORD}
      POSTGRES_HOST: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: servarr
      QBITTORRENT_URL: http://qbittorrent:8080
      QBITTORRENT_USER: ${QBITTORRENT_USER}
      QBITTORRENT_PASSWORD: ${QBITTORRENT_PASSWORD}
    volumes:
      - ./config.yaml:/config/config.yaml:ro
    depends_on:
      - postgres
      - sonarr

volumes:
  postgres_data:
  sonarr_config:
```

## 📋 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERVARR_URL` | URL of Servarr application | - | ✅ |
| `SERVARR_ADMIN_USER` | Initial admin username | admin | ❌ |
| `SERVARR_ADMIN_PASSWORD` | Initial admin password | - | ✅ |
| `SERVARR_TYPE` | Type of Servarr app | auto-detect | ❌ |
| `POSTGRES_HOST` | PostgreSQL hostname | localhost | ❌ |
| `POSTGRES_PORT` | PostgreSQL port | 5432 | ❌ |
| `POSTGRES_USER` | PostgreSQL username | postgres | ❌ |
| `POSTGRES_PASSWORD` | PostgreSQL password | - | ✅ |
| `POSTGRES_DB` | PostgreSQL database | servarr | ❌ |
| `CONFIG_PATH` | Path to config file | /config/config.yaml | ❌ |
| `CONFIG_WATCH` | Enable config watching | true | ❌ |
| `CONFIG_RECONCILE_INTERVAL` | Reconciliation interval (seconds) | 60 | ❌ |
| `LOG_LEVEL` | Logging level | info | ❌ |
| `LOG_FORMAT` | Log format (json/pretty) | json | ❌ |

## 🏗️ Architecture

PrepArr follows a simple architecture pattern:

```
┌─────────────────────────────────────┐
│      Docker Environment             │
│   (Compose, K8s Pod, etc.)          │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │   Servarr   │  │   PrepArr    │ │
│  │  (Sonarr)   │◄─┤   Sidecar    │ │
│  └─────────────┘  └──────┬───────┘ │
│                          │         │
└──────────────────────────┼─────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    └──────────────┘
```

### Components

1. **Configuration Loader** - Reads and validates configuration from files or mounted volumes
2. **PostgreSQL Manager** - Handles database initialization and management
3. **Servarr Configurator** - Applies configuration via Servarr APIs using TsArr
4. **File Watcher** - Monitors configuration changes and triggers reconciliation
5. **Health Server** - Provides health endpoints for container orchestration

## 🛠️ Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Node.js >= 20.0.0 (for some tooling)
- Docker (for building images)

### Setup

```bash
# Clone the repository
git clone https://github.com/robbeverhelst/preparr.git
cd preparr

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Build for production
bun run build
```

### Project Structure

```
preparr/
├── src/
│   ├── index.ts           # Entry point
│   ├── config/            # Configuration management
│   ├── postgres/          # Database initialization
│   ├── servarr/           # Servarr API client
│   ├── watcher/           # File watching
│   └── utils/             # Utilities
├── tests/                 # Test files
├── docker/                # Docker files
└── k8s/                   # Kubernetes examples
```

## 🧪 Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

## 🐳 Docker

### Building

```bash
# Build locally
docker build -t preparr:local .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t preparr:local .
```

### Image Details

- Base: Alpine Linux / Distroless
- Size: < 100MB
- User: Non-root (uid 1000)
- Health check: Built-in

## 📦 Helm Chart

Coming soon! Track progress in [#1](https://github.com/robbeverhelst/preparr/issues/1)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `test:` Test additions/changes
- `refactor:` Code refactoring

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Servarr Community](https://wiki.servarr.com/) for the amazing media management applications
- [TsArr](https://github.com/robbeverhelst/TsArr) for the TypeScript Servarr API client
- All contributors and users of this project

## 🔗 Links

- [Documentation](https://github.com/robbeverhelst/preparr/wiki)
- [Issue Tracker](https://github.com/robbeverhelst/preparr/issues)
- [Discussions](https://github.com/robbeverhelst/preparr/discussions)
- [Changelog](CHANGELOG.md)

## 📊 Status

- [ ] PostgreSQL initialization
- [ ] Servarr API configuration
- [ ] Configuration watching
- [ ] Health endpoints
- [ ] Helm chart
- [ ] Multi-instance support
- [ ] GitOps integration
- [ ] Metrics export

## 🚦 Roadmap

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for detailed roadmap and milestones.

---

Made with ❤️ for the Servarr community