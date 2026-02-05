import type { Indexer } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'

export class IndexersStep extends ConfigurationStep {
  readonly name = 'indexers'
  readonly description = 'Configure Servarr indexers'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    if (!context.servarrClient) return false
    if (!context.servarrClient!.isReady()) {
      return false
    }

    const config = context.config.app

    // Skip indexer management if Prowlarr sync is enabled
    if (config?.prowlarrSync === true) {
      context.logger.info(
        'Prowlarr sync enabled, skipping indexer management (allowing Prowlarr to manage indexers)',
      )
      return false
    }

    // Skip indexer management if indexers field is not defined or empty in config
    // This allows Prowlarr to manage indexers via sync instead (fallback for configs without prowlarrSync flag)
    if (
      !config ||
      config.indexers === undefined ||
      (Array.isArray(config.indexers) && config.indexers.length === 0)
    ) {
      context.logger.info(
        'Indexers not defined or empty in config, skipping indexer management (allowing Prowlarr sync)',
      )
      return false
    }

    return true
  }

  async readCurrentState(context: StepContext): Promise<Indexer[]> {
    try {
      return await context.servarrClient!.getIndexers()
    } catch (error) {
      context.logger.warn('Failed to read current indexers', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): Indexer[] {
    // Get indexers from the loaded configuration - using servarrConfig from config loading step
    const config = context.config.app
    context.logger.debug('Getting desired indexer state', {
      hasConfig: !!config,
      hasIndexers: !!config?.indexers,
      indexerCount: config?.indexers?.length || 0,
      indexerNames: config?.indexers?.map((i) => i.name) || [],
    })

    if (!config || !config.indexers) {
      context.logger.warn('No configuration or indexers found in context')
      return []
    }

    // Debug log the actual indexer objects
    for (const indexer of config.indexers) {
      context.logger.debug('Loaded indexer from config', {
        name: indexer.name,
        appProfileId: indexer.appProfileId,
        fullIndexer: JSON.stringify(indexer, null, 2),
      })
    }

    return config.indexers
  }

  compareAndPlan(current: Indexer[], desired: Indexer[], _context: StepContext): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentNames = current.map((i) => i.name)
    const desiredNames = desired.map((i) => i.name)

    // Find indexers to add
    for (const indexer of desired) {
      if (!currentNames.includes(indexer.name)) {
        changes.push({
          type: 'create',
          resource: 'indexer',
          identifier: indexer.name,
          details: {
            name: indexer.name,
            implementation: indexer.implementation,
            implementationName: indexer.implementationName,
            configContract: indexer.configContract,
            enable: indexer.enable,
            priority: indexer.priority,
            fieldCount: indexer.fields?.length || 0,
          },
        })
      }
    }

    // Find indexers to remove
    for (const indexer of current) {
      if (!desiredNames.includes(indexer.name)) {
        changes.push({
          type: 'delete',
          resource: 'indexer',
          identifier: indexer.name,
          details: {
            name: indexer.name,
            implementation: indexer.implementation,
          },
        })
      }
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    // Get the full desired state for reference
    const desiredIndexers = this.getDesiredState(context)

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          // Find the full indexer object from desired state
          const desiredIndexer = desiredIndexers.find((i) => i.name === change.identifier)

          if (!desiredIndexer) {
            throw new Error(`Could not find indexer ${change.identifier} in desired state`)
          }

          context.logger.debug('Adding indexer with full config', {
            name: desiredIndexer.name,
            appProfileId: desiredIndexer.appProfileId,
            fields: desiredIndexer.fields,
            fullIndexer: JSON.stringify(desiredIndexer, null, 2),
          })

          await context.servarrClient!.addIndexer(desiredIndexer)
          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('Indexer added successfully', {
            name: desiredIndexer.name,
            implementation: desiredIndexer.implementation,
            appProfileId: desiredIndexer.appProfileId,
          })
        } else if (change.type === 'delete') {
          await context.servarrClient!.removeIndexer(change.identifier)
          results.push({
            ...change,
            type: 'delete',
          })

          context.logger.info('Indexer removed successfully', {
            name: change.identifier,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))

        // Check if this is an indexer connection/validation error (non-fatal)
        const errorMessage = stepError.message.toLowerCase()
        const isConnectionError =
          errorMessage.includes('unable to connect') ||
          errorMessage.includes('404') ||
          errorMessage.includes('http request failed') ||
          errorMessage.includes('validationfailure')

        if (isConnectionError) {
          // Log as warning for connection issues, but don't fail the step
          context.logger.warn('Indexer connection failed, skipping but continuing', {
            name: change.identifier,
            error: stepError.message,
            details: change.details,
          })
          warnings.push(
            new Warning(`Indexer "${change.identifier}" failed to connect: ${stepError.message}`, {
              name: change.identifier,
              error: stepError.message,
            }),
          )
        } else {
          // For other errors (like API errors, config issues), still treat as errors
          errors.push(stepError)
          context.logger.error('Failed to manage indexer', {
            error: stepError.message,
            change: change.identifier,
            name: change.identifier,
            details: change.details,
          })
        }
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
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)
      const currentNames = current.map((i) => i.name).sort()
      const desiredNames = desired.map((i) => i.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Indexers verification failed', { error })
      return false
    }
  }
}
