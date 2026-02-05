import type { NamingConfig } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
} from '@/core/step'

export class NamingConfigStep extends ConfigurationStep {
  readonly name = 'naming-config'
  readonly description = 'Configure Servarr file naming conventions'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready
    if (!context.servarrClient!.isReady()) {
      return false
    }

    // Check if naming config is supported
    const capabilities = context.servarrClient!.getCapabilities()
    if (!capabilities.hasNamingConfig) {
      context.logger.debug('Naming config not supported for this Servarr type')
      return false
    }

    const config = context.config.app

    // Skip if no naming config defined
    if (!config?.naming) {
      context.logger.debug('No naming config defined, skipping')
      return false
    }

    return true
  }

  async readCurrentState(context: StepContext): Promise<NamingConfig | null> {
    try {
      return await context.servarrClient!.getNamingConfig()
    } catch (error) {
      context.logger.warn('Failed to read current naming config', { error })
      return null
    }
  }

  protected getDesiredState(context: StepContext): NamingConfig | null {
    const config = context.config.app
    context.logger.debug('Getting desired naming config state', {
      hasConfig: !!config,
      hasNaming: !!config?.naming,
    })

    return config?.naming || null
  }

  compareAndPlan(
    current: NamingConfig | null,
    desired: NamingConfig | null,
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!desired) {
      return changes
    }

    // Compare each field that's defined in desired state
    const changedFields: string[] = []

    if (current) {
      for (const [key, value] of Object.entries(desired)) {
        if (value !== undefined && current[key as keyof NamingConfig] !== value) {
          changedFields.push(key)
        }
      }
    } else {
      // No current config, all fields are changes
      changedFields.push(
        ...Object.keys(desired).filter((k) => desired[k as keyof NamingConfig] !== undefined),
      )
    }

    if (changedFields.length > 0) {
      changes.push({
        type: 'update',
        resource: 'naming-config',
        identifier: 'naming',
        details: {
          changedFields,
          fieldCount: changedFields.length,
        },
      })
      context.logger.debug('Naming config changes detected', { changedFields })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []

    const desired = this.getDesiredState(context)

    for (const change of changes) {
      try {
        if (change.type === 'update' && desired) {
          await context.servarrClient!.updateNamingConfig(desired)
          results.push({ ...change, type: 'update' })
          context.logger.info('Naming config updated successfully', {
            changedFields: change.details?.changedFields,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to update naming config', {
          error: stepError.message,
        })
      }
    }

    return {
      success: errors.length === 0,
      changes: results,
      errors,
      warnings: [],
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)

      if (!desired || !current) {
        return !desired // Success if no desired state
      }

      // Verify each desired field is set correctly
      for (const [key, value] of Object.entries(desired)) {
        if (value !== undefined && current[key as keyof NamingConfig] !== value) {
          return false
        }
      }

      return true
    } catch (error) {
      context.logger.debug('Naming config verification failed', { error })
      return false
    }
  }
}
