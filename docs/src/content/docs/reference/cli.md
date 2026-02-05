---
title: CLI Flags
description: Command-line arguments for the PrepArr container
---

PrepArr accepts CLI flags to override configuration from environment variables and config files. CLI flags have the **highest priority** in the configuration hierarchy.

## Configuration Priority

1. **CLI arguments** (highest)
2. Environment variables
3. Configuration file (JSON/YAML)
4. Default values (lowest)

## Special Flags

| Flag | Description |
|------|-------------|
| `--init` | Run in init mode: set up databases, generate `config.xml`, then exit |
| `--help`, `-h` | Show help message and exit |
| `--version`, `-v` | Show version information and exit |
| `--generate-api-key` | Generate a new 32-character hex API key and exit |

### Init Mode

```bash
# Run as init container
docker run --rm ghcr.io/robbeverhelst/preparr:latest --init
```

Init mode performs one-time setup:
1. Creates PostgreSQL databases and users
2. Generates `config.xml` with API key and database connection
3. Exits with code 0 on success

### Generate API Key

```bash
docker run --rm ghcr.io/robbeverhelst/preparr:latest --generate-api-key
# Output: 2bac5d00dca43258313c734821a15c4c
```

## Configuration Flags

All flags support both `--key=value` and `--key value` syntax.

### PostgreSQL

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--postgres-host` | `POSTGRES_HOST` | `localhost` | Database host |
| `--postgres-port` | `POSTGRES_PORT` | `5432` | Database port |
| `--postgres-user` | `POSTGRES_USER` | `postgres` | Database username |
| `--postgres-username` | `POSTGRES_USERNAME` | `postgres` | Alias for `--postgres-user` |
| `--postgres-password` | `POSTGRES_PASSWORD` | — | Database password (required) |
| `--postgres-db` | `POSTGRES_DB` | `servarr` | Database name |
| `--postgres-database` | `POSTGRES_DATABASE` | `servarr` | Alias for `--postgres-db` |

### Servarr

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--servarr-url` | `SERVARR_URL` | — | Instance URL (e.g., `http://sonarr:8989`) |
| `--servarr-type` | `SERVARR_TYPE` | `auto` | App type: `sonarr`, `radarr`, `lidarr`, `readarr`, `prowlarr`, `qbittorrent`, `auto` |
| `--servarr-api-key` | `SERVARR_API_KEY` | — | 32-character hex API key |
| `--servarr-admin-user` | `SERVARR_ADMIN_USER` | `admin` | Admin username |
| `--servarr-admin-password` | `SERVARR_ADMIN_PASSWORD` | — | Admin password (required) |

### Service Integration

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--qbittorrent-url` | `QBITTORRENT_URL` | — | qBittorrent web UI URL |
| `--qbittorrent-user` | `QBITTORRENT_USER` | — | qBittorrent username |
| `--qbittorrent-username` | `QBITTORRENT_USERNAME` | — | Alias for `--qbittorrent-user` |
| `--qbittorrent-password` | `QBITTORRENT_PASSWORD` | — | qBittorrent password |
| `--prowlarr-url` | `PROWLARR_URL` | — | Prowlarr URL |
| `--prowlarr-api-key` | `PROWLARR_API_KEY` | — | Prowlarr API key |

### Application Config

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--app-api-key` | `APP_API_KEY` | — | Application API key |
| `--app-prowlarr-sync` | `APP_PROWLARR_SYNC` | `false` | Enable Prowlarr sync |
| `--app-root-folders` | `APP_ROOT_FOLDERS` | `[]` | Root folders (JSON array or comma-separated) |
| `--app-indexers` | `APP_INDEXERS` | — | Indexers (JSON array) |
| `--app-download-clients` | `APP_DOWNLOAD_CLIENTS` | `[]` | Download clients (JSON array) |
| `--app-quality-profiles` | `APP_QUALITY_PROFILES` | `[]` | Quality profiles (JSON array) |
| `--app-applications` | `APP_APPLICATIONS` | `[]` | Applications (JSON array) |
| `--app-qbittorrent` | `APP_QBITTORRENT` | — | qBittorrent config (JSON object) |

### Health & Logging

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--health-port` | `HEALTH_PORT` | `9001` | Health endpoint port |
| `--log-level` | `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `--log-format` | `LOG_FORMAT` | `pretty` | Log format: `json`, `pretty` |

### File & Reconciliation

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--config-path` | `CONFIG_PATH` | — | Path to configuration file |
| `--config-watch` | `CONFIG_WATCH` | `false` | Watch config file for changes |
| `--config-reconcile-interval` | `CONFIG_RECONCILE_INTERVAL` | `60` | Reconciliation interval in seconds |

## Examples

### Override log level

```bash
docker run ghcr.io/robbeverhelst/preparr:latest --log-level=debug
```

### Pass inline configuration

```bash
docker run ghcr.io/robbeverhelst/preparr:latest \
  --servarr-url=http://sonarr:8989 \
  --servarr-type=sonarr \
  --servarr-admin-password=mypassword \
  --postgres-host=postgres \
  --postgres-password=dbpassword \
  --app-root-folders='[{"path":"/tv"}]'
```

### Init mode with custom database

```bash
docker run --rm ghcr.io/robbeverhelst/preparr:latest \
  --init \
  --postgres-host=postgres \
  --postgres-password=dbpassword \
  --servarr-type=sonarr \
  --servarr-admin-password=mypassword
```
