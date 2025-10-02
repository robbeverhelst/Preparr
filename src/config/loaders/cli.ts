import { type CliKey, cliMapping } from '../defaults'
import type { Config } from '../schema'

/**
 * CLI argument parsing result
 */
export interface CliArgs {
  // Special flags
  init: boolean
  help: boolean
  version: boolean
  generateApiKey: boolean

  // Configuration overrides
  config: Partial<Config>

  // Raw arguments for debugging
  raw: string[]
}

/**
 * Parse CLI arguments into configuration overrides
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): CliArgs {
  const result: CliArgs = {
    init: false,
    help: false,
    version: false,
    generateApiKey: false,
    config: {},
    raw: args,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Handle special flags
    if (arg === '--init') {
      result.init = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true
      continue
    }

    if (arg === '--version' || arg === '-v') {
      result.version = true
      continue
    }

    if (arg === '--generate-api-key') {
      result.generateApiKey = true
      continue
    }

    // Handle configuration arguments
    if (arg?.startsWith('--')) {
      const nextArg = args[i + 1]
      const parsed = parseArgument(arg, nextArg)

      if (parsed) {
        const { key, value } = parsed

        // Map CLI key to config path
        const configPath = cliMapping[key as CliKey]
        if (configPath) {
          setNestedValue(result.config, configPath, convertCliValue(value))

          // Skip next argument if it was used as a value
          if (!arg.includes('=')) {
            i++
          }
        }
      }
    }
  }

  return result
}

/**
 * Parse a single CLI argument
 * Supports both --key=value and --key value formats
 */
function parseArgument(arg: string, nextArg?: string): { key: string; value: string } | null {
  // Remove leading dashes
  const cleanArg = arg.replace(/^--/, '')

  // Handle --key=value format
  if (cleanArg.includes('=')) {
    const [key, ...valueParts] = cleanArg.split('=')
    if (!key) return null
    return {
      key,
      value: valueParts.join('='), // In case value contains '='
    }
  }

  // Handle --key value format
  if (nextArg && !nextArg.startsWith('-')) {
    return {
      key: cleanArg,
      value: nextArg,
    }
  }

  // Handle boolean flags (--key with no value)
  return {
    key: cleanArg,
    value: 'true',
  }
}

/**
 * Set a nested value in an object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj

  // Navigate to the parent of the target property
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (key && (!current[key] || typeof current[key] !== 'object')) {
      current[key] = {}
    }
    if (key) {
      current = current[key] as Record<string, unknown>
    }
  }

  // Set the final value
  const finalKey = keys[keys.length - 1]
  if (finalKey) {
    current[finalKey] = value
  }
}

/**
 * Convert CLI argument values to appropriate types
 */
function convertCliValue(value: string): unknown {
  // Handle quoted values
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  // JSON objects/arrays
  const first = value.trim()[0]
  if (first === '{' || first === '[') {
    try {
      return JSON.parse(value)
    } catch {
      // fall through
    }
  }

  // Boolean values
  if (value.toLowerCase() === 'true') {
    return true
  }
  if (value.toLowerCase() === 'false') {
    return false
  }

  // Numbers (integers)
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }

  // Numbers (floats)
  if (/^\d*\.\d+$/.test(value)) {
    return Number.parseFloat(value)
  }

  // Arrays (comma-separated values)
  if (value.includes(',')) {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '')
  }

  // Default to string
  return value
}

/**
 * Generate help text for CLI arguments
 */
export function generateHelpText(): string {
  const configOptions = Object.entries(cliMapping)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cliKey]) => `  --${cliKey}`)
    .join('\\n')

  return `
PrepArr - Servarr Automation Tool

Usage: preparr [OPTIONS]

Special Options:
  --init              Run in init mode (setup databases, config, then exit)
  --help, -h          Show this help message
  --version, -v       Show version information
  --generate-api-key  Generate a new API key and exit

Configuration Options:
${configOptions}

Examples:
  preparr --init
  preparr --postgres-host=db.example.com --postgres-port=5433
  preparr --servarr-url=http://sonarr:8989 --servarr-type=sonarr
  preparr --config-path=/custom/config.yaml --log-level=debug

Configuration Priority (highest to lowest):
  1. CLI arguments (--postgres-host=localhost)
  2. Environment variables (POSTGRES_HOST=localhost)
  3. Configuration files (YAML/JSON/TOML)
  4. Default values

Supported config file formats:
  - YAML: config.yaml, config.yml
  - JSON: config.json  
  - TOML: config.toml

Config file locations (searched in order):
  - /config/servarr.yaml
  - ./config.yaml
  - ./preparr.yaml
`
}
