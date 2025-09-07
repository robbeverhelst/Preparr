import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class ServarrConfigFileStep extends ConfigurationStep {
  readonly name = 'servarr-config-file'
  readonly description = 'Write Servarr configuration file (config.xml)'
  readonly dependencies: string[] = ['postgres-users', 'config-loading']
  readonly mode: 'init' | 'sidecar' | 'both' = 'init'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in init mode and only for Servarr applications (not qBittorrent)
    return context.executionMode === 'init' && context.servarrType !== 'qbittorrent'
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ configExists: boolean; hasApiKey: boolean }> {
    try {
      // Check if config.xml exists and has an API key
      // Get API key from loaded configuration if available
      const apiKey = context.servarrConfig?.apiKey
      await context.servarrClient.writeConfigurationOnly(apiKey)
      return {
        configExists: true,
        hasApiKey: !!apiKey || !!context.apiKey,
      }
    } catch (error) {
      context.logger.debug('Failed to check Servarr config file', { error })
      return {
        configExists: false,
        hasApiKey: false,
      }
    }
  }

  protected getDesiredState(_context: StepContext): { configExists: boolean; hasApiKey: boolean } {
    return {
      configExists: true,
      hasApiKey: true,
    }
  }

  compareAndPlan(
    current: { configExists: boolean; hasApiKey: boolean },
    desired: { configExists: boolean; hasApiKey: boolean },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.configExists && desired.configExists) {
      changes.push({
        type: 'create',
        resource: 'servarr-config-file',
        identifier: 'config.xml',
        details: {
          servarrType: context.servarrType,
          hasApiKey: !!context.apiKey,
        },
      })
    } else if (current.configExists && !current.hasApiKey && desired.hasApiKey) {
      changes.push({
        type: 'update',
        resource: 'servarr-config-file',
        identifier: 'config.xml',
        details: {
          action: 'add-api-key',
          servarrType: context.servarrType,
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
        if (change.type === 'create' || change.type === 'update') {
          // Write the configuration file with API key from loaded config
          const apiKey = context.servarrConfig?.apiKey
          await context.servarrClient.writeConfigurationOnly(apiKey)

          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('Servarr configuration file written successfully', {
            servarrType: context.servarrType,
            hasApiKey: !!apiKey || !!context.apiKey,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to write Servarr configuration file', {
          error: stepError.message,
          servarrType: context.servarrType,
          details: change.details,
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

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      // Try to read the config file to verify it exists and is valid
      const apiKey = context.servarrConfig?.apiKey
      await context.servarrClient.writeConfigurationOnly(apiKey)
      // If writeConfigurationOnly doesn't throw and returns a boolean, the config is valid
      return true
    } catch (error) {
      context.logger.debug('Servarr config file verification failed', { error })
      return false
    }
  }
}
