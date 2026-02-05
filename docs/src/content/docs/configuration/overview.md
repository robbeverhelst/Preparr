---
title: Configuration Overview
description: How PrepArr configuration works - sources, merging, and file format
---

PrepArr uses a declarative configuration model. You describe the desired state of your Servarr instance in a configuration file, and PrepArr reconciles the running instance to match.

## Configuration Sources

PrepArr loads configuration from three sources, merged in priority order:

1. **CLI arguments** (highest priority) -- `--postgres-host=localhost`
2. **Environment variables** -- `POSTGRES_HOST=localhost`
3. **Configuration file** -- JSON or YAML file at `CONFIG_PATH`
4. **Default values** (lowest priority) -- Built-in defaults

Higher-priority sources override lower-priority ones for the same setting.

## Configuration File

The configuration file defines the desired state of your Servarr instance. It can be JSON or YAML, specified via the `CONFIG_PATH` environment variable.

### JSON format

```json
{
  "apiKey": "2bac5d00dca43258313c734821a15c4c",
  "prowlarrSync": true,
  "rootFolders": [
    { "path": "/tv", "accessible": true }
  ],
  "qualityProfiles": [...],
  "downloadClients": [...],
  "customFormats": [...],
  "mediaManagement": {...},
  "naming": {...}
}
```

### YAML format

```yaml
apiKey: 2bac5d00dca43258313c734821a15c4c
prowlarrSync: true
rootFolders:
  - path: /tv
    accessible: true
qualityProfiles: [...]
downloadClients: [...]
```

## Root Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `apiKey` | string | 32-character hex API key. Auto-generated if not provided. |
| `prowlarrSync` | boolean | Enable Prowlarr indexer sync. Default: `false`. |
| `rootFolders` | array | [Root folder definitions](/Preparr/configuration/root-folders/) |
| `qualityProfiles` | array | [Quality profile definitions](/Preparr/configuration/quality-profiles/) |
| `customFormats` | array | [Custom format definitions](/Preparr/configuration/custom-formats/) |
| `downloadClients` | array | [Download client definitions](/Preparr/configuration/download-clients/) |
| `indexers` | array | [Indexer definitions](/Preparr/configuration/indexers/) |
| `applications` | array | Prowlarr application sync configs |
| `mediaManagement` | object | [Media management settings](/Preparr/configuration/media-management/) |
| `naming` | object | [Naming conventions](/Preparr/configuration/naming/) |
| `qualityDefinitions` | array | Quality size limits |
| `releaseProfiles` | array | Release scoring (Sonarr only) |
| `qbittorrent` | object | qBittorrent-specific settings |
| `bazarr` | object | [Bazarr subtitle manager settings](/Preparr/configuration/bazarr/) |

## How Reconciliation Works

The sidecar compares each configuration section against the current state of the Servarr instance:

- **Create** -- Resources in your config that don't exist in Servarr are created
- **Update** -- Resources that exist but differ from your config are updated
- **Delete** -- Resources in Servarr that aren't in your config are removed (for CRUD resources)
- **Skip** -- Resources that match are left unchanged

Some configuration sections (like media management and naming) only support updates, not create/delete, since they are single-value settings rather than collections.
