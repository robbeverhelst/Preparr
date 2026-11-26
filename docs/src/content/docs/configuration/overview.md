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
  "app": {
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
}
```

### YAML format

```yaml
app:
  apiKey: 2bac5d00dca43258313c734821a15c4c
  prowlarrSync: true
  rootFolders:
    - path: /tv
      accessible: true
  qualityProfiles: [...]
  downloadClients: [...]
```

## Environment Variable Interpolation

String values in the configuration file can reference environment variables of the PrepArr container. This keeps passwords and API keys out of the file, so the file can be committed to Git.

| Syntax | Result |
|--------|--------|
| `${VAR}` | The value of `VAR`. PrepArr refuses to start if `VAR` is not set. |
| `${VAR:-default}` | The value of `VAR`, or `default` if `VAR` is not set **or empty**. |
| `${VAR-default}` | The value of `VAR`, or `default` only if `VAR` is not set. |
| `$${VAR}` | The literal text `${VAR}` (escape, nothing is looked up). |

The two default forms behave as in a POSIX shell and in Docker Compose. A variable that is set to an empty string counts as set: `${VAR}` and `${VAR-default}` then give an empty string, and only `${VAR:-default}` falls back to the default. Unlike a shell, a plain `${VAR}` with an unset variable is an error instead of an empty string.

### Example

```yaml
# sonarr-config.yaml
postgres:
  host: ${POSTGRES_HOST:-postgres}
services:
  qbittorrent:
    url: http://${QBIT_HOST:-qbittorrent}:8080
    username: admin
    password: ${QBIT_PASSWORD}
app:
  rootFolders:
    - path: ${MEDIA_ROOT:-/data}/tv
  downloadClients:
    - name: qBittorrent
      implementation: QBittorrent
      implementationName: qBittorrent
      configContract: QBittorrentSettings
      fields:
        - name: host
          value: ${QBIT_HOST:-qbittorrent}
        - name: port
          value: 8080
        - name: username
          value: admin
        - name: password
          value: ${QBIT_PASSWORD}
```

The variables must be set on the PrepArr containers. Both the init container and the sidecar read the configuration file, so both need them:

```yaml
# docker-compose.yml
services:
  sonarr-init:
    image: ghcr.io/robbeverhelst/preparr:latest
    command: ["bun", "run", "dist/index.js", "--init"]
    environment: &preparr-env
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SERVARR_URL: http://sonarr:8989
      SERVARR_TYPE: sonarr
      SERVARR_ADMIN_PASSWORD: ${SERVARR_ADMIN_PASSWORD}
      CONFIG_PATH: /config/sonarr-config.yaml
      QBIT_PASSWORD: ${QBIT_PASSWORD}   # used by sonarr-config.yaml
      MEDIA_ROOT: /data                 # used by sonarr-config.yaml
    volumes:
      - sonarr_config:/config
      - ./sonarr-config.yaml:/config/sonarr-config.yaml:ro

  sonarr-sidecar:
    image: ghcr.io/robbeverhelst/preparr:latest
    environment: *preparr-env
    volumes:
      - sonarr_config:/config
      - ./sonarr-config.yaml:/config/sonarr-config.yaml:ro
```

```bash
# .env (not committed)
POSTGRES_PASSWORD=your-secure-password
SERVARR_ADMIN_PASSWORD=your-admin-password
QBIT_PASSWORD=your-qbittorrent-password
```

Docker Compose only replaces `${...}` inside `docker-compose.yml` itself. The mounted configuration file reaches PrepArr unchanged, and PrepArr resolves its references from the container's environment. In Kubernetes, set the variables with `env` or `envFrom` (for example from a Secret) on the PrepArr init and sidecar containers.

### Missing variables

If a referenced variable is not set and has no default, PrepArr stops before validating the configuration. The error lists every unresolved reference at once, each with the configuration key and the variable name. Values are never printed. In the log it is the `error` field of the `Configuration loading failed` line:

```
Environment variable interpolation failed in '/config/sonarr-config.yaml': services.qbittorrent.password: env var QBIT_PASSWORD is not set; app.downloadClients[0].fields[3].value: env var QBIT_PASSWORD is not set
```

### Rules

- Interpolation runs after the file is parsed and before validation, so the schema checks the final values. It works the same in JSON, YAML and TOML files.
- Only string **values** are processed, at any depth, including inside arrays. Keys, numbers, booleans and `null` are left alone. A string can contain several references.
- The result is always a string. Settings that accept a number as text (`postgres.port`, `health.port`, `configReconcileInterval`) can be interpolated; for other numeric or boolean settings write the value directly.
- Variable names consist of letters, digits and `_`, and do not start with a digit. A default runs up to the first `}` and cannot contain another `${...}`.
- A `${` that is not one of the forms above (for example `${VAR:default}` or a missing `}`) is reported as an error rather than passed through. Write `$${` wherever the value needs a literal `${`. A `$` that is not followed by `{` needs no escaping.
- The value of a variable is inserted as is and is not scanned again.
- Only the configuration file is interpolated, not CLI flags or PrepArr's own environment variables. PrepArr's [environment variables](/configuration/environment-variables/) still override the matching settings in the file.
- The sidecar re-reads the file on every reconciliation, but the environment of a running container does not change. Restart the container after changing a variable. If an edited file references a variable that is not set, the sidecar exits with the error above.
- In YAML, quote the value if it is inside a flow collection (`[...]` or `{...}`) or if a default contains `: ` or ` #`: `value: "${GREETING:-key: value}"`.

## `app` Properties

All desired-state settings are nested under the top-level `app` key. Other top-level keys are `postgres`, `servarr`, `services`, `health`, `logLevel`, `logFormat`, `configPath`, `configWatch`, and `configReconcileInterval`. Unknown top-level keys are silently ignored, so placing the properties below at the root of the file has no effect.

| Property | Type | Description |
|----------|------|-------------|
| `apiKey` | string | 32-character hex API key. Auto-generated if not provided. |
| `prowlarrSync` | boolean | Enable Prowlarr indexer sync. Default: `false`. |
| `rootFolders` | array | [Root folder definitions](/configuration/root-folders/) |
| `qualityProfiles` | array | [Quality profile definitions](/configuration/quality-profiles/) |
| `customFormats` | array | [Custom format definitions](/configuration/custom-formats/) |
| `downloadClients` | array | [Download client definitions](/configuration/download-clients/) |
| `indexers` | array | [Indexer definitions](/configuration/indexers/) |
| `applications` | array | Prowlarr application sync configs |
| `mediaManagement` | object | [Media management settings](/configuration/media-management/) |
| `naming` | object | [Naming conventions](/configuration/naming/) |
| `qualityDefinitions` | array | Quality size limits |
| `releaseProfiles` | array | Release scoring (Sonarr only) |
| `qbittorrent` | object | qBittorrent-specific settings |
| `bazarr` | object | [Bazarr subtitle manager settings](/configuration/bazarr/) |

## How Reconciliation Works

The sidecar compares each configuration section against the current state of the Servarr instance:

- **Create** -- Resources in your config that don't exist in Servarr are created
- **Update** -- Resources that exist but differ from your config are updated
- **Delete** -- Resources in Servarr that aren't in your config are removed (for CRUD resources)
- **Skip** -- Resources that match are left unchanged

Some configuration sections (like media management and naming) only support updates, not create/delete, since they are single-value settings rather than collections.
