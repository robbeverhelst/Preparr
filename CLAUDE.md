# PrepArr Project Context for Claude

## Project Overview
PrepArr is a lightweight Docker sidecar designed to run alongside Servarr applications (Radarr, Sonarr, Lidarr, etc.) in any Docker environment. It solves the "manual setup problem" by fully automating Servarr instance initialization - no more manual API key generation, user creation, or service linking. PrepArr "prepares" your Servarr instances from config files to fully working, initialized systems. While optimized for Kubernetes, it works equally well with Docker Compose, Swarm, or any container orchestration platform.

## Technology Stack
- **Runtime**: Bun (latest) - https://bun.sh/docs
- **Language**: TypeScript
- **API Client**: TsArr (https://github.com/robbeverhelst/TsArr)
- **Database**: PostgreSQL (via Bun's native SQL API)
- **File Watching**: Bun.file() + filesystem watching APIs
- **HTTP Client**: Native fetch() API
- **Validation**: Zod
- **Logging**: Native console with custom formatting
- **Code Quality**: Biome (linting & formatting)
- **Release Management**: Semantic Release
- **Dependency Updates**: Renovate

## Bun Native Features to Leverage
- **Bun.file()**: For reading configuration files efficiently
- **Bun.spawn()**: For running shell commands (psql, etc.)
- **Bun.build()**: For bundling if needed
- **Built-in test runner**: `bun test` instead of external frameworks
- **Native fetch()**: For HTTP requests where Axios isn't needed
- **File system watching**: Use Bun's native file watching capabilities
- **Environment variables**: Bun.env for accessing environment variables
- **Process management**: Native process handling and signal management
- **Bun SQL**: Native SQL API with PostgreSQL support via `sql` tagged template literals

## Key Commands
```bash
# Development
bun run dev          # Run with watch mode
bun run build        # Build for production
bun run start        # Run production build
bun test            # Run tests
bun test --watch    # Run tests in watch mode

# Code Quality
bun run lint        # Check code with Biome
bun run lint:fix    # Fix linting issues
bun run format      # Format code with Biome
bun run typecheck   # Type checking with TypeScript

# Release
bun run semantic-release  # Automated versioning and release
```

## Project Structure
```
preparr/
├── src/
│   ├── index.ts           # Main entry point
│   └── utils/
│       └── logger.ts      # Native console logger with formatting
# Directories will be created as needed during implementation:
# ├── config/               # Configuration management (Zod schemas, loaders)
# ├── postgres/             # PostgreSQL initialization
# ├── servarr/              # Servarr API interactions (TsArr client)
# └── health/               # Health check endpoints
```

## Architecture Principles
1. **Stateless Operation**: No persistent state stored in the container
2. **Declarative Configuration**: All config driven by IaC sources
3. **Reconciliation Loop**: Continuously apply desired state
4. **Fail-Safe**: Graceful handling of API/DB failures
5. **Observability**: Comprehensive logging and optional metrics

## Core Responsibilities
1. **Complete Servarr Initialization**
   - Initial user and authentication setup
   - API key generation and configuration
   - Database connection establishment
   - First-run wizard automation

2. **Service Integration**
   - Automatic qBittorrent connection and configuration
   - Prowlarr indexer synchronization
   - Download client setup (SABnzbd, NZBGet, etc.)
   - Notification service configuration

3. **PostgreSQL Setup**
   - Create databases, users, and roles
   - Apply schema migrations
   - Verify connectivity and permissions

4. **Full Configuration Management**
   - Quality profiles and custom formats
   - Root folders and path mappings
   - Indexer configuration and testing
   - Download client settings and categories
   - Metadata providers and naming conventions

5. **Configuration Watching**
   - Monitor ConfigMaps/Secrets for changes
   - Detect changes via Bun's native file watching
   - Apply updates via API with conflict resolution

6. **Health Monitoring**
   - Liveness probe endpoint
   - Readiness probe endpoint
   - Configuration drift detection
   - Service connectivity validation

## Environment Variables
```bash
# PostgreSQL
POSTGRES_HOST=postgres.default.svc.cluster.local
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secretpassword
POSTGRES_DB=servarr

# Servarr Configuration
SERVARR_URL=http://sonarr:8989
SERVARR_TYPE=sonarr  # sonarr|radarr|lidarr|readarr|prowlarr
SERVARR_ADMIN_USER=admin
SERVARR_ADMIN_PASSWORD=your-secure-password

# Service Integration
QBITTORRENT_URL=http://qbittorrent:8080
QBITTORRENT_USER=admin
QBITTORRENT_PASSWORD=adminpass
PROWLARR_URL=http://prowlarr:9696
PROWLARR_API_KEY=prowlarr-api-key

# Configuration
CONFIG_PATH=/config/servarr.yaml
CONFIG_WATCH=true
CONFIG_RECONCILE_INTERVAL=60  # seconds

# Logging
LOG_LEVEL=info  # debug|info|warn|error
LOG_FORMAT=json  # json|pretty
```

## Configuration Format (YAML)
```yaml
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
      - name: "1080p"
        cutoff: 1080p
        items:
          - quality: HDTV-1080p
            allowed: true
    
    rootFolders:
      - path: /tv
        
    indexers:
      - name: "NZBgeek"
        type: newznab
        url: https://api.nzbgeek.info
        apiKey: ${NZBGEEK_API_KEY}
```

## Testing Strategy
- Unit tests for individual components
- Integration tests with test containers
- E2E tests in Kind/Minikube cluster
- Configuration validation tests
- API mock tests using MSW

## Docker Image Goals
- Base: Alpine Linux or Distroless
- Size: < 100MB
- Multi-stage build
- Non-root user
- Security scanning with Trivy

## Deployment Models
1. **Docker Sidecar**: Run alongside each Servarr instance (Docker Compose, Swarm)
2. **Kubernetes Sidecar**: Run in same pod as Servarr container
3. **Init Container**: One-time setup before main container starts
4. **Standalone Service**: Manage multiple Servarr instances remotely
5. **CronJob/Scheduled**: Periodic reconciliation and drift correction

## Error Handling
- Exponential backoff for API retries
- Circuit breaker for database connections
- Graceful degradation on config errors
- Detailed error logging with context

## Security Considerations
- All secrets via environment variables (Docker Secrets, K8s Secrets, .env files)
- No hardcoded credentials anywhere
- Least privilege database access
- Network security (pod communication policies, firewall rules)
- Access control for configuration files (RBAC in K8s, file permissions in Docker)

## Performance Targets
- Startup time: < 5 seconds
- Config reconciliation: < 10 seconds
- Memory usage: < 50MB
- CPU usage: < 0.1 cores idle

## Future Enhancements
- GitOps integration (pull from Git)
- Multi-Servarr support (manage multiple instances)
- Backup/restore functionality
- Prometheus metrics exporter
- Web UI for configuration management
- Helm chart publication

## Development Guidelines
1. Use async/await for all I/O operations
2. Validate all external inputs with Zod
3. Leverage Bun's native APIs whenever possible (Bun.file(), Bun.spawn(), etc.)
4. Use native console logging with structured formatting
5. Handle all errors gracefully
6. Write tests using Bun's built-in test runner
7. Follow semantic commit messages
8. Update documentation as needed
9. Prefer native fetch() over Axios when simple HTTP requests suffice
10. Use Bun.env for environment variable access

## Commit Message Format
```
type(scope): description

[optional body]

[optional footer(s)]
```

Types: feat, fix, docs, style, refactor, test, chore

## Resources
- TsArr Documentation: https://robbeverhelst.github.io/TsArr/
- TsArr GitHub: https://github.com/robbeverhelst/TsArr
- Servarr Wiki: https://wiki.servarr.com/
- Kubernetes Sidecar Pattern: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
- Bun Documentation: https://bun.sh/docs

## Notes for Implementation
- Start with PostgreSQL initialization as it's the foundation
- Use TsArr for all Servarr API interactions
- Leverage Bun's native file system APIs for configuration reading
- Use Bun's native SQL API for PostgreSQL operations instead of external drivers
- Implement health checks early for debugging using Bun's HTTP server
- Consider using feature flags for gradual rollout
- Document all configuration options thoroughly
- Provide comprehensive examples for common scenarios
- Create directories only when needed during implementation

## Bun-Specific Implementation Notes
- Use `Bun.file().watch()` for configuration file monitoring instead of chokidar
- Use `Bun.spawn()` for running psql commands
- Use `Bun.env` instead of process.env for environment variables
- Leverage Bun's fast JSON parsing for configuration files
- Use Bun's built-in HTTP server for health endpoints
- Use native fetch() for all HTTP requests (TsArr handles Servarr APIs)
- Use `import { sql } from "bun"` for PostgreSQL database operations