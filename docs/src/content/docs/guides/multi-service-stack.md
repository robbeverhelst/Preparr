---
title: Multi-Service Stack
description: Deploy a complete Prowlarr + Sonarr + Radarr + Bazarr + qBittorrent stack
---

This guide walks through deploying a complete media automation stack with shared PostgreSQL, qBittorrent, Prowlarr managing indexers, Sonarr and Radarr for TV and movies, and Bazarr for subtitles.

## Architecture

```
PostgreSQL (shared database)
    │
    ├── qBittorrent (download client)
    │       ├── qbit-init (PrepArr)
    │       └── qbit app
    │
    ├── Prowlarr (indexer manager)
    │       ├── prowlarr-init (PrepArr)
    │       ├── prowlarr app
    │       └── prowlarr-sidecar (PrepArr)
    │               │
    │               ├── syncs indexers to Sonarr
    │               └── syncs indexers to Radarr
    │
    ├── Sonarr (TV shows)
    │       ├── sonarr-init (PrepArr)
    │       ├── sonarr app
    │       └── sonarr-sidecar (PrepArr)
    │
    ├── Radarr (Movies)
    │       ├── radarr-init (PrepArr)
    │       ├── radarr app
    │       └── radarr-sidecar (PrepArr)
    │
    └── Bazarr (Subtitles)
            ├── bazarr-init (PrepArr)
            ├── bazarr app
            └── bazarr-sidecar (PrepArr)
                    │
                    ├── integrates with Sonarr
                    └── integrates with Radarr
```

## Configuration Files

### prowlarr-config.json

Prowlarr manages indexers and syncs them to Sonarr and Radarr:

```json
{
  "indexers": [
    {
      "name": "My Indexer",
      "implementation": "Cardigann",
      "implementationName": "Cardigann",
      "configContract": "CardigannSettings",
      "definitionName": "myindexer",
      "fields": [
        { "name": "definitionFile", "value": "myindexer" },
        { "name": "baseUrl", "value": "https://myindexer.example.com/" }
      ],
      "enable": true,
      "priority": 25,
      "appProfileId": 1
    }
  ],
  "applications": [
    {
      "name": "Sonarr",
      "implementation": "Sonarr",
      "implementationName": "Sonarr",
      "configContract": "SonarrSettings",
      "fields": [
        { "name": "prowlarrUrl", "value": "http://prowlarr:9696" },
        { "name": "baseUrl", "value": "http://sonarr:8989" },
        { "name": "apiKey", "value": "SONARR_API_KEY_HERE" }
      ],
      "syncLevel": "fullSync",
      "appProfileId": 1
    },
    {
      "name": "Radarr",
      "implementation": "Radarr",
      "implementationName": "Radarr",
      "configContract": "RadarrSettings",
      "fields": [
        { "name": "prowlarrUrl", "value": "http://prowlarr:9696" },
        { "name": "baseUrl", "value": "http://radarr:7878" },
        { "name": "apiKey", "value": "RADARR_API_KEY_HERE" }
      ],
      "syncLevel": "fullSync",
      "appProfileId": 1
    }
  ]
}
```

### sonarr-config.json

Sonarr with Prowlarr sync enabled (indexers managed by Prowlarr):

```json
{
  "prowlarrSync": true,
  "rootFolders": [
    { "path": "/tv", "accessible": true }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 1, "name": "HDTV-1080p" }, "allowed": true },
        { "quality": { "id": 2, "name": "WEBDL-1080p" }, "allowed": true }
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

### radarr-config.json

```json
{
  "prowlarrSync": true,
  "rootFolders": [
    { "path": "/movies", "accessible": true }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 1, "name": "HDTV-1080p" }, "allowed": true },
        { "quality": { "id": 2, "name": "WEBDL-1080p" }, "allowed": true }
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
        { "name": "category", "value": "movies" }
      ],
      "enable": true,
      "priority": 1
    }
  ]
}
```

Note the different `category` values (`tv` vs `movies`) so downloads are organized per service.

### bazarr-config.json

Bazarr manages subtitles and integrates with both Sonarr and Radarr:

```json
{
  "apiKey": "your-bazarr-api-key-here",
  "bazarr": {
    "languages": [
      { "code": "en", "name": "English" },
      { "code": "nl", "name": "Dutch" }
    ],
    "providers": [
      { "name": "opensubtitlescom", "enabled": true }
    ],
    "sonarr": {
      "url": "http://sonarr:8989",
      "apiKey": "SONARR_API_KEY_HERE"
    },
    "radarr": {
      "url": "http://radarr:7878",
      "apiKey": "RADARR_API_KEY_HERE"
    }
  }
}
```

## Docker Compose

For the complete Docker Compose file with all services, init containers, and sidecars, see the project's [docker-compose.yml](https://github.com/robbeverhelst/Preparr/blob/main/docker-compose.yml) on GitHub.

The key pattern repeats for each service:

```yaml
services:
  # Shared database
  postgres:
    image: postgres:16-alpine
    # ...

  # Per-service: init + app + sidecar
  sonarr-init:
    image: ghcr.io/robbeverhelst/preparr:latest
    command: ["bun", "run", "dist/index.js", "--init"]
    environment:
      SERVARR_TYPE: sonarr
      # ...

  sonarr:
    image: linuxserver/sonarr:latest
    depends_on:
      sonarr-init:
        condition: service_completed_successfully

  sonarr-sidecar:
    image: ghcr.io/robbeverhelst/preparr:latest
    environment:
      SERVARR_TYPE: sonarr
      CONFIG_WATCH: "true"
      # ...
```

## How It Fits Together

1. PostgreSQL starts first
2. qBittorrent init configures the download client
3. Each Servarr init container creates its databases and config.xml
4. Bazarr init creates its database and config.yaml
5. Servarr and Bazarr apps start with prepared configs
6. Prowlarr sidecar sets up indexers and application sync
7. Sonarr/Radarr sidecars apply their configs with `prowlarrSync: true`
8. Bazarr sidecar configures languages, providers, and Sonarr/Radarr integrations
9. Prowlarr syncs indexers to Sonarr and Radarr automatically
