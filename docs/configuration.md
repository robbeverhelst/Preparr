# Configuration Reference

Complete reference for all PrepArr configuration options, environment variables, and JSON schema definitions.

## Environment Variables

### Core Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_HOST` | ✅ | - | PostgreSQL server hostname |
| `POSTGRES_PORT` | ❌ | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | ❌ | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | ✅ | - | PostgreSQL password |
| `POSTGRES_DB` | ❌ | `servarr` | PostgreSQL database name |
| `SERVARR_URL` | ✅ | - | Full URL to Servarr application |
| `SERVARR_TYPE` | ✅ | - | Service type: `sonarr`, `radarr`, `prowlarr`, `lidarr`, `readarr`, `qbittorrent`, `auto` |
| `SERVARR_ADMIN_USER` | ❌ | `admin` | Admin username for Servarr |
| `SERVARR_ADMIN_PASSWORD` | ✅* | - | Admin password (*required for init containers) |
| `CONFIG_PATH` | ✅ | - | Path to JSON configuration file |

### Application Behavior

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONFIG_WATCH` | ❌ | `true` | Enable configuration file watching |
| `CONFIG_RECONCILE_INTERVAL` | ❌ | `60` | Reconciliation interval in seconds |
| `HEALTH_PORT` | ❌ | `8080` | Health check endpoint port |
| `LOG_LEVEL` | ❌ | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | ❌ | `json` | Log format: `json`, `pretty` |

### Service Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QBITTORRENT_URL` | ❌ | - | qBittorrent Web UI URL |
| `QBITTORRENT_USERNAME` | ❌ | - | qBittorrent Web UI username |
| `QBITTORRENT_PASSWORD` | ❌ | - | qBittorrent Web UI password |
| `PROWLARR_URL` | ❌ | - | Prowlarr base URL |
| `PROWLARR_API_KEY` | ❌ | - | Prowlarr API key |

## JSON Configuration Schema

### Root Configuration

```typescript
{
  apiKey?: string                    // Servarr API key (32-char hex)
  prowlarrSync?: boolean            // Enable Prowlarr indexer management (default: false)
  rootFolders?: RootFolder[]        // Media root folders
  qualityProfiles?: QualityProfile[] // Quality/format profiles  
  indexers?: Indexer[]              // Indexer configurations
  downloadClients?: DownloadClient[] // Download client configurations
  applications?: Application[]       // Prowlarr application sync configs
  qbittorrent?: QBittorrentConfig   // qBittorrent-specific settings
}
```

### Root Folders

Define media storage locations:

```typescript
{
  path: string          // Filesystem path (e.g., "/tv", "/movies")
  accessible: boolean   // Whether path is accessible (default: true)
  freeSpace?: number    // Available space in bytes
  unmappedFolders: string[] // Subdirectories not mapped to series/movies
}
```

**Example**:
```json
{
  "rootFolders": [
    {
      "path": "/tv",
      "accessible": true
    },
    {
      "path": "/movies", 
      "accessible": true
    }
  ]
}
```

### Quality Profiles

Define quality and format preferences:

```typescript
{
  name: string          // Profile name
  cutoff: number        // Quality ID for cutoff
  items: QualityItem[]  // Available qualities
}

type QualityItem = {
  quality: {
    id: number          // Servarr quality ID
    name: string        // Quality name
  }
  allowed: boolean      // Whether quality is allowed
}
```

**Example**:
```json
{
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        {
          "quality": { "id": 1, "name": "HDTV-1080p" },
          "allowed": true
        },
        {
          "quality": { "id": 2, "name": "WEBDL-1080p" },
          "allowed": true
        },
        {
          "quality": { "id": 3, "name": "Bluray-1080p" },
          "allowed": true
        }
      ]
    }
  ]
}
```

### Download Clients

Configure download applications:

```typescript
{
  name: string                    // Client display name
  implementation: string          // Implementation type (e.g., "QBittorrent")
  implementationName: string      // Human-readable implementation name
  configContract: string          // Configuration contract name
  fields: ConfigField[]          // Configuration fields
  enable: boolean                // Whether client is enabled (default: true)
  priority: number               // Client priority (default: 1)
}

type ConfigField = {
  name: string                   // Field name
  value: string | number | boolean | number[] // Field value
}
```

**qBittorrent Example**:
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

**SABnzbd Example**:
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

### Indexers

**⚠️ Note**: When using `prowlarrSync: true`, omit the `indexers` array to allow Prowlarr to manage indexers automatically.

For manual indexer management:

```typescript
{
  name: string                    // Indexer display name
  implementation: string          // Implementation type
  implementationName: string      // Human-readable implementation  
  configContract: string          // Configuration contract
  definitionName?: string         // Cardigann definition name
  fields: ConfigField[]          // Configuration fields
  enable: boolean                // Whether indexer is enabled (default: true)
  priority: number               // Indexer priority (default: 25)
  appProfileId?: number          // Application profile ID
  tags: number[]                 // Tag IDs (default: [])
}
```

**Prowlarr Sync (Recommended)**:
```json
{
  "prowlarrSync": true
}
```

