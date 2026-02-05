---
title: Examples
description: Annotated example configurations for common setups
---

PrepArr ships with example configuration files in the [`examples/`](https://github.com/robbeverhelst/Preparr/tree/main/examples) directory. Each example is a working configuration that you can copy and adapt.

## sonarr-config.json

TV show management with qBittorrent.

```json
{
  "apiKey": "2bac5d00dca43258313c734821a15c4c",
  "prowlarrSync": true,
  "rootFolders": [
    { "path": "/tv" }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 9, "name": "HDTV-1080p" }, "allowed": true },
        { "quality": { "id": 3, "name": "WEBDL-1080p" }, "allowed": true }
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
        { "name": "tvCategory", "value": "tv" }
      ]
    }
  ],
  "qbittorrent": {
    "webui": { "username": "admin", "password": "adminpass" },
    "downloads": {
      "defaultPath": "/downloads",
      "categories": ["tv", "movies"]
    },
    "connection": { "port": 6881 }
  }
}
```

**Key points:**
- `prowlarrSync: true` -- Prowlarr manages indexers, so no `indexers` array needed
- `apiKey` is set explicitly to avoid regeneration on restart
- `qbittorrent` section configures the download client directly (categories, paths)

## sonarr-config.yaml

Same setup in YAML format with multiple root folders and a manual indexer.

```yaml
rootFolders:
  - path: /tv
  - path: /anime

indexers:
  - name: NZBgeek
    implementation: Newznab
    implementationName: Newznab
    configContract: NewznabSettings
    fields:
      - name: baseUrl
        value: https://api.nzbgeek.info
      - name: apiKey
        value: your-nzbgeek-api-key
      - name: categories
        value: [5000, 5040]

downloadClients:
  - name: qBittorrent
    implementation: QBittorrent
    implementationName: qBittorrent
    configContract: QBittorrentSettings
    fields:
      - name: host
        value: qbittorrent
      - name: port
        value: 8080
      - name: username
        value: admin
      - name: password
        value: adminpass

qualityProfiles: []
```

**Key points:**
- YAML is an alternative to JSON -- both formats are supported
- Multiple root folders (`/tv` and `/anime`)
- Manual indexer configuration (no Prowlarr sync)
- Empty `qualityProfiles` array means no profiles are managed by PrepArr

## radarr-config.json

Movie management with qBittorrent and Prowlarr sync.

```json
{
  "apiKey": "3cad6e11eba54369424d835932b16d5d",
  "prowlarrSync": true,
  "rootFolders": [
    { "path": "/movies" }
  ],
  "qualityProfiles": [
    {
      "name": "1080p",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 7, "name": "Bluray-1080p" }, "allowed": true },
        { "quality": { "id": 3, "name": "WEBDL-1080p" }, "allowed": true }
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
        { "name": "username", "value": "${QBITTORRENT_USER}" },
        { "name": "password", "value": "${QBITTORRENT_PASSWORD}" },
        { "name": "movieCategory", "value": "movies" }
      ]
    }
  ],
  "qbittorrent": {
    "webui": {
      "username": "admin",
      "password": "adminpass"
    }
  }
}
```

**Key points:**
- Environment variable interpolation (`${QBITTORRENT_USER}`) for credentials
- `movieCategory` field maps downloads to a qBittorrent category
- Minimal qBittorrent section (just web UI credentials)

## prowlarr-config.json

Centralized indexer management with application sync to Sonarr and Radarr.

```json
{
  "indexers": [
    {
      "name": "The Pirate Bay",
      "implementation": "Cardigann",
      "implementationName": "Cardigann",
      "configContract": "CardigannSettings",
      "fields": [
        { "name": "definitionFile", "value": "thepiratebay" }
      ],
      "enable": true,
      "appProfileId": 1
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
        { "name": "password", "value": "adminpass" }
      ]
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
        { "name": "apiKey", "value": "sonarr-api-key" }
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
        { "name": "apiKey", "value": "radarr-api-key" }
      ],
      "syncLevel": "fullSync",
      "appProfileId": 1
    }
  ]
}
```

**Key points:**
- Prowlarr manages indexers and syncs them to both Sonarr and Radarr
- `syncLevel: "fullSync"` means Prowlarr fully manages indexers in target apps
- `applications` array defines which Servarr instances receive indexer sync
- Each application needs the target's `baseUrl` and `apiKey`

## qbittorrent-config.json

Standalone qBittorrent configuration with download categories and preferences.

```json
{
  "qbittorrent": {
    "webui": {
      "username": "admin",
      "password": "secure-password"
    },
    "downloads": {
      "defaultPath": "/downloads",
      "categories": ["movies", "tv", "music"]
    },
    "connection": {
      "port": 6881
    }
  }
}
```

**Key points:**
- Used when `SERVARR_TYPE=qbittorrent` to configure qBittorrent directly
- Categories are created automatically in qBittorrent
- `connection.port` sets the BitTorrent listening port

## bazarr-config.json

Subtitle management with Sonarr and Radarr integration.

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
      "apiKey": "sonarr-api-key"
    },
    "radarr": {
      "url": "http://radarr:7878",
      "apiKey": "radarr-api-key"
    }
  }
}
```

**Key points:**
- Used when `SERVARR_TYPE=bazarr` to configure Bazarr as a standalone service
- `languages` defines which subtitle languages to enable
- `providers` configures subtitle download sources (e.g., OpenSubtitles)
- `sonarr` and `radarr` sections link Bazarr to your existing Servarr instances
- PrepArr writes Bazarr's `config.yaml` during init (including PostgreSQL settings)

## Using These Examples

1. Copy the example that matches your setup
2. Replace placeholder values (API keys, passwords)
3. Mount the config file into the PrepArr container
4. Set environment variables for sensitive values

```bash
# Copy and customize
cp examples/sonarr-config.json my-sonarr-config.json

# Use in Docker Compose
volumes:
  - ./my-sonarr-config.json:/config/sonarr-config.json:ro
```

See the [Quick Start](/Preparr/getting-started/quick-start/) guide for a complete walkthrough.
