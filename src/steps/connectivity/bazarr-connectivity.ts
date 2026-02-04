import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class BazarrConnectivityStep extends ConfigurationStep {
  readonly name = 'bazarr-connectivity'
  readonly description = 'Validate Bazarr connectivity and API access'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in sidecar mode when Bazarr is configured
    if (context.executionMode === 'init') return false
    return !!context.bazarrClient && context.executionMode === 'sidecar'
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ connected: boolean; apiKeyValid?: boolean }> {
    try {
      if (!context.bazarrClient) {
        return { connected: false }
      }

      const connected = await context.bazarrClient.testConnection()
      const status = connected ? await context.bazarrClient.getSystemStatus() : null

      return {
        connected,
        apiKeyValid: status !== null,
      }
    } catch (error) {
      context.logger.debug('Failed to read Bazarr connectivity state', { error })
      return { connected: false, apiKeyValid: false }
    }
  }

  protected getDesiredState(_context: StepContext): { connected: boolean } {
    return { connected: true }
  }

  compareAndPlan(
    current: { connected: boolean; apiKeyValid?: boolean },
    _desired: { connected: boolean },
  ): ChangeRecord[] {
    if (!current.connected) {
      return [
        {
          type: 'update',
          resource: 'bazarr-connection',
          identifier: 'connectivity',
          details: { reason: 'Bazarr is not reachable' },
        },
      ]
    }

    if (!current.apiKeyValid) {
      return [
        {
          type: 'update',
          resource: 'bazarr-connection',
          identifier: 'authentication',
          details: { reason: 'API key is invalid or missing' },
        },
      ]
    }

    return []
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    if (!context.bazarrClient) {
      return {
        success: false,
        changes: [],
        errors: [new Error('Bazarr client not available')],
        warnings: [],
      }
    }

    try {
      if (changes.length > 0) {
        context.logger.info('Testing Bazarr connectivity...', {
          changeCount: changes.length,
        })

        const connected = await context.bazarrClient.testConnection()
        if (!connected) {
          throw new Error('Bazarr is not responding to API requests')
        }

        context.logger.info('Bazarr connectivity verified')
      }

      return {
        success: true,
        changes,
        errors,
        warnings,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)
      return {
        success: false,
        changes,
        errors,
        warnings,
      }
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      if (!context.bazarrClient) return false
      return await context.bazarrClient.testConnection()
    } catch {
      return false
    }
  }
}
