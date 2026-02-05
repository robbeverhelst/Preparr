---
title: Indexers
description: Configure indexers manually or via Prowlarr sync
---

Indexers tell Servarr where to search for media. PrepArr supports two approaches: manual indexer configuration or Prowlarr-managed sync.

## Prowlarr Sync (Recommended)

When using Prowlarr to manage indexers centrally, set `prowlarrSync: true` in your Sonarr/Radarr config:

```json
{
  "prowlarrSync": true
}
```

This tells the sidecar to skip indexer management entirely, preventing conflicts with Prowlarr's indexer synchronization. See the [Prowlarr Sync guide](/Preparr/guides/prowlarr-sync/) for the full setup.

## Manual Indexer Configuration

If you're not using Prowlarr, configure indexers directly:

### Schema

```typescript
{
  name: string                    // Indexer display name
  implementation: string          // Implementation type
  implementationName: string      // Human-readable name
  configContract: string          // Configuration contract
  definitionName?: string         // Cardigann definition name
  fields: ConfigField[]           // Indexer-specific settings
  enable: boolean                 // Default: true
  priority: number                // Default: 25
  appProfileId?: number           // Application profile ID
  tags: number[]                  // Tag IDs (default: [])
}
```

### Newznab Example

```json
{
  "indexers": [
    {
      "name": "NZBgeek",
      "implementation": "Newznab",
      "implementationName": "Newznab",
      "configContract": "NewznabSettings",
      "fields": [
        { "name": "baseUrl", "value": "https://api.nzbgeek.info" },
        { "name": "apiKey", "value": "your-api-key" },
        { "name": "categories", "value": [5000, 5040] }
      ],
      "enable": true,
      "priority": 25
    }
  ]
}
```

### Cardigann/Torznab Example

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
  ]
}
```

## Important

- **Do not** include an `indexers` array when using `prowlarrSync: true`. The sidecar will remove manually configured indexers if they conflict with Prowlarr sync.
- If you have `"indexers": []` (empty array) in your config, the sidecar will remove all existing indexers. Either omit the field entirely or set `prowlarrSync: true`.
