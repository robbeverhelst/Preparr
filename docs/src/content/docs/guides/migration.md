---
title: Migrating to PrepArr
description: Move from a manually configured Servarr setup to PrepArr-managed configuration
---

This guide covers migrating an existing manually configured Servarr instance to PrepArr management.

## Prerequisites

- An existing Servarr instance (Sonarr, Radarr, etc.) running with PostgreSQL
- The API key for your existing instance (found in Settings > General or in `config.xml`)

If your instance currently uses SQLite, you'll need to migrate to PostgreSQL first. See the [Servarr Wiki](https://wiki.servarr.com/) for SQLite-to-PostgreSQL migration guides.

## Step 1: Export Current Configuration

Use the Servarr API to export your current settings:

```bash
API_KEY="your-api-key"
BASE_URL="http://sonarr:8989"

# Export current configuration
curl -H "X-Api-Key: $API_KEY" "$BASE_URL/api/v3/qualityprofile" > profiles.json
curl -H "X-Api-Key: $API_KEY" "$BASE_URL/api/v3/rootfolder" > folders.json
curl -H "X-Api-Key: $API_KEY" "$BASE_URL/api/v3/downloadclient" > clients.json
curl -H "X-Api-Key: $API_KEY" "$BASE_URL/api/v3/indexer" > indexers.json
```

## Step 2: Build Your PrepArr Config

Map the exported data to PrepArr's JSON format:

```json
{
  "apiKey": "your-existing-api-key",
  "rootFolders": [
    { "path": "/tv", "accessible": true }
  ],
  "qualityProfiles": [
    {
      "name": "HD - 1080p",
      "cutoff": 1080,
      "items": [...]
    }
  ],
  "downloadClients": [...]
}
```

Use the existing API key from your `config.xml` to avoid disrupting the running instance.

## Step 3: Test with Sidecar Only

Before switching to the full init + sidecar pattern, test the sidecar alone against your running instance:

```yaml
sonarr-sidecar:
  image: ghcr.io/robbeverhelst/preparr:latest
  environment:
    POSTGRES_HOST: postgres
    POSTGRES_PASSWORD: your-password
    SERVARR_URL: http://sonarr:8989
    SERVARR_TYPE: sonarr
    SERVARR_ADMIN_PASSWORD: your-password
    CONFIG_PATH: /config/sonarr-config.json
    CONFIG_WATCH: "true"
    LOG_LEVEL: debug
  volumes:
    - ./sonarr-config.json:/config/sonarr-config.json:ro
```

Run with `LOG_LEVEL=debug` to see exactly what the sidecar detects and changes. Verify it applies your configuration correctly without unwanted modifications.

## Step 4: Switch to Full Pattern

Once the sidecar works correctly, add the init container to your setup. On the next fresh deployment, the init container will handle database setup and `config.xml` generation.

## Step 5: Verify

```bash
# Check sidecar health
curl http://localhost:9001/health

# Check reconciliation status
curl http://localhost:9001/reconciliation/status

# Verify settings match
curl -H "X-Api-Key: your-key" http://sonarr:8989/api/v3/qualityprofile
```

## Tips

- Start with a small config (just root folders and one quality profile) and expand gradually
- Use `LOG_LEVEL=debug` during migration to catch issues early
- Keep a backup of your original `config.xml` and database before migrating
- Test the full init + sidecar pattern on a fresh deployment in a staging environment first
