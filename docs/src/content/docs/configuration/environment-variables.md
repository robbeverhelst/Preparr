---
title: Environment Variables
description: Complete reference for all PrepArr environment variables
---

## Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_HOST` | Yes | - | PostgreSQL server hostname |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | No | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | - | PostgreSQL password |
| `POSTGRES_DB` | No | `servarr` | PostgreSQL database name |
| `SERVARR_URL` | Yes | - | Full URL to Servarr application (e.g., `http://sonarr:8989`) |
| `SERVARR_TYPE` | Yes | - | Service type: `sonarr`, `radarr`, `prowlarr`, `lidarr`, `readarr`, `qbittorrent`, `auto` |
| `SERVARR_ADMIN_USER` | No | `admin` | Admin username for Servarr |
| `SERVARR_ADMIN_PASSWORD` | Yes* | - | Admin password (*required for init containers) |
| `CONFIG_PATH` | Yes | - | Path to JSON/YAML configuration file |

## Application Behavior

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONFIG_WATCH` | No | `true` | Enable configuration file watching |
| `CONFIG_RECONCILE_INTERVAL` | No | `60` | Reconciliation interval in seconds |
| `HEALTH_PORT` | No | `8080` | Health check endpoint port |
| `LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `json` | Log format: `json` or `pretty` |

## Service Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QBITTORRENT_URL` | No | - | qBittorrent Web UI URL |
| `QBITTORRENT_USERNAME` | No | - | qBittorrent Web UI username |
| `QBITTORRENT_PASSWORD` | No | - | qBittorrent Web UI password |
| `PROWLARR_URL` | No | - | Prowlarr base URL |
| `PROWLARR_API_KEY` | No | - | Prowlarr API key |

## Notes

- All environment variables can also be set via [CLI flags](/Preparr/reference/cli/) using kebab-case (e.g., `--postgres-host`)
- `SERVARR_ADMIN_PASSWORD` is only required for init containers that need to create the admin user
- `SERVARR_TYPE=auto` attempts to detect the service type from the URL
