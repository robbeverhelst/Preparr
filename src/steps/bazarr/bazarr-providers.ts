import type { BazarrProvider } from '@/config/schema'
import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class BazarrProvidersStep extends BazarrStep {
  readonly name = 'bazarr-providers'
  readonly description = 'Configure Bazarr subtitle providers'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  private getProvidersConfig(context: StepContext): BazarrProvider[] {
    return context.config.app?.bazarr?.providers ?? []
  }

  validatePrerequisites(context: StepContext): boolean {
    return this.getProvidersConfig(context).length > 0
  }

  async readCurrentState(context: StepContext): Promise<BazarrProvider[]> {
    try {
      return await this.client.getProviders()
    } catch (error) {
      context.logger.debug('Failed to read Bazarr providers state', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): BazarrProvider[] {
    return this.getProvidersConfig(context)
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

    // Check for providers to update (enabled status or settings/credentials changed)
    for (const provider of desired) {
      if (currentNames.has(provider.name)) {
        const currentProvider = current.find((p) => p.name === provider.name)
        if (currentProvider) {
          const enabledChanged = currentProvider.enabled !== provider.enabled
          const settingsChanged = this.settingsDiffer(currentProvider.settings, provider.settings)
          if (enabledChanged || settingsChanged) {
            changes.push({
              type: 'update',
              resource: 'bazarr-provider',
              identifier: provider.name,
              details: { enabled: provider.enabled, settingsChanged },
            })
          }
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

  private settingsDiffer(
    current: Record<string, string | number | boolean>,
    desired: Record<string, string | number | boolean>,
  ): boolean {
    // Check that all desired settings match current values
    for (const [key, value] of Object.entries(desired)) {
      if (String(current[key] ?? '') !== String(value)) {
        return true
      }
    }
    return false
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    try {
      if (changes.length > 0) {
        const desired = this.getDesiredState(context)
        context.logger.info('Configuring Bazarr subtitle providers...', {
          providerCount: desired.length,
        })

        await this.client.configureProviders(desired)

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
