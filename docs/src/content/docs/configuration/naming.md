---
title: Naming
description: Configure file and folder naming conventions for Servarr apps
---

Naming configuration controls how Servarr renames media files and organizes folders. Settings vary by application type. This is an update-only configuration.

## Schema

### Sonarr

```typescript
{
  renameEpisodes: boolean
  standardEpisodeFormat: string
  dailyEpisodeFormat: string
  animeEpisodeFormat: string
  seriesFolderFormat: string
  seasonFolderFormat: string
  specialsFolderFormat: string
  multiEpisodeStyle: number          // 0-5
  replaceIllegalCharacters: boolean  // Default: true
}
```

### Radarr

```typescript
{
  renameMovies: boolean
  movieFormat: string
  movieFolderFormat: string
  colonReplacementFormat: number
  replaceIllegalCharacters: boolean  // Default: true
}
```

## Sonarr Example

```json
{
  "naming": {
    "renameEpisodes": true,
    "standardEpisodeFormat": "{Series TitleYear} - S{season:00}E{episode:00} - {Episode CleanTitle} [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}{[Preferred Words]}{-Release Group}",
    "dailyEpisodeFormat": "{Series TitleYear} - {Air-Date} - {Episode CleanTitle} [{Quality Full}]{[Preferred Words]}{-Release Group}",
    "animeEpisodeFormat": "{Series TitleYear} - S{season:00}E{episode:00} - {absolute:000} - {Episode CleanTitle} [{Quality Full}]{[Preferred Words]}{-Release Group}",
    "seriesFolderFormat": "{Series TitleYear} [imdbid-{ImdbId}]",
    "seasonFolderFormat": "Season {season:00}",
    "specialsFolderFormat": "Specials",
    "multiEpisodeStyle": 0,
    "replaceIllegalCharacters": true
  }
}
```

## Radarr Example

```json
{
  "naming": {
    "renameMovies": true,
    "movieFormat": "{Movie CleanTitle} {(Release Year)} [{Quality Full}]{[MediaInfo VideoDynamicRangeType]}{-Release Group}",
    "movieFolderFormat": "{Movie CleanTitle} ({Release Year}) [imdbid-{ImdbId}]",
    "replaceIllegalCharacters": true
  }
}
```

## Multi-Episode Style

For Sonarr, the `multiEpisodeStyle` field controls how multi-episode files are named:

| Value | Style | Example |
|-------|-------|---------|
| 0 | Extend | S01E01-02 |
| 1 | Duplicate | S01E01.S01E02 |
| 2 | Repeat | S01E01E02 |
| 3 | Scene | S01E01-E02 |
| 4 | Range | S01E01-E02 |
| 5 | Prefixed Range | S01E01-2 |

## Notes

- Only set fields relevant to your `SERVARR_TYPE`
- Fields you omit keep their current values
- Refer to the [Servarr Wiki](https://wiki.servarr.com/) for the full list of format tokens
