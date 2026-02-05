---
title: Media Management
description: Configure file handling, permissions, and download behavior settings
---

Media management settings control how Servarr handles files, permissions, hardlinks, and download processing. This is an update-only configuration -- PrepArr modifies the existing settings rather than creating or deleting them.

Added in PrepArr v0.15.0.

## Schema

```typescript
{
  // File handling
  importExtraFiles: boolean              // Import extra files (srt, sub, etc). Default: false
  extraFileExtensions: string            // Comma-separated extensions. Default: "srt,sub,idx"

  // Permissions (Linux)
  setPermissionsLinux: boolean           // Set file permissions. Default: false
  chmodFolder: string                    // Folder permissions. Default: "755"
  chmodFile: string                      // File permissions. Default: "644"
  chownGroup: string                     // Group ownership. Optional.

  // Download handling
  autoUnmonitorPreviouslyDownloaded: boolean  // Default: false
  downloadPropersAndRepacks: string           // "preferAndUpgrade" | "doNotUpgrade" | "doNotPrefer"
  createEmptySeriesFolders: boolean           // Sonarr only. Optional.
  createEmptyMovieFolders: boolean            // Radarr only. Optional.
  deleteEmptyFolders: boolean                 // Default: false

  // File management
  fileDate: string                       // "none" | "localAirDate" | "utcAirDate". Default: "none"
  recycleBin: string                     // Recycle bin path. Optional.
  recycleBinCleanupDays: number          // Days before cleanup. Default: 7

  // Hardlinks and imports
  skipFreeSpaceCheckWhenImporting: boolean    // Default: false
  minimumFreeSpaceWhenImporting: number      // MB. Default: 100
  copyUsingHardlinks: boolean                // Default: true
  useScriptImport: boolean                   // Default: false
  scriptImportPath: string                   // Script path. Optional.

  // Analysis
  enableMediaInfo: boolean               // Default: true
  rescanAfterRefresh: string             // "always" | "afterManual" | "never". Default: "always"
}
```

## Example

```json
{
  "mediaManagement": {
    "importExtraFiles": true,
    "extraFileExtensions": "srt,sub,idx,ass",
    "copyUsingHardlinks": true,
    "downloadPropersAndRepacks": "preferAndUpgrade",
    "deleteEmptyFolders": true,
    "recycleBin": "/recycle",
    "recycleBinCleanupDays": 14,
    "enableMediaInfo": true,
    "rescanAfterRefresh": "always"
  }
}
```

## Notes

- Only set fields relevant to your `SERVARR_TYPE`. For example, `createEmptySeriesFolders` only applies to Sonarr.
- Fields you omit are left at their current values in Servarr.
- `copyUsingHardlinks: true` is recommended when your media and download directories are on the same filesystem -- it saves disk space by creating hardlinks instead of copies.
