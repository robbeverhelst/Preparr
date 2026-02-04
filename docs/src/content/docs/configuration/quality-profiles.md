---
title: Quality Profiles
description: Configure quality profiles for Sonarr, Radarr, and other Servarr apps
---

Quality profiles define which media qualities are acceptable and which quality to stop upgrading at (the cutoff).

## Schema

```typescript
{
  name: string              // Profile name
  cutoff: number            // Quality ID for the cutoff
  items: QualityItem[]      // Quality items in the profile
}

type QualityItem = {
  quality: {
    id: number              // Servarr quality ID
    name: string            // Quality name
  }
  allowed: boolean          // Whether this quality is allowed
}
```

## Example

### HD 1080p Profile

```json
{
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
  ]
}
```

### Multiple Profiles

```json
{
  "qualityProfiles": [
    {
      "name": "Any",
      "cutoff": 1080,
      "items": [
        { "quality": { "id": 4, "name": "HDTV-720p" }, "allowed": true },
        { "quality": { "id": 1, "name": "HDTV-1080p" }, "allowed": true },
        { "quality": { "id": 2, "name": "WEBDL-1080p" }, "allowed": true }
      ]
    },
    {
      "name": "4K",
      "cutoff": 2160,
      "items": [
        { "quality": { "id": 18, "name": "WEBDL-2160p" }, "allowed": true },
        { "quality": { "id": 19, "name": "Bluray-2160p" }, "allowed": true }
      ]
    }
  ]
}
```

## Cutoff

The `cutoff` value is a quality ID. Once media reaches this quality level, Servarr stops upgrading it. Set the cutoff to the quality ID of the highest quality you want.

## Quality Profiles are CRUD

PrepArr manages quality profiles with full create/update/delete:
- Profiles in your config that don't exist are created
- Profiles that exist but differ are updated
- Profiles in Servarr that aren't in your config are removed
