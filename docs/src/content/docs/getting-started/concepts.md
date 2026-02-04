---
title: Core Concepts
description: Architecture, operating modes, reconciliation loop, and configuration system
---

## Three-Container Pattern

PrepArr uses a three-container pattern for each Servarr application:

```
                    ┌─────────────────┐
                    │  Config Files   │
                    │  (JSON/YAML)    │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             │             ▼
    ┌─────────────────┐     │   ┌─────────────────┐
    │ Init Container  │     │   │    Sidecar       │
    │ (runs once)     │     │   │ (runs forever)   │
    └────────┬────────┘     │   └────────┬────────┘
             │              │            │
             ▼              │            ▼
    ┌─────────────────┐     │   ┌─────────────────┐
    │  Shared Volume  │◄────┘   │  Servarr API    │
    │  (config.xml)   │         │  (reconcile)    │
    └────────┬────────┘         └─────────────────┘
             │
             ▼
    ┌─────────────────┐
    │   Servarr App   │
    │  (Sonarr, etc)  │
    └─────────────────┘
```

1. **Init Container** -- Runs once at startup with the `--init` flag. Creates databases, generates `config.xml`, and exits.
2. **Servarr App** -- The standard Linuxserver container (Sonarr, Radarr, etc.) that mounts the prepared config.
3. **Sidecar Container** -- Runs continuously alongside the Servarr app. Watches config files, reconciles state via the Servarr API, and exposes health endpoints.

## Operating Modes

### Init Mode (`--init`)

The init container performs one-time infrastructure setup:

1. **Database setup** -- Creates PostgreSQL databases and users for the Servarr instance
2. **Config generation** -- Writes `config.xml` with database connection strings, API keys, and authentication settings
3. **API key management** -- Uses a provided API key or generates a new one
4. **Setup wizard completion** -- Creates the admin user so Servarr starts fully configured
5. **Exit** -- Exits with code 0 so the Servarr app can start

### Sidecar Mode (default)

The sidecar container runs indefinitely:

1. **Wait** -- Waits for the Servarr application to become reachable
2. **Load config** -- Reads the JSON/YAML configuration file
3. **Reconcile** -- Compares desired state against current state and applies changes via the Servarr API
4. **Watch** -- Monitors the config file for changes (if `CONFIG_WATCH=true`)
5. **Repeat** -- Runs the reconciliation loop on a configurable interval
6. **Health** -- Exposes `/health`, `/ready`, and `/metrics` endpoints

## Reconciliation Loop

The sidecar continuously reconciles your desired configuration against the running Servarr instance. Each reconciliation cycle:

1. Reads the current state from the Servarr API
2. Reads the desired state from your configuration file
3. Computes the diff (creates, updates, deletes)
4. Applies changes via the Servarr API
5. Verifies the changes were applied successfully

This means:
- **Config file changes** are detected and applied automatically
- **Manual UI changes** that conflict with your config file are reverted
- **Drift** is corrected on every reconciliation interval

## Step System

PrepArr uses a modular step system. Each step manages one aspect of configuration:

| Step | Description | Mode |
|------|-------------|------|
| `postgres-connectivity` | Verify PostgreSQL connection | Both |
| `servarr-connectivity` | Verify Servarr API connection | Both |
| `database-setup` | Create databases and users | Init |
| `config-file` | Generate config.xml | Init |
| `root-folders` | Manage root folders | Sidecar |
| `quality-profiles` | Manage quality profiles | Sidecar |
| `custom-formats` | Manage custom formats | Sidecar |
| `download-clients` | Manage download clients | Sidecar |
| `indexers` | Manage indexers | Sidecar |
| `media-management` | Manage media management settings | Sidecar |
| `naming-config` | Manage naming conventions | Sidecar |
| `quality-definitions` | Manage quality size limits | Sidecar |
| `release-profiles` | Manage release profiles (Sonarr) | Sidecar |
| `applications` | Manage Prowlarr app sync | Sidecar |

Steps declare dependencies (e.g., `quality-profiles` depends on `servarr-connectivity`). The engine executes them in dependency order.

## Configuration Priority

PrepArr loads configuration from three sources, merged in priority order (highest first):

1. **CLI arguments** -- `--postgres-host=localhost`
2. **Environment variables** -- `POSTGRES_HOST=localhost`
3. **Configuration file** -- JSON or YAML file specified by `CONFIG_PATH`
4. **Default values** -- Built-in defaults

Higher-priority sources override lower-priority ones. For example, a CLI argument overrides the same setting from an environment variable.

## Stateless Design

PrepArr is stateless by design:

- **No persistent state** is stored in the PrepArr container
- **Configuration** comes from JSON/YAML files (mounted as volumes or ConfigMaps)
- **Database state** lives in PostgreSQL
- **Servarr state** is managed via the Servarr API
- **config.xml** is regenerated on every init run

This means PrepArr containers are fully ephemeral. You can delete and recreate them at any time -- the init container will regenerate everything from your config files and PostgreSQL.
