import type { Config } from './schema'

/**
 * Deep merge multiple configuration objects with special handling for sensitive fields
 * Later objects override earlier ones, but environment variables can override file config for sensitive fields
 */
export function mergeConfigs(
  ...configs: Array<Partial<Config> | null | undefined>
): Partial<Config> {
  const result = {}

  for (const config of configs) {
    if (config) {
      deepMerge(result, config)
    }
  }

  return result
}

/**
 * Deep merge two objects, handling nested objects and arrays
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  if (!source || typeof source !== 'object') {
    return target
  }

  for (const key in source) {
    if (Object.hasOwn(source, key)) {
      const sourceValue = source[key]
      const targetValue = target[key]

      if (sourceValue === null || sourceValue === undefined) {
        // Skip null/undefined values
        continue
      }

      if (Array.isArray(sourceValue)) {
        // Replace arrays completely (don't merge array contents)
        target[key] = [...sourceValue]
      } else if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        // Recursively merge objects
        target[key] = deepMerge(
          { ...(targetValue as Record<string, unknown>) },
          sourceValue as Record<string, unknown>,
        )
      } else {
        // Direct assignment for primitives and non-plain objects
        target[key] = sourceValue
      }
    }
  }

  return target
}

/**
 * Check if a value is a plain object (not array, date, etc.)
 */
function isPlainObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

/**
 * Remove undefined values from configuration
 * This helps with proper merging and validation
 */
export function cleanConfig(config: Partial<Config>): Partial<Config> {
  return JSON.parse(
    JSON.stringify(config, (_, value) => {
      return value === undefined ? null : value
    }),
  )
}

/**
 * Validate that required fields will be available after merging
 * This gives better error messages than waiting for Zod validation
 */
export function validateRequiredFields(config: Partial<Config>): string[] {
  const errors: string[] = []
  const isQbittorrentDeployment = config.servarr?.type === 'qbittorrent'

  // Check required fields
  if (!isQbittorrentDeployment && !config.postgres?.password) {
    errors.push('postgres.password is required')
  }

  if (
    !config.servarr?.adminPassword &&
    config.servarr?.type !== 'qbittorrent' &&
    config.servarr?.type !== 'bazarr'
  ) {
    errors.push('servarr.adminPassword is required when type is not qbittorrent or bazarr')
  }

  if (
    !config.servarr?.url &&
    config.servarr?.type !== 'qbittorrent' &&
    config.servarr?.type !== 'bazarr'
  ) {
    errors.push('servarr.url is required when type is not qbittorrent or bazarr')
  }

  return errors
}

/**
 * Get configuration source information for debugging
 */
export interface ConfigurationSource {
  defaults: Partial<Config>
  file: Partial<Config> | null
  environment: Partial<Config>
  cli: Partial<Config>
  merged: Partial<Config>
}

/**
 * Create a configuration source object for debugging/logging
 */
export function createConfigurationSource(
  defaults: Partial<Config>,
  fileConfig: Partial<Config> | null,
  envConfig: Partial<Config>,
  cliConfig: Partial<Config>,
): ConfigurationSource {
  const merged = mergeConfigs(defaults, fileConfig, envConfig, cliConfig)

  return {
    defaults,
    file: fileConfig,
    environment: envConfig,
    cli: cliConfig,
    merged,
  }
}

/**
 * Merge configurations with environment variable override for sensitive fields.
 * Priority: defaults < file < env < CLI
 */
export function mergeConfigsWithEnvOverride(
  defaults: Partial<Config>,
  fileConfig: Partial<Config> | null,
  envConfig: Partial<Config>,
  cliConfig: Partial<Config>,
): Partial<Config> {
  return mergeConfigs(defaults, fileConfig, envConfig, cliConfig)
}
