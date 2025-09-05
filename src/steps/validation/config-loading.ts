import type { ServarrApplicationConfig } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'
import { file } from 'bun'

export class ConfigLoadingStep extends ConfigurationStep {
  readonly name = 'config-loading'
  readonly description = 'Load Servarr configuration from files'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'both'

  validatePrerequisites(_context: StepContext): boolean {
    // Always run - config loading is foundational
    return true
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ configLoaded: boolean; configPath?: string }> {
    try {
      const configPath = context.config.configPath
      context.logger.debug('Config loading readCurrentState', {
        configPath,
        hasExistingConfig: !!context.servarrConfig,
      })

      if (!configPath) {
        context.logger.debug('No config path provided')
        return { configLoaded: false }
      }

      const configFile = file(configPath)
      const exists = await configFile.exists()
      context.logger.debug('Config file check', { configPath, exists })

      // If config exists and isn't already loaded, load it now
      if (exists && !context.servarrConfig) {
        context.logger.debug('Loading config file...')
        const config = await this.loadConfigFile(configPath, context)
        if (config) {
          context.servarrConfig = config
          context.logger.info('Servarr configuration loaded successfully in readCurrentState', {
            configPath,
            rootFolders: config.rootFolders.length,
            indexers: config.indexers.length,
            downloadClients: config.downloadClients.length,
            qualityProfiles: config.qualityProfiles.length,
          })
        } else {
          context.logger.warn('Failed to load config file')
        }
      } else {
        context.logger.debug('Config not loaded', { exists, hasExisting: !!context.servarrConfig })
      }

      return { configLoaded: exists, configPath }
    } catch (error) {
      context.logger.error('Failed in config loading readCurrentState', { error })
      return { configLoaded: false }
    }
  }

  protected getDesiredState(_context: StepContext): { configLoaded: boolean } {
    return { configLoaded: true }
  }

  compareAndPlan(
    current: { configLoaded: boolean; configPath?: string },
    desired: { configLoaded: boolean },
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.configLoaded && desired.configLoaded && current.configPath) {
      changes.push({
        type: 'create',
        resource: 'config-loading',
        identifier: 'servarr-config',
        details: {
          configPath: current.configPath,
          action: 'load-config',
        },
      })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create' && change.details?.action === 'load-config') {
          const configPath = change.details.configPath as string
          const config = await this.loadConfigFile(configPath, context)

          if (config) {
            // Store the loaded config in the context
            context.servarrConfig = config
            results.push({
              ...change,
              type: 'create',
            })

            context.logger.info('Servarr configuration loaded successfully', {
              configPath,
              rootFolders: config.rootFolders.length,
              indexers: config.indexers.length,
              downloadClients: config.downloadClients.length,
              qualityProfiles: config.qualityProfiles.length,
            })
          } else {
            warnings.push(new Warning('No configuration found or config file is empty'))
          }
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to load configuration', {
          error: stepError.message,
          configPath: change.details?.configPath,
        })
      }
    }

    return {
      success: errors.length === 0,
      changes: results,
      errors,
      warnings,
    }
  }

  verifySuccess(context: StepContext): boolean {
    // Check if config was loaded successfully
    return !!context.servarrConfig
  }

  private async loadConfigFile(
    configPath: string,
    context: StepContext,
  ): Promise<ServarrApplicationConfig | null> {
    try {
      const configFile = file(configPath)

      if (!(await configFile.exists())) {
        context.logger.debug('Config file does not exist', { configPath })
        return null
      }

      const content = await configFile.text()
      if (!content.trim()) {
        context.logger.debug('Config file is empty', { configPath })
        return null
      }

      // Try to parse as JSON first, then YAML
      let config: ServarrApplicationConfig
      try {
        config = JSON.parse(content)
      } catch {
        // If JSON parsing fails, try YAML (would need a YAML parser)
        context.logger.warn('YAML parsing not implemented, only JSON configs supported', {
          configPath,
        })
        return null
      }

      // Basic validation
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration format')
      }

      // Ensure required arrays exist
      config.rootFolders = config.rootFolders || []
      config.indexers = config.indexers || []
      config.downloadClients = config.downloadClients || []
      config.qualityProfiles = config.qualityProfiles || []
      config.applications = config.applications || []

      return config
    } catch (error) {
      context.logger.error('Failed to load configuration file', {
        configPath,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
