import type { BazarrProvider } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class BazarrProvidersStep extends ConfigurationStep {
  readonly name = 'bazarr-providers'
  readonly description = 'Configure Bazarr subtitle providers'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run if Bazarr is configured and has providers to configure
    if (!context.bazarrClient) return false
    const bazarrConfig = context.config.app?.bazarr
    return bazarrConfig?.providers !== undefined && bazarrConfig.providers.length > 0
  }

  async readCurrentState(context: StepContext): Promise<BazarrProvider[]> {
    try {
      if (!context.bazarrClient) {
        return []
      }

      return await context.bazarrClient.getProviders()
    } catch (error) {
      context.logger.debug('Failed to read Bazarr providers state', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): BazarrProvider[] {
    const bazarrConfig = context.config.app?.bazarr
    return bazarrConfig?.providers || []
  }

  compareAndPlan(current: BazarrProvider[], desired: BazarrProvider[]): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    const currentNames = new Set(current.map((p) => p.name))
    const desiredNames = new Set(desired.map((p) => p.name))

    // Check for new providers to add
    for (const provider of desired) {
      if (!currentNames.has(provider.name)) {
        changes.push({
          type: 'create',
          resource: 'bazarr-provider',
          identifier: provider.name,
          details: { enabled: provider.enabled },
        })
      }
    }

    // Check for providers to update
    for (const provider of desired) {
      if (currentNames.has(provider.name)) {
        const currentProvider = current.find((p) => p.name === provider.name)
        if (currentProvider && currentProvider.enabled !== provider.enabled) {
          changes.push({
            type: 'update',
            resource: 'bazarr-provider',
            identifier: provider.name,
            details: { enabled: provider.enabled },
          })
        }
      }
    }

    // Check for providers to remove
    for (const name of currentNames) {
      if (!desiredNames.has(name)) {
        changes.push({
          type: 'delete',
          resource: 'bazarr-provider',
          identifier: name,
        })
      }
    }

    return changes
  }

  async executeChanges(
    changes: ChangeRecord[],
    context: StepContext,
  ): Promise<StepResult> {
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
        const desired = this.getDesiredState(context)
        context.logger.info('Configuring Bazarr subtitle providers...', {
          providerCount: desired.length,
        })

        await context.bazarrClient.configureProviders(desired)

        context.logger.info('Bazarr subtitle providers configured successfully', {
          providers: desired.map((p) => p.name).join(', '),
          enabledCount: desired.filter((p) => p.enabled).length,
        })
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
      context.logger.error('Failed to configure Bazarr subtitle providers', {
        error: err.message,
      })
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
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)

      if (desired.length === 0) return true

      const currentNames = new Set(current.map((p) => p.name))
      return desired.every((provider) => currentNames.has(provider.name))
    } catch {
      return false
    }
  }
}
