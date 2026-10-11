---
title: Validation
description: Configuration validation, testing, and common errors
---

PrepArr validates all configuration using [Zod](https://zod.dev/) schemas. Validation runs at startup and whenever the config file changes.

## Common Validation Errors

### Invalid API Key

```
API key must be exactly 32 characters and hexadecimal
```

API keys must be 32-character hexadecimal strings. Use `--generate-api-key` to create one:

```bash
docker run --rm ghcr.io/robbeverhelst/preparr:latest bun run dist/index.js --generate-api-key
```

### Missing Required Fields

```
Configuration missing required field: app.rootFolders.0.path
```

Check that all required fields are present in your configuration file.

### Invalid URL Format

```
SERVARR_URL must be a valid URL (e.g., http://sonarr:8989)
```

URLs must include the protocol (`http://` or `https://`).

### Type Mismatches

```
Expected number, received string at app.qualityProfiles.0.cutoff
```

Ensure numeric fields contain numbers, not quoted strings.

## Testing Configuration

PrepArr has no HTTP validation endpoint. Validation errors are reported in the container logs at startup and when the config file changes, so run the sidecar (or `--init`) against your config and check its logs.

Unknown keys are silently dropped rather than reported. Desired-state settings (`rootFolders`, `qualityProfiles`, `downloadClients`, etc.) must be nested under the top-level `app` key; placed at the root of the file they are ignored without an error.

## Validating JSON Syntax

Before checking schema validation, make sure your JSON is syntactically valid:

```bash
# Check JSON syntax
python3 -m json.tool sonarr-config.json > /dev/null

# Or with jq
jq . sonarr-config.json > /dev/null
```

Common JSON syntax issues:
- Trailing commas after the last item in arrays or objects
- Single quotes instead of double quotes
- Unquoted keys
- Comments (JSON does not support comments)
