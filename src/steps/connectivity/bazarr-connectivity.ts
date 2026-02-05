import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class BazarrConnectivityStep extends BazarrStep {
  readonly name = 'bazarr-connectivity'
  readonly description = 'Validate Bazarr connectivity and API access'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in sidecar mode when Bazarr is configured
    if (context.executionMode === 'init') return false
    return context.executionMode === 'sidecar'
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ connected: boolean; apiKeyValid?: boolean }> {
    try {
      const connected = await this.client.testConnection()
      const status = connected ? await this.client.getSystemStatus() : null

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

    try {
      if (changes.length > 0) {
        context.logger.info('Testing Bazarr connectivity...', {
          changeCount: changes.length,
        })

        const connected = await this.client.testConnection()
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

  async verifySuccess(_context: StepContext): Promise<boolean> {
    try {
      return await this.client.testConnection()
    } catch {
      return false
    }
  }
}
