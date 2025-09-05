import type { DownloadClient } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class DownloadClientsStep extends ConfigurationStep {
  readonly name = 'download-clients'
  readonly description = 'Configure Servarr download clients'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready and API key is available
    return context.servarrClient.isReady()
  }

  async readCurrentState(context: StepContext): Promise<DownloadClient[]> {
    try {
      context.logger.debug('Reading current download clients...')
      const result = await context.servarrClient.getDownloadClients()
      context.logger.debug('Current download clients read', { count: result.length })
      return result
    } catch (error) {
      context.logger.warn('Failed to read current download clients', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  protected getDesiredState(context: StepContext): DownloadClient[] {
    // Get from loaded configuration
    const servarrConfig = context.servarrConfig
    return (servarrConfig?.downloadClients as DownloadClient[]) || []
  }

  compareAndPlan(
    current: DownloadClient[],
    desired: DownloadClient[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentNames = current.map((c) => c.name)
    const desiredNames = desired.map((c) => c.name)

    // Find download clients to add
    for (const client of desired) {
      if (!currentNames.includes(client.name)) {
        changes.push({
          type: 'create',
          resource: 'download-client',
          identifier: client.name,
          details: {
            name: client.name,
            implementation: client.implementation,
            implementationName: client.implementationName,
            configContract: client.configContract,
            enable: client.enable,
            priority: client.priority,
            fieldCount: client.fields?.length || 0,
          },
        })
      }
    }

    // Find download clients to remove
    for (const client of current) {
      if (!desiredNames.includes(client.name)) {
        changes.push({
          type: 'delete',
          resource: 'download-client',
          identifier: client.name,
          details: {
            name: client.name,
            implementation: client.implementation,
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

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          // Get the full download client from desired state
          const desiredClients = this.getDesiredState(context)
          const client = desiredClients.find((c) => c.name === change.identifier)

          if (client) {
            context.logger.debug('About to call addDownloadClient', {
              clientName: client.name,
              hasServarrClient: !!context.servarrClient,
              servarrClientType: context.servarrClient?.constructor?.name,
            })

            try {
              await context.servarrClient.addDownloadClient(client)
              results.push({
                ...change,
                type: 'create',
              })

              context.logger.info('Download client added successfully', {
                name: client.name,
                implementation: client.implementation,
              })
            } catch (innerError) {
              context.logger.error('Direct error from addDownloadClient', {
                error: innerError,
                errorType: typeof innerError,
                errorMessage: innerError instanceof Error ? innerError.message : String(innerError),
                errorStack: innerError instanceof Error ? innerError.stack : undefined,
              })
              throw innerError
            }
          } else {
            errors.push(
              new Error(`Download client not found in desired state: ${change.identifier}`),
            )
          }
        } else if (change.type === 'delete') {
          await context.servarrClient.removeDownloadClient(change.identifier)
          results.push({
            ...change,
            type: 'delete',
          })

          context.logger.info('Download client removed successfully', {
            name: change.identifier,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage download client', {
          error: stepError.message,
          change: change.identifier,
          details: change.details,
          fullError: error,
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
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)
      const currentNames = current.map((c) => c.name).sort()
      const desiredNames = desired.map((c) => c.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Download clients verification failed', { error })
      return false
    }
  }
}