**Manual Indexer Configuration**:
```json
{
  "prowlarrSync": false,
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

### Applications (Prowlarr)

Configure Prowlarr to sync with other Servarr applications:

```typescript
{
  name: string                    // Application name
  implementation: string          // Implementation type (e.g., "Sonarr")
  implementationName: string      // Human-readable name
  configContract: string          // Configuration contract
  fields: ConfigField[]          // Configuration fields
  enable: boolean                // Whether application is enabled (default: true)
  syncLevel: string              // Sync level: "addOnly", "fullSync" (default: "addOnly")
  appProfileId?: number          // Application profile ID
  tags: number[]                 // Tag IDs (default: [])
}
```

**Example**:
```json
{
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
      "enable": true,
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
      "enable": true,
      "syncLevel": "fullSync",
      "appProfileId": 1
    }
  ]
}
```

### qBittorrent Configuration

qBittorrent-specific settings:

```typescript
{
  webui?: {
    username: string              // Web UI username (default: "admin")
    password: string              // Web UI password (default: "adminpass")
  }
  downloads?: {
    defaultPath: string           // Default download path (default: "/downloads")
    categories: string[]          // Download categories (default: [])
  }
  connection?: {
    port: number                 // Incoming connection port (default: 6881)
  }
}
```

**Example**:
```json
{
  "qbittorrent": {
    "webui": {
      "username": "admin",
      "password": "adminpass"
    },
    "downloads": {
      "defaultPath": "/downloads",
      "categories": ["tv", "movies", "music"]
    },
    "connection": {
      "port": 6881
    }
  }
}
```

## Configuration Examples

### Sonarr with Prowlarr Sync

```json
{
  "apiKey": "2bac5d00dca43258313c734821a15c4c",
  "prowlarrSync": true,
  "rootFolders": [
    {
      "path": "/tv",
      "accessible": true
    }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [
        {
          "quality": { "id": 1, "name": "HDTV-1080p" },
          "allowed": true
        }
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
        { "name": "category", "value": "tv" }
      ],
      "enable": true,
      "priority": 1
    }
  ]
}
```

### Prowlarr with Application Sync

```json
{
  "apiKey": "c04914c6bfad445a3edc23e5edbca4d1",
  "indexers": [
    {
      "name": "The Pirate Bay",
      "implementation": "Cardigann",
      "implementationName": "Cardigann",
      "configContract": "CardigannSettings",
      "definitionName": "thepiratebay",
      "fields": [
        { "name": "definitionFile", "value": "thepiratebay" },
        { "name": "baseUrl", "value": "https://thepiratebay.org/" }
      ],
      "enable": true,
      "priority": 25,
      "appProfileId": 1
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
        { "name": "apiKey", "value": "2bac5d00dca43258313c734821a15c4c" }
      ],
      "enable": true,
      "syncLevel": "fullSync",
      "appProfileId": 1
    }
  ]
}
```

### Radarr with Multiple Download Clients

```json
{
  "apiKey": "97d741a13af015bf750f857a7e097f20",
  "prowlarrSync": true,
  "rootFolders": [
    {
      "path": "/movies",
      "accessible": true
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
        { "name": "category", "value": "radarr" }
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
        { "name": "apiKey", "value": "sabnzbd-api-key" },
        { "name": "movieCategory", "value": "movies" }
      ],
      "enable": true,
      "priority": 2
    }
  ]
}
```

## Configuration Validation

PrepArr uses [Zod](https://zod.dev/) for configuration validation. Invalid configurations will be rejected with detailed error messages.

### Common Validation Errors

**Invalid API Key**:
```
API key must be exactly 32 characters and hexadecimal
```

**Missing Required Fields**:
```
Configuration missing required field: rootFolders.0.path
```

**Invalid URL Format**:
```
SERVARR_URL must be a valid URL (e.g., http://sonarr:8989)
```

### Testing Configuration

Use the validation endpoint to test configuration before deployment:

```bash
# Test configuration file
curl -X POST http://preparr-sidecar:9001/validate \
  -H "Content-Type: application/json" \
  -d @sonarr-config.json
```

**Valid Response**:
```json
{
  "valid": true,
  "message": "Configuration is valid"
}
```

**Invalid Response**:
```json
{
  "valid": false,
  "errors": [
    {
      "path": ["qualityProfiles", 0, "cutoff"],
      "message": "Expected number, received string"
    }
  ]
}
```

## Best Practices

### Security
- Generate unique API keys for each service
- Use environment variables for sensitive data
- Rotate credentials regularly
- Use least-privilege database users

### Performance
- Set appropriate reconciliation intervals (60-300 seconds)
- Use `prowlarrSync: true` for indexer management
- Limit log level to `info` or `warn` in production
- Monitor resource usage and set appropriate limits

### Reliability
- Enable configuration file watching
- Use health checks in orchestrators
- Implement proper backup strategies for PostgreSQL
- Test configuration changes in staging environments

### GitOps Integration
- Store configuration files in version control
- Use separate configs for different environments
- Implement proper branching strategies
- Automate deployment pipelines with validation

## Next Steps

- See [Setup Guide](setup.md) for deployment instructions  
- Check [Troubleshooting](troubleshooting.md) for common issues
- Review [Monitoring Guide](monitoring.md) for observability setup