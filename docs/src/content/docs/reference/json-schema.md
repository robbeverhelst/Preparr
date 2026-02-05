---
title: JSON Schema Reference
description: Complete configuration schema reference for PrepArr config files
---

This page documents every field available in PrepArr configuration files. The schema is validated using [Zod](https://zod.dev/) at startup and on every reconciliation cycle.

## Root Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `apiKey` | string | No | Auto-generated | 32-character hex API key for the Servarr instance |
| `prowlarrSync` | boolean | No | `false` | Skip indexer management (let Prowlarr handle it) |
| `rootFolders` | RootFolder[] | No | `[]` | Media root folder paths |
| `qualityProfiles` | QualityProfile[] | No | `[]` | Quality profile definitions |
| `customFormats` | CustomFormat[] | No | `[]` | Custom format definitions (Sonarr v4+, Radarr) |
| `downloadClients` | DownloadClient[] | No | `[]` | Download client configurations |
| `indexers` | Indexer[] | No | *undefined* | Indexer configurations (omit to leave unchanged) |
| `applications` | Application[] | No | `[]` | Prowlarr application sync targets |
| `qbittorrent` | QBittorrentConfig | No | — | qBittorrent direct configuration |
| `bazarr` | BazarrConfig | No | — | Bazarr subtitle manager configuration |
| `releaseProfiles` | ReleaseProfile[] | No | `[]` | Release profiles (Sonarr only) |
| `naming` | NamingConfig | No | — | File and folder naming settings |
| `mediaManagement` | MediaManagementConfig | No | — | Import, permissions, and file handling |
| `qualityDefinitions` | QualityDefinition[] | No | `[]` | Quality size limit overrides |

---

## RootFolder

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | — | Absolute path to the media folder |
| `accessible` | boolean | No | `true` | Whether the path should be accessible |
| `freeSpace` | number | No | — | Expected free space in bytes |
| `unmappedFolders` | string[] | No | `[]` | Subfolders to exclude from library scans |

```json
{
  "rootFolders": [
    { "path": "/tv", "accessible": true },
    { "path": "/anime", "accessible": true }
  ]
}
```

---

## QualityProfile

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Profile display name |
| `cutoff` | number | Yes | — | Quality ID where upgrades stop |
| `items` | QualityItem[] | Yes | — | Quality tiers and their allowed status |
| `formatItems` | FormatItem[] | No | `[]` | Custom format scoring |
| `minFormatScore` | number | No | `0` | Minimum custom format score to download |
| `cutoffFormatScore` | number | No | `0` | Custom format score where upgrades stop |
| `upgradeAllowed` | boolean | No | `true` | Allow quality upgrades |

### QualityItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quality` | object | Yes | `{ id: number, name: string }` |
| `allowed` | boolean | Yes | Whether this quality is acceptable |

### FormatItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | Custom format name (matched by name) |
| `score` | number | Yes | Score to assign when this format matches |

```json
{
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "upgradeAllowed": true,
      "items": [
        { "quality": { "id": 7, "name": "Bluray-1080p" }, "allowed": true },
        { "quality": { "id": 3, "name": "WEBDL-1080p" }, "allowed": true },
        { "quality": { "id": 9, "name": "HDTV-1080p" }, "allowed": true }
      ],
      "formatItems": [
        { "format": "x265", "score": 100 }
      ],
      "minFormatScore": 0,
      "cutoffFormatScore": 0
    }
  ]
}
```

---

## CustomFormat

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | number | No | — | Existing format ID (for updates) |
| `name` | string | Yes | — | Custom format name |
| `includeCustomFormatWhenRenaming` | boolean | No | `false` | Include in file renaming |
| `specifications` | Specification[] | No | `[]` | Matching conditions |

### Specification

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Specification name |
| `implementation` | string | Yes | — | Matching type (e.g., `ReleaseTitleSpecification`) |
| `negate` | boolean | No | `false` | Invert the match |
| `required` | boolean | No | `false` | Must match (AND logic vs OR) |
| `fields` | Field[] | No | `[]` | Implementation-specific settings |

Each field in `fields` is `{ name: string, value: string | number | boolean | number[] }`.

```json
{
  "customFormats": [
    {
      "name": "x265",
      "specifications": [
        {
          "name": "x265",
          "implementation": "ReleaseTitleSpecification",
          "fields": [
            { "name": "value", "value": "x265|h\\.?265|hevc" }
          ]
        }
      ]
    }
  ]
}
```

---

## DownloadClient

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Display name |
| `implementation` | string | Yes | — | Client type (e.g., `QBittorrent`, `Sabnzbd`) |
| `implementationName` | string | Yes | — | Human-readable implementation name |
| `configContract` | string | Yes | — | Settings contract (e.g., `QBittorrentSettings`) |
| `fields` | Field[] | Yes | — | Client-specific settings |
| `enable` | boolean | No | `true` | Whether the client is active |
| `priority` | number | No | `1` | Download priority (lower = higher priority) |

```json
{
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
        { "name": "movieCategory", "value": "movies" }
      ]
    }
  ]
}
```

---

## Indexer

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Display name |
| `implementation` | string | Yes | — | Indexer type (e.g., `Newznab`, `Cardigann`) |
| `implementationName` | string | Yes | — | Human-readable name |
| `configContract` | string | Yes | — | Settings contract (e.g., `NewznabSettings`) |
| `infoLink` | string \| null | No | — | URL for indexer info |
| `tags` | number[] | No | `[]` | Tag IDs |
| `fields` | Field[] | Yes | — | Indexer-specific settings |
| `enable` | boolean | No | `true` | Whether the indexer is active |
| `priority` | number | No | `25` | Search priority |
| `appProfileId` | number | No | — | Application profile (Prowlarr only) |

:::caution
If you include an empty `indexers` array (`"indexers": []`), PrepArr will **remove all indexers** from the instance. Omit the field entirely to leave indexers unchanged.
:::

---

## Application (Prowlarr)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | number | No | — | Existing application ID |
| `name` | string | Yes | — | Display name |
| `implementation` | string | Yes | — | App type (e.g., `Sonarr`, `Radarr`) |
| `implementationName` | string | Yes | — | Human-readable name |
| `configContract` | string | Yes | — | Settings contract (e.g., `SonarrSettings`) |
| `appProfileId` | number | No | — | Sync profile ID |
| `fields` | Field[] | Yes | — | Connection settings |
| `enable` | boolean | No | `true` | Whether sync is active |
| `syncLevel` | string | No | `addOnly` | Sync behavior: `addOnly` or `fullSync` |
| `tags` | number[] | No | `[]` | Tag IDs |

---

## QBittorrentConfig

Direct qBittorrent configuration (alternative to using the Servarr download client API).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webui` | object | No | `{ username: string, password: string }` |
| `downloads` | object | No | `{ defaultPath: string, categories: string[] }` |
| `connection` | object | No | `{ port: number }` |

### Defaults

| Field | Default |
|-------|---------|
| `webui.username` | `admin` |
| `webui.password` | `adminpass` |
| `downloads.defaultPath` | `/downloads` |
| `downloads.categories` | `[]` |
| `connection.port` | `6881` |

---

## BazarrConfig

Bazarr subtitle manager configuration. Used when `SERVARR_TYPE=bazarr` or when configuring a remote Bazarr instance.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `languages` | BazarrLanguage[] | No | `[]` | Languages to enable for subtitles |
| `providers` | BazarrProvider[] | No | `[]` | Subtitle provider configurations |
| `subtitleDefaults` | SubtitleDefaults | No | — | Default subtitle preferences |
| `sonarr` | object | No | — | Sonarr integration: `{ url: string, apiKey: string }` |
| `radarr` | object | No | — | Radarr integration: `{ url: string, apiKey: string }` |

### BazarrLanguage

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `code` | string | Yes | — | ISO 639-1 language code (e.g., `en`, `nl`) |
| `name` | string | Yes | — | Language display name (e.g., `English`) |
| `enabled` | boolean | No | `true` | Whether to enable this language |

### BazarrProvider

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Provider name (e.g., `opensubtitlescom`) |
| `enabled` | boolean | No | `true` | Whether to enable this provider |
| `settings` | Record | No | `{}` | Provider-specific settings |

### SubtitleDefaults

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `seriesType` | string | No | `hearing_impaired_preferred` | Series subtitle type |
| `movieType` | string | No | `hearing_impaired_preferred` | Movie subtitle type |
| `searchOnUpgrade` | boolean | No | `true` | Search for subtitles on upgrade |
| `searchOnDownload` | boolean | No | `true` | Search for subtitles on download |

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

---

## ReleaseProfile (Sonarr only)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | number | No | — | Existing profile ID |
| `name` | string | Yes | — | Profile name |
| `enabled` | boolean | No | `true` | Whether the profile is active |
| `required` | string \| null | No | `null` | Required terms (comma-separated) |
| `ignored` | string \| null | No | `null` | Ignored terms (comma-separated) |
| `preferred` | Term[] | No | `[]` | Preferred terms with scores |
| `includePreferredWhenRenaming` | boolean | No | `false` | Include preferred term in filename |
| `indexerId` | number | No | `0` | Restrict to specific indexer (0 = all) |
| `tags` | number[] | No | `[]` | Tag IDs |

### Term

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Term or regex pattern |
| `value` | number | Score (positive = preferred, negative = avoided) |

---

## NamingConfig

Naming fields vary by Servarr application type. All types share:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `replaceIllegalCharacters` | boolean | `true` | Replace characters not allowed in filenames |

### Sonarr

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `renameEpisodes` | boolean | — | Enable episode file renaming |
| `standardEpisodeFormat` | string | — | Format for standard episodes |
| `dailyEpisodeFormat` | string | — | Format for daily episodes |
| `animeEpisodeFormat` | string | — | Format for anime episodes |
| `seriesFolderFormat` | string | — | Series root folder format |
| `seasonFolderFormat` | string | — | Season subfolder format |
| `specialsFolderFormat` | string | — | Specials folder format |
| `multiEpisodeStyle` | number | — | Multi-episode naming style |

### Radarr

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `renameMovies` | boolean | — | Enable movie file renaming |
| `movieFormat` | string | — | Movie filename format |
| `movieFolderFormat` | string | — | Movie folder format |
| `colonReplacementFormat` | string | — | How to replace colons |

### Lidarr

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `renameTracks` | boolean | — | Enable track renaming |
| `trackFormat` | string | — | Track filename format |
| `artistFolderFormat` | string | — | Artist folder format |
| `albumFolderFormat` | string | — | Album folder format |

### Readarr

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `renameBooks` | boolean | — | Enable book renaming |
| `standardBookFormat` | string | — | Book filename format |
| `authorFolderFormat` | string | — | Author folder format |

---

## MediaManagementConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `importExtraFiles` | boolean | `false` | Import subtitle and other extra files |
| `extraFileExtensions` | string | `srt,sub,idx` | Extra file extensions to import |
| `setPermissionsLinux` | boolean | `false` | Set file/folder permissions on Linux |
| `chmodFolder` | string | `755` | Folder permissions |
| `chmodFile` | string | `644` | File permissions |
| `chownGroup` | string | — | Group ownership |
| `autoUnmonitorPreviouslyDownloaded` | boolean | `false` | Unmonitor after download |
| `downloadPropersAndRepacks` | string | `preferAndUpgrade` | Proper/repack handling |
| `createEmptySeriesFolders` | boolean | — | Create folders for new series (Sonarr) |
| `createEmptyMovieFolders` | boolean | — | Create folders for new movies (Radarr) |
| `deleteEmptyFolders` | boolean | `false` | Delete folders when empty |
| `fileDate` | string | `none` | Set file date on import (`none`, `cinemas`, `release`) |
| `recycleBin` | string | — | Path to recycle bin folder |
| `recycleBinCleanupDays` | number | `7` | Days before cleaning recycle bin |
| `skipFreeSpaceCheckWhenImporting` | boolean | `false` | Skip disk space check |
| `minimumFreeSpaceWhenImporting` | number | `100` | Minimum free space in MB |
| `copyUsingHardlinks` | boolean | `true` | Use hardlinks instead of copying |
| `useScriptImport` | boolean | `false` | Run script on import |
| `scriptImportPath` | string | — | Path to import script |
| `enableMediaInfo` | boolean | `true` | Extract media info from files |
| `rescanAfterRefresh` | string | `always` | Rescan behavior (`always`, `afterManual`, `never`) |

---

## QualityDefinition

Override default quality size limits.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `quality` | string | Yes | — | Quality name (e.g., `Bluray-1080p`) |
| `title` | string | No | — | Display title |
| `minSize` | number | No | — | Minimum size in MB per minute |
| `maxSize` | number | No | — | Maximum size in MB per minute |
| `preferredSize` | number | No | — | Preferred size in MB per minute |

```json
{
  "qualityDefinitions": [
    {
      "quality": "Bluray-1080p",
      "title": "Bluray-1080p",
      "minSize": 5,
      "maxSize": 100,
      "preferredSize": 30
    }
  ]
}
```
