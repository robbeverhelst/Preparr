import type { QualityProfile } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class QualityProfilesStep extends ConfigurationStep {
  readonly name = 'quality-profiles'
  readonly description = 'Configure Servarr quality profiles'
  // Depends on custom-formats because quality profiles can reference custom format scores
  readonly dependencies: string[] = ['servarr-connectivity', 'custom-formats']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready and API key is available
    return context.servarrClient.isReady()
  }

  readCurrentState(context: StepContext): Promise<QualityProfile[]> {
    try {
      // Note: This would need to be implemented in ServarrManager
      // For now, return empty array as placeholder
      context.logger.debug('Quality profiles reading not yet implemented')
      return Promise.resolve([])
    } catch (error) {
      context.logger.warn('Failed to read current quality profiles', { error })
      return Promise.resolve([])
    }
  }

  protected getDesiredState(context: StepContext): QualityProfile[] {
    // Get from loaded configuration
    return (context.config.app?.qualityProfiles as QualityProfile[]) || []
  }

  compareAndPlan(
    current: QualityProfile[],
    desired: QualityProfile[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentNames = current.map((p) => p.name)
    const desiredNames = desired.map((p) => p.name)

    // Find quality profiles to add
    for (const profile of desired) {
      if (!currentNames.includes(profile.name)) {
        changes.push({
          type: 'create',
          resource: 'quality-profile',
          identifier: profile.name,
          details: {
            name: profile.name,
            cutoff: profile.cutoff,
            itemCount: profile.items.length,
          },
        })
      }
    }

    // Find quality profiles to remove
    for (const profile of current) {
      if (!desiredNames.includes(profile.name)) {
        changes.push({
          type: 'delete',
          resource: 'quality-profile',
          identifier: profile.name,
          details: {
            name: profile.name,
          },
        })
      }
    }

    return changes
  }

  // biome-ignore lint/suspicious/useAwait: Method signature required by base class interface
  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          // Get the full quality profile from desired state
          const desiredProfiles = this.getDesiredState(context)
          const profile = desiredProfiles.find((p) => p.name === change.identifier)

          if (profile) {
            // Note: This would need to be implemented in ServarrManager
            // For now, just log the action
            context.logger.info('Quality profile would be added', {
              name: profile.name,
              cutoff: profile.cutoff,
              itemCount: profile.items.length,
            })

            results.push({
              ...change,
              type: 'create',
            })
          } else {
            errors.push(
              new Error(`Quality profile not found in desired state: ${change.identifier}`),
            )
          }
        } else if (change.type === 'delete') {
          // Note: This would need to be implemented in ServarrManager
          context.logger.info('Quality profile would be removed', {
            name: change.identifier,
          })

          results.push({
            ...change,
            type: 'delete',
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage quality profile', {
          error: stepError.message,
          change: change.identifier,
          name: change.identifier,
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
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)
      const currentNames = current.map((p) => p.name).sort()
      const desiredNames = desired.map((p) => p.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Quality profiles verification failed', { error })
      return false
    }
  }
}
