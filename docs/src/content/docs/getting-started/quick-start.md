---
title: Quick Start
description: Get a fully configured Sonarr instance running with Docker Compose
---

This guide gets you from zero to a fully configured Sonarr instance with PostgreSQL, PrepArr, and a download client configuration.

## Prerequisites

- Docker with Docker Compose v2+
- No PostgreSQL knowledge required -- PrepArr handles it

## Step 1: Create a configuration file

Create `sonarr-config.json` with your desired Sonarr configuration:

```json
{
  "rootFolders": [
    { "path": "/tv", "accessible": true }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 1, "name": "HDTV-1080p" }, "allowed": true },
        { "quality": { "id": 2, "name": "WEBDL-1080p" }, "allowed": true },
        { "quality": { "id": 3, "name": "Bluray-1080p" }, "allowed": true }
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

## Step 2: Create the Docker Compose file

Create `docker-compose.yml`:

```yaml
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
      HEALTH_PORT: "9001"
    ports:
      - "9001:9001"
    volumes:
      - sonarr_config:/config
      - ./sonarr-config.json:/config/sonarr-config.json:ro
    depends_on:
      - sonarr

volumes:
  postgres_data:
  sonarr_config:
```

## Step 3: Start the stack

```bash
docker compose up -d
```

## Step 4: Access Sonarr

Open [http://localhost:8989](http://localhost:8989). Sonarr is fully configured with:

- PostgreSQL database connection
- Your quality profile (HD - 1080p)
- Root folder (/tv)
- qBittorrent download client

## What just happened?

1. **PostgreSQL** started and became healthy
2. **Init container** (`sonarr-init`) ran:
   - Created the Sonarr databases in PostgreSQL
   - Generated `config.xml` with an API key and database credentials
   - Completed the Sonarr setup wizard
   - Applied your JSON configuration (root folders, quality profiles, download clients)
   - Exited successfully
3. **Sonarr** started using the prepared `config.xml`
4. **Sidecar** (`sonarr-sidecar`) started watching your JSON config file for changes

Now if you edit `sonarr-config.json`, the sidecar detects the change and applies it automatically.

## Next steps

- [Core Concepts](/Preparr/getting-started/concepts/) -- Understand how PrepArr works
- [Multi-Service Stack](/Preparr/guides/multi-service-stack/) -- Add Radarr, Prowlarr, and qBittorrent
- [Configuration Overview](/Preparr/configuration/overview/) -- Explore all configuration options
