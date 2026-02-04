---
title: Root Folders
description: Configure media storage locations for Servarr instances
---

Root folders define where Servarr stores media files. Each Servarr instance needs at least one root folder.

## Schema

```typescript
{
  path: string          // Filesystem path inside the container
  accessible: boolean   // Whether the path is accessible (default: true)
}
```

## Example

```json
{
  "rootFolders": [
    { "path": "/tv", "accessible": true }
  ]
}
```

### Multiple Root Folders

```json
{
  "rootFolders": [
    { "path": "/tv/shows", "accessible": true },
    { "path": "/tv/anime", "accessible": true }
  ]
}
```

### Radarr

```json
{
  "rootFolders": [
    { "path": "/movies", "accessible": true },
    { "path": "/movies/4k", "accessible": true }
  ]
}
```

## Notes

- Paths must exist inside the Servarr container (mounted via Docker volumes or PVCs)
- The `accessible` field indicates whether PrepArr should verify the path is accessible
- Root folders are managed with full CRUD: folders in your config are created, folders not in your config are removed
