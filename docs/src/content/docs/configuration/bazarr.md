---
title: Bazarr
description: Configure Bazarr subtitle management with PrepArr
---

Bazarr is a subtitle management application that integrates with Sonarr and Radarr. PrepArr automates Bazarr's setup including database configuration, language selection, subtitle providers, and Sonarr/Radarr integration.

## Deployment Modes

PrepArr supports two modes for Bazarr:

### Standalone mode

Set `SERVARR_TYPE=bazarr` to run PrepArr as a sidecar alongside a Bazarr container. PrepArr manages Bazarr's `config.yaml` (PostgreSQL connection, API key) during init, then configures languages, providers, and integrations via the Bazarr API in sidecar mode.

```bash
SERVARR_TYPE=bazarr
BAZARR_URL=http://localhost:6767
BAZARR_API_KEY=your-bazarr-api-key
POSTGRES_HOST=postgres
POSTGRES_PASSWORD=postgres123
CONFIG_PATH=/config/bazarr-config.json
```

### Remote service mode

When running PrepArr alongside Sonarr or Radarr (`SERVARR_TYPE=sonarr`), you can also configure a remote Bazarr instance by setting `BAZARR_URL` and `BAZARR_API_KEY`. PrepArr will configure both the Servarr instance and the Bazarr instance.

## Configuration

Bazarr settings live under the `bazarr` key in the configuration file:

```json
{
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
      "apiKey": "your-sonarr-api-key"
    },
    "radarr": {
      "url": "http://radarr:7878",
      "apiKey": "your-radarr-api-key"
    }
  }
}
```

## Languages

Define which languages Bazarr should search subtitles for:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `code` | string | Yes | -- | ISO 639-1 language code (e.g., `en`, `nl`, `fr`) |
| `name` | string | Yes | -- | Language display name |
| `enabled` | boolean | No | `true` | Whether to enable this language |

```json
{
  "bazarr": {
    "languages": [
      { "code": "en", "name": "English" },
      { "code": "nl", "name": "Dutch" },
      { "code": "fr", "name": "French" }
    ]
  }
}
```

## Subtitle Providers

Configure where Bazarr downloads subtitles from:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | -- | Provider name (e.g., `opensubtitlescom`, `addic7ed`) |
| `enabled` | boolean | No | `true` | Whether to enable this provider |
| `settings` | object | No | `{}` | Provider-specific settings (credentials, etc.) |

```json
{
  "bazarr": {
    "providers": [
      { "name": "opensubtitlescom", "enabled": true },
      { "name": "addic7ed", "enabled": true }
    ]
  }
}
```

## Subtitle Defaults

Configure default subtitle behavior:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `seriesType` | string | `hearing_impaired_preferred` | Series subtitle type preference |
| `movieType` | string | `hearing_impaired_preferred` | Movie subtitle type preference |
| `searchOnUpgrade` | boolean | `true` | Search for subtitles when media is upgraded |
| `searchOnDownload` | boolean | `true` | Search for subtitles when media is downloaded |

## Sonarr/Radarr Integration

Link Bazarr to your Sonarr and Radarr instances so it knows which media libraries to manage subtitles for:

```json
{
  "bazarr": {
    "sonarr": {
      "url": "http://sonarr:8989",
      "apiKey": "your-sonarr-api-key"
    },
    "radarr": {
      "url": "http://radarr:7878",
      "apiKey": "your-radarr-api-key"
    }
  }
}
```

Both `sonarr` and `radarr` sections are optional -- configure whichever services you use.

## How Init Mode Works for Bazarr

Unlike Servarr applications that use `config.xml`, Bazarr uses `config.yaml`. During init mode, PrepArr:

1. Creates the `bazarr` PostgreSQL database and user
2. Writes `/config/config/config.yaml` with the API key and PostgreSQL connection settings
3. Exits so the Bazarr container can start with the prepared config

The sidecar then takes over to configure languages, providers, and integrations via the Bazarr API.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BAZARR_URL` | Bazarr base URL (default: `http://localhost:6767` in standalone mode) |
| `BAZARR_API_KEY` | Bazarr API key for authentication |

See [Environment Variables](/Preparr/configuration/environment-variables/) for the full list.
