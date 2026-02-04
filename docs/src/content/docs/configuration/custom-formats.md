---
title: Custom Formats
description: Configure custom format scoring rules for Radarr and Sonarr v4+
---

Custom formats are a scoring system for release attributes. They allow you to prefer or reject releases based on specific characteristics like codec, resolution group, or release group.

Supported by Radarr and Sonarr v4+. Runs in sidecar mode only.

## Schema

```typescript
{
  name: string
  includeCustomFormatWhenRenaming: boolean  // default: false
  specifications: Specification[]
}

type Specification = {
  name: string
  implementation: string     // e.g., "ReleaseTitleSpecification"
  negate: boolean            // default: false
  required: boolean          // default: false
  fields: [
    { name: string, value: string | number | boolean }
  ]
}
```

## Examples

### Prefer x265

```json
{
  "customFormats": [
    {
      "name": "x265",
      "includeCustomFormatWhenRenaming": false,
      "specifications": [
        {
          "name": "x265",
          "implementation": "ReleaseTitleSpecification",
          "negate": false,
          "required": false,
          "fields": [
            { "name": "value", "value": "x265|h\\.?265|hevc" }
          ]
        }
      ]
    }
  ]
}
```

### Reject Dolby Vision

```json
{
  "customFormats": [
    {
      "name": "Reject DV",
      "specifications": [
        {
          "name": "Dolby Vision",
          "implementation": "ReleaseTitleSpecification",
          "negate": false,
          "required": true,
          "fields": [
            { "name": "value", "value": "\\bDV\\b|\\bDoVi\\b|Dolby\\.?Vision" }
          ]
        }
      ]
    }
  ]
}
```

## Specification Fields

| Field | Description |
|-------|-------------|
| `implementation` | The type of condition. Common values: `ReleaseTitleSpecification`, `SourceSpecification`, `ResolutionSpecification`, `QualityModifierSpecification` |
| `negate` | When `true`, the condition is inverted (matches when the pattern is NOT found) |
| `required` | When `true`, this condition must match for the custom format to apply |

## Notes

- Custom formats are managed with full CRUD (create, update, delete)
- To assign scores, use quality profiles in the Servarr UI or API after custom formats are created
- The `includeCustomFormatWhenRenaming` flag controls whether the custom format name appears in renamed file names
