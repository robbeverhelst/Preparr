import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'

export class ServarrConnectivityStep extends ConfigurationStep {
  readonly name = 'servarr-connectivity'
  readonly description = 'Validate Servarr connectivity and API access'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    if (!context.servarrClient) return false
    if (context.executionMode === 'init') return false
    return context.executionMode === 'sidecar'
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ connected: boolean; type?: string; version?: string }> {
    try {
      if (!context.servarrClient!.isReady()) {
        return { connected: false }
      }

      const connected = await context.servarrClient!.testConnection()
      const type = context.servarrClient!.getType()

      return { connected, type }
    } catch (error) {
      context.logger.debug('Servarr connection test failed', { error })
      return { connected: false }
    }
  }

  protected getDesiredState(context: StepContext): { connected: boolean; type: string } {
    return {
      connected: true,
      type: context.servarrType,
    }
  }

  compareAndPlan(
    current: { connected: boolean; type?: string; version?: string },
    desired: { connected: boolean; type: string },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.connected && desired.connected) {
      changes.push({
        type: 'create',
        resource: 'servarr-connection',
        identifier: context.servarrType,
        details: {
          url: context.config.servarr.url,
          type: desired.type,
          apiKey: context.apiKey ? '***' : 'not-set',
        },
      })
    } else if (current.connected && current.type !== desired.type) {
      changes.push({
        type: 'update',
        resource: 'servarr-connection',
        identifier: context.servarrType,
        details: {
          from: current.type,
          to: desired.type,
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
        if (change.type === 'create') {
          // Wait for Servarr to be ready and test connection
          const connected = await context.servarrClient!.testConnection()
          if (connected) {
            results.push({
              ...change,
              type: 'create',
            })
            context.logger.info('Servarr connection established successfully', {
              type: context.servarrType,
              url: context.config.servarr.url,
            })
          } else {
            errors.push(new Error('Failed to establish Servarr connection'))
          }
        } else if (change.type === 'update') {
          warnings.push(
            new Warning(
              `Servarr type mismatch: expected ${change.details?.to}, got ${change.details?.from}`,
              change.details,
            ),
          )
          results.push(change)
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Servarr connection failed', {
          error: stepError.message,
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
      return await context.servarrClient!.testConnection()
    } catch (error) {
      context.logger.debug('Servarr verification failed', { error })
      return false
    }
  }
}
