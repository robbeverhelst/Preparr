---
title: Download Clients
description: Configure download clients like qBittorrent, SABnzbd, and NZBGet
---

Download clients define where Servarr sends downloads. PrepArr manages them with full CRUD operations.

## Schema

```typescript
{
  name: string                    // Display name
  implementation: string          // Implementation type
  implementationName: string      // Human-readable implementation name
  configContract: string          // Configuration contract
  fields: ConfigField[]           // Client-specific settings
  enable: boolean                 // Default: true
  priority: number                // Client priority (default: 1)
}

type ConfigField = {
  name: string
  value: string | number | boolean | number[]
}
```

## qBittorrent

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
        { "name": "category", "value": "tv" },
        { "name": "priority", "value": 0 },
        { "name": "removeCompletedDownloads", "value": false },
        { "name": "removeFailedDownloads", "value": false }
      ],
      "enable": true,
      "priority": 1
    }
  ]
}
```

## SABnzbd

```json
{
  "downloadClients": [
    {
      "name": "SABnzbd",
      "implementation": "Sabnzbd",
      "implementationName": "SABnzbd",
      "configContract": "SabnzbdSettings",
      "fields": [
        { "name": "host", "value": "sabnzbd" },
        { "name": "port", "value": 8080 },
        { "name": "apiKey", "value": "your-api-key" },
        { "name": "tvCategory", "value": "tv" },
        { "name": "movieCategory", "value": "movies" }
      ],
      "enable": true,
      "priority": 1
    }
  ]
}
```

## Multiple Download Clients

Use the `priority` field to define fallback order:

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
        { "name": "port", "value": 8080 }
      ],
      "enable": true,
      "priority": 1
    },
    {
      "name": "SABnzbd",
      "implementation": "Sabnzbd",
      "implementationName": "SABnzbd",
      "configContract": "SabnzbdSettings",
      "fields": [
        { "name": "host", "value": "sabnzbd" },
        { "name": "port", "value": 8080 },
        { "name": "apiKey", "value": "your-api-key" }
      ],
      "enable": true,
      "priority": 2
    }
  ]
}
```

Lower `priority` numbers are preferred. Client with priority 1 is used first; if unavailable, priority 2 is used.

## Notes

- The `fields` array varies by client type. Use the Servarr API to discover available fields for each implementation.
- Use per-service categories (e.g., `tv` for Sonarr, `movies` for Radarr) to keep downloads organized.
