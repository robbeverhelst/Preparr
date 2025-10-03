import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class ConfigLoadingStep extends ConfigurationStep {
  readonly name = 'config-loading'
  readonly description = 'Validate configuration presence and summarize desired state'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'both'

  validatePrerequisites(_context: StepContext): boolean {
    return true
  }

  readCurrentState(context: StepContext): Promise<{ configLoaded: boolean; configPath?: string }> {
    const configPath = context.config.configPath
    const hasDesired = !!context.config.app

    // Debug logging
    context.logger.info('DEBUG: Configuration analysis', {
      configPath,
      hasApp: !!context.config.app,
      appType: typeof context.config.app,
      appKeys: context.config.app ? Object.keys(context.config.app) : [],
      appStringified: context.config.app
        ? JSON.stringify(context.config.app, null, 2)
        : 'undefined',
    })

    if (hasDesired) {
      context.logger.info('Desired-state present in unified configuration', {
        rootFolders: context.config.app.rootFolders?.length || 0,
        indexers: context.config.app.indexers?.length || 0,
        downloadClients: context.config.app.downloadClients?.length || 0,
        qualityProfiles: context.config.app.qualityProfiles?.length || 0,
        applications: context.config.app.applications?.length || 0,
      })
    } else {
      context.logger.info('DEBUG: No app configuration found in context.config')
    }
    return Promise.resolve({ configLoaded: hasDesired, configPath })
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

  executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        results.push(change)
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to load configuration', {
          error: stepError.message,
          configPath: change.details?.configPath,
        })
      }
    }

    return Promise.resolve({
      success: errors.length === 0,
      changes: results,
      errors,
      warnings,
    })
  }

  verifySuccess(context: StepContext): boolean {
    return !!context.config.app
  }
}
