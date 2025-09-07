import { logger } from '../utils/logger'
import { defaultConfig } from './defaults'
import { generateHelpText, parseCliArgs } from './loaders/cli'
import { loadEnvironmentConfig } from './loaders/env'
import { findConfigFile, loadConfigFile } from './loaders/file'
import { createConfigurationSource, mergeConfigs, validateRequiredFields } from './merger'
import { type EnvironmentConfig, EnvironmentConfigSchema } from './schema'

/**
 * Configuration loading result
 */
export interface ConfigurationResult {
  config: EnvironmentConfig
  sources: ReturnType<typeof createConfigurationSource>
  metadata: {
    configFilePath: string | null
    configFileFormat: string | null
    cliArgs: ReturnType<typeof parseCliArgs>
    validationErrors: string[]
  }
}

/**
 * Load complete configuration from all sources
 * Priority: CLI args > Environment vars > Config file > Defaults
 */
export async function loadConfiguration(args?: string[]): Promise<ConfigurationResult> {
  // 1. Parse CLI arguments first (needed for --config-path)
  const cliArgs = parseCliArgs(args)

  // Handle special flags
  if (cliArgs.help) {
    process.stdout.write(`${generateHelpText()}\n`)
    process.exit(0)
  }

  if (cliArgs.version) {
    // Get version from package.json
    const packageJson = await Bun.file('package.json').json()
    process.stdout.write(`PrepArr v${packageJson.version || 'unknown'}\n`)
    process.exit(0)
  }

  if (cliArgs.generateApiKey) {
    const { generateApiKey } = await import('../utils/api-key')
    const apiKey = generateApiKey()
    process.stdout.write(`${apiKey}\n`)
    process.exit(0)
  }

  // 2. Load configuration file (respecting --config-path from CLI)
  const configPath = cliArgs.config.configPath || defaultConfig.configPath
  const configFilePath = await findConfigFile(configPath)
  let fileConfig: Partial<EnvironmentConfig> | null = null
  let configFileFormat: string | null = null

  if (configFilePath) {
    try {
      fileConfig = await loadConfigFile(configFilePath)
      configFileFormat = configFilePath.split('.').pop() || null
    } catch (error) {
      throw new Error(
        `Failed to load config file: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // 3. Load environment variables
  const envConfig = loadEnvironmentConfig()

  // 4. Merge all configuration sources
  const mergedConfig = mergeConfigs(defaultConfig, fileConfig, envConfig, cliArgs.config)

  // 5. Validate required fields before Zod validation
  const requiredFieldErrors = validateRequiredFields(mergedConfig)
  if (requiredFieldErrors.length > 0) {
    throw new Error(
      `Configuration validation failed:\\n${requiredFieldErrors.map((err) => `  - ${err}`).join('\\n')}`,
    )
  }

  // 6. Final validation with Zod schema
  let validatedConfig: EnvironmentConfig
  const validationErrors: string[] = []

  try {
    validatedConfig = EnvironmentConfigSchema.parse(mergedConfig)
  } catch (error) {
    if (error instanceof Error) {
      validationErrors.push(error.message)
    }
    throw new Error(`Configuration schema validation failed: ${error}`)
  }

  // 7. Create configuration sources for debugging
  const sources = createConfigurationSource(defaultConfig, fileConfig, envConfig, cliArgs.config)

  return {
    config: validatedConfig,
    sources,
    metadata: {
      configFilePath,
      configFileFormat,
      cliArgs,
      validationErrors,
    },
  }
}

/**
 * Load configuration with error handling and logging
 */
export async function loadConfigurationSafe(args?: string[]): Promise<ConfigurationResult> {
  try {
    return await loadConfiguration(args)
  } catch (error) {
    logger.error('Configuration loading failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    logger.error('Tips:')
    logger.error(
      '  - Check that required environment variables are set (POSTGRES_PASSWORD, SERVARR_ADMIN_PASSWORD)',
    )
    logger.error('  - Verify configuration file syntax if using config files')
    logger.error('  - Use --help to see all available configuration options')

    process.exit(1)
  }
}

// Re-export types and utilities
export type { EnvironmentConfig } from './schema'
