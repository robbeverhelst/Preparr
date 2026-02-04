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

  // Check required fields
  if (!config.postgres?.password) {
    errors.push('postgres.password is required')
  }

  if (!config.servarr?.adminPassword && config.servarr?.type !== 'qbittorrent' && config.servarr?.type !== 'bazarr') {
    errors.push('servarr.adminPassword is required when type is not qbittorrent or bazarr')
  }

  if (!config.servarr?.url && config.servarr?.type !== 'qbittorrent' && config.servarr?.type !== 'bazarr') {
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
 * Merge configurations with environment variable override for sensitive fields
 * This ensures environment variables can override file configuration for credentials
 */
export function mergeConfigsWithEnvOverride(
  defaults: Partial<Config>,
  fileConfig: Partial<Config> | null,
  envConfig: Partial<Config>,
  cliConfig: Partial<Config>,
): Partial<Config> {
  // First merge defaults, file, and CLI configs
  const baseConfig = mergeConfigs(defaults, fileConfig, cliConfig)

  // Then apply environment variable overrides for sensitive fields
  const result: Partial<Config> = { ...baseConfig }

  // Override sensitive postgres fields if provided in environment
  if (envConfig.postgres?.password !== undefined) {
    result.postgres = {
      ...(result.postgres || {}),
      password: envConfig.postgres.password,
    } as unknown as Config['postgres']
  }
  if (envConfig.postgres?.username !== undefined) {
    result.postgres = {
      ...(result.postgres || {}),
      username: envConfig.postgres.username,
    } as unknown as Config['postgres']
  }
  if (envConfig.postgres?.host !== undefined) {
    result.postgres = {
      ...(result.postgres || {}),
      host: envConfig.postgres.host,
    } as unknown as Config['postgres']
  }
  if (envConfig.postgres?.port !== undefined) {
    result.postgres = {
      ...(result.postgres || {}),
      port: envConfig.postgres.port,
    } as unknown as Config['postgres']
  }
  if (envConfig.postgres?.database !== undefined) {
    result.postgres = {
      ...(result.postgres || {}),
      database: envConfig.postgres.database,
    } as unknown as Config['postgres']
  }

  // Override sensitive servarr fields if provided in environment
  if (envConfig.servarr?.apiKey !== undefined) {
    result.servarr = {
      ...(result.servarr || {}),
      apiKey: envConfig.servarr.apiKey,
    } as unknown as Config['servarr']
  }
  if (envConfig.servarr?.adminPassword !== undefined) {
    result.servarr = {
      ...(result.servarr || {}),
      adminPassword: envConfig.servarr.adminPassword,
    } as unknown as Config['servarr']
  }
  if (envConfig.servarr?.adminUser !== undefined) {
    result.servarr = {
      ...(result.servarr || {}),
      adminUser: envConfig.servarr.adminUser,
    } as unknown as Config['servarr']
  }
  if (envConfig.servarr?.url !== undefined) {
    result.servarr = {
      ...(result.servarr || {}),
      url: envConfig.servarr.url,
    } as unknown as Config['servarr']
  }
  if (envConfig.servarr?.type !== undefined) {
    result.servarr = {
      ...(result.servarr || {}),
      type: envConfig.servarr.type,
    } as unknown as Config['servarr']
  }

  // Override sensitive service fields if provided in environment
  const serviceOverrides =
    envConfig.services?.qbittorrent?.username !== undefined ||
    envConfig.services?.qbittorrent?.password !== undefined ||
    envConfig.services?.qbittorrent?.url !== undefined ||
    envConfig.services?.prowlarr?.apiKey !== undefined ||
    envConfig.services?.prowlarr?.url !== undefined

  if (serviceOverrides) {
    result.services = { ...(result.services || {}) } as unknown as Config['services']
  }

  if (envConfig.services?.qbittorrent?.username !== undefined) {
    ;(result.services as NonNullable<Config['services']>).qbittorrent = {
      ...(result.services?.qbittorrent || {}),
      username: envConfig.services.qbittorrent.username,
    } as unknown as NonNullable<Config['services']>['qbittorrent']
  }
  if (envConfig.services?.qbittorrent?.password !== undefined) {
    ;(result.services as NonNullable<Config['services']>).qbittorrent = {
      ...(result.services?.qbittorrent || {}),
      password: envConfig.services.qbittorrent.password,
    } as unknown as NonNullable<Config['services']>['qbittorrent']
  }
  if (envConfig.services?.qbittorrent?.url !== undefined) {
    ;(result.services as NonNullable<Config['services']>).qbittorrent = {
      ...(result.services?.qbittorrent || {}),
      url: envConfig.services.qbittorrent.url,
    } as unknown as NonNullable<Config['services']>['qbittorrent']
  }
  if (envConfig.services?.prowlarr?.apiKey !== undefined) {
    ;(result.services as NonNullable<Config['services']>).prowlarr = {
      ...(result.services?.prowlarr || {}),
      apiKey: envConfig.services.prowlarr.apiKey,
    } as unknown as NonNullable<Config['services']>['prowlarr']
  }
  if (envConfig.services?.prowlarr?.url !== undefined) {
    ;(result.services as NonNullable<Config['services']>).prowlarr = {
      ...(result.services?.prowlarr || {}),
      url: envConfig.services.prowlarr.url,
    } as unknown as NonNullable<Config['services']>['prowlarr']
  }

  // Apply other environment overrides
  if (envConfig.logLevel !== undefined) result.logLevel = envConfig.logLevel
  if (envConfig.logFormat !== undefined) result.logFormat = envConfig.logFormat
  if (envConfig.configPath !== undefined) result.configPath = envConfig.configPath
  if (envConfig.configWatch !== undefined) result.configWatch = envConfig.configWatch
  if (envConfig.configReconcileInterval !== undefined) {
    result.configReconcileInterval = envConfig.configReconcileInterval
  }
  if (envConfig.health?.port !== undefined) {
    result.health = { ...(result.health || {}), port: envConfig.health.port }
  }

  return result
}
