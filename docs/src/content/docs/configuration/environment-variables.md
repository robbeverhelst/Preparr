---
title: Environment Variables
description: Complete reference for all PrepArr environment variables
---

## Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_HOST` | No | `localhost` | PostgreSQL server hostname |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | No | `postgres` | PostgreSQL username (alias: `POSTGRES_USERNAME`) |
| `POSTGRES_PASSWORD` | Yes | - | PostgreSQL password |
| `POSTGRES_DB` | No | `servarr` | PostgreSQL database name (alias: `POSTGRES_DATABASE`) |
| `POSTGRES_LOG_DATABASE_ENABLED` | No | `true` | Create a separate `_log` database for each Servarr instance |
| `POSTGRES_SKIP_PROVISIONING` | No | `false` | Skip database/user provisioning (for pre-provisioned databases) |
| `SERVARR_URL` | Yes | - | Full URL to Servarr application (e.g., `http://sonarr:8989`) |
| `SERVARR_TYPE` | No | `auto` | Service type: `sonarr`, `radarr`, `prowlarr`, `lidarr`, `readarr`, `qbittorrent`, `bazarr`, `auto` |
| `SERVARR_ADMIN_USER` | No | `admin` | Admin username for Servarr |
| `SERVARR_ADMIN_PASSWORD` | Yes* | - | Admin password (*required for Servarr types, not bazarr/qbittorrent) |
| `SERVARR_API_KEY` | No | - | 32-character hex API key for the Servarr instance |
| `SERVARR_AUTHENTICATION_METHOD` | No | `forms` | Servarr authentication method: `forms` or `basic` |
| `CONFIG_PATH` | No | `/config/servarr.yaml` | Path to JSON/YAML/TOML configuration file |

## Application Behavior

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONFIG_WATCH` | No | `true` | Enable configuration file watching |
| `CONFIG_RECONCILE_INTERVAL` | No | `60` | Reconciliation interval in seconds |
| `HEALTH_PORT` | No | `8080` | Health check endpoint port |
| `LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `json` | Log format: `json` or `pretty` |

`LOG_LEVEL` and `LOG_FORMAT` are read by the logger directly from the environment at startup. The equivalent CLI flags and config-file keys (`logLevel`, `logFormat`) are accepted but do not change log output.

## Service Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QBITTORRENT_URL` | No | - | qBittorrent Web UI URL |
| `QBITTORRENT_USER` | No | - | qBittorrent Web UI username (alias: `QBITTORRENT_USERNAME`) |
| `QBITTORRENT_PASSWORD` | No | - | qBittorrent Web UI password |
| `PROWLARR_URL` | No | - | Prowlarr base URL |
| `PROWLARR_API_KEY` | No | - | Prowlarr API key |
| `BAZARR_URL` | No | - | Bazarr base URL |
| `BAZARR_API_KEY` | No | - | Bazarr API key |

## Application Config (`app.*`)

These override the matching keys under `app` in the configuration file. Array/object values are passed as JSON.

| Variable | Maps to |
|----------|---------|
| `APP_API_KEY` | `app.apiKey` |
| `APP_PROWLARR_SYNC` | `app.prowlarrSync` |
| `APP_ROOT_FOLDERS` | `app.rootFolders` |
| `APP_INDEXERS` | `app.indexers` |
| `APP_DOWNLOAD_CLIENTS` | `app.downloadClients` |
| `APP_QUALITY_PROFILES` | `app.qualityProfiles` |
| `APP_APPLICATIONS` | `app.applications` |
| `APP_QBITTORRENT` | `app.qbittorrent` |

## Notes

- Most environment variables can also be set via [CLI flags](/reference/cli/) using kebab-case (e.g., `--postgres-host`). Exceptions with no CLI flag: `POSTGRES_SKIP_PROVISIONING` and `SERVARR_AUTHENTICATION_METHOD`
- `SERVARR_ADMIN_PASSWORD` is only required for Servarr types (sonarr, radarr, prowlarr, etc.), not for bazarr or qbittorrent
- `SERVARR_TYPE=auto` attempts to detect the service type from the URL
- When `SERVARR_TYPE=bazarr`, PrepArr manages Bazarr's `config.yaml` (not `config.xml`) and uses `BAZARR_URL`/`BAZARR_API_KEY` for API access
