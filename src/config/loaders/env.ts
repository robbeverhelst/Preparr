import { env } from 'bun'
import { type EnvKey, envMapping } from '../defaults'
import type { Config } from '../schema'

/**
 * Load configuration from environment variables
 */
export function loadEnvironmentConfig(): Partial<Config> {
  const config: Record<string, unknown> = {}

  // Process each environment variable mapping
  for (const [envVar, configPath] of Object.entries(envMapping) as [EnvKey, string][]) {
    const value = env[envVar]

    if (value !== undefined && value !== '') {
      setNestedValue(config, configPath, convertEnvValue(value))
    }
  }

  return config
}

/**
 * Set a nested value in an object using dot notation
 * Example: setNestedValue(obj, 'postgres.host', 'localhost')
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
 * Convert environment variable string values to appropriate types
 */
function convertEnvValue(value: string): unknown {
  // Handle empty strings
  if (value === '') {
    return undefined
  }

  // JSON objects/arrays
  const first = value.trim()[0]
  if (first === '{' || first === '[') {
    try {
      return JSON.parse(value)
    } catch {
      // fall through to other parsing
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
 * Get all available environment variables for debugging
 */
export function getEnvironmentInfo(): {
  available: Record<string, string>
  mapped: Record<string, unknown>
  unmapped: Record<string, string>
} {
  const available: Record<string, string> = {}
  const mapped: Record<string, unknown> = {}
  const unmapped: Record<string, string> = {}

  // Get all environment variables
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      available[key] = value
    }
  }

  // Categorize mapped vs unmapped
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      if (key in envMapping) {
        mapped[key] = convertEnvValue(value)
      } else if (
        key.startsWith('POSTGRES_') ||
        key.startsWith('SERVARR_') ||
        key.startsWith('QBITTORRENT_') ||
        key.startsWith('PROWLARR_') ||
        key.startsWith('CONFIG_') ||
        key.startsWith('LOG_') ||
        key.startsWith('HEALTH_')
      ) {
        unmapped[key] = value
      }
    }
  }

  return { available, mapped, unmapped }
}
