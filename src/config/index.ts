import { logger } from '../utils/logger'
import { defaultConfig } from './defaults'
import { generateHelpText, parseCliArgs } from './loaders/cli'
import { loadEnvironmentConfig } from './loaders/env'
import { findConfigFile, loadConfigFile } from './loaders/file'
import {
  createConfigurationSource,
  mergeConfigsWithEnvOverride,
  validateRequiredFields,
} from './merger'
import { type Config, ConfigSchema } from './schema'
export interface ConfigurationResult {
  config: Config
  sources: ReturnType<typeof createConfigurationSource>
  metadata: {
    configFilePath: string | null
    configFileFormat: string | null
    cliArgs: ReturnType<typeof parseCliArgs>
    validationErrors: string[]
  }
}

export async function loadConfiguration(args?: string[]): Promise<ConfigurationResult> {
  const cliArgs = parseCliArgs(args)

  if (cliArgs.help) {
    process.stdout.write(`${generateHelpText()}\n`)
    process.exit(0)
  }

  if (cliArgs.version) {
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

  // Load environment config early to use for config path resolution
  const envConfig = loadEnvironmentConfig()

  const configPath = cliArgs.config.configPath || envConfig.configPath || defaultConfig.configPath

  const configFilePath = await findConfigFile(configPath)

  let fileConfig: Partial<Config> | null = null
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

  const mergedConfig = mergeConfigsWithEnvOverride(
    defaultConfig,
    fileConfig,
    envConfig,
    cliArgs.config,
  )

  const requiredFieldErrors = validateRequiredFields(mergedConfig)
  if (requiredFieldErrors.length > 0) {
    throw new Error(
      `Configuration validation failed:\\n${requiredFieldErrors.map((err) => `  - ${err}`).join('\\n')}`,
    )
  }

  let validatedConfig: Config
  const validationErrors: string[] = []

  try {
    validatedConfig = ConfigSchema.parse(mergedConfig)
  } catch (error) {
    if (error instanceof Error) {
      validationErrors.push(error.message)
    }
    throw new Error(`Configuration schema validation failed: ${error}`)
  }

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
export type { Config } from './schema'
