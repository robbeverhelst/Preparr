import type { ReleaseProfile } from '@/config/schema'
import {
  type ChangeRecord,
  ServarrStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class ReleaseProfilesStep extends ServarrStep {
  readonly name = 'release-profiles'
  readonly description = 'Configure Sonarr release profiles'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready
    if (!this.client.isReady()) {
      return false
    }

    // Only supported for Sonarr
    const capabilities = this.client.getCapabilities()
    if (!capabilities.hasReleaseProfiles) {
      context.logger.debug('Release profiles not supported for this Servarr type (Sonarr only)')
      return false
    }

    const config = context.config.app

    // Skip if no release profiles defined
    if (!config?.releaseProfiles || config.releaseProfiles.length === 0) {
      context.logger.debug('No release profiles defined in config, skipping')
      return false
    }

    return true
  }

  async readCurrentState(context: StepContext): Promise<ReleaseProfile[]> {
    try {
      return await this.client.getReleaseProfiles()
    } catch (error) {
      context.logger.warn('Failed to read current release profiles', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): ReleaseProfile[] {
    const config = context.config.app
    context.logger.debug('Getting desired release profile state', {
      hasConfig: !!config,
      hasReleaseProfiles: !!config?.releaseProfiles,
      releaseProfileCount: config?.releaseProfiles?.length || 0,
    })

    if (!config?.releaseProfiles) {
      return []
    }

    return config.releaseProfiles
  }

  compareAndPlan(
    current: ReleaseProfile[],
    desired: ReleaseProfile[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentByName = new Map(current.map((rp) => [rp.name, rp]))
    const desiredByName = new Map(desired.map((rp) => [rp.name, rp]))

    // Find release profiles to add
    for (const releaseProfile of desired) {
      if (!currentByName.has(releaseProfile.name)) {
        changes.push({
          type: 'create',
          resource: 'release-profile',
          identifier: releaseProfile.name,
          details: {
            name: releaseProfile.name,
            enabled: releaseProfile.enabled,
            preferredCount: releaseProfile.preferred?.length || 0,
          },
        })
      } else {
        // Check if update is needed
        const existing = currentByName.get(releaseProfile.name)
        if (existing && this.needsUpdate(existing, releaseProfile)) {
          changes.push({
            type: 'update',
            resource: 'release-profile',
            identifier: releaseProfile.name,
            details: {
              name: releaseProfile.name,
              id: existing.id,
            },
          })
        }
      }
    }

    // Find release profiles to remove
    for (const releaseProfile of current) {
      if (!desiredByName.has(releaseProfile.name)) {
        changes.push({
          type: 'delete',
          resource: 'release-profile',
          identifier: releaseProfile.name,
          details: {
            name: releaseProfile.name,
            id: releaseProfile.id,
          },
        })
      }
    }

    return changes
  }

  private needsUpdate(current: ReleaseProfile, desired: ReleaseProfile): boolean {
    // Compare enabled
    if (current.enabled !== desired.enabled) {
      return true
    }

    // Compare required/ignored
    if (current.required !== desired.required || current.ignored !== desired.ignored) {
      return true
    }

    // Compare preferred terms
    const currentPreferred = JSON.stringify(current.preferred || [])
    const desiredPreferred = JSON.stringify(desired.preferred || [])
    if (currentPreferred !== desiredPreferred) {
      return true
    }

    // Compare other fields
    if (
      current.includePreferredWhenRenaming !== desired.includePreferredWhenRenaming ||
      current.indexerId !== desired.indexerId
    ) {
      return true
    }

    return false
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    const desiredProfiles = this.getDesiredState(context)
    const currentProfiles = await this.readCurrentState(context)
    const currentByName = new Map(currentProfiles.map((rp) => [rp.name, rp]))

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          const desiredProfile = desiredProfiles.find((rp) => rp.name === change.identifier)
          if (!desiredProfile) {
            throw new Error(`Could not find release profile ${change.identifier} in desired state`)
          }

          await this.client.addReleaseProfile(desiredProfile)
          results.push({ ...change, type: 'create' })
          context.logger.info('Release profile added successfully', { name: desiredProfile.name })
        } else if (change.type === 'update') {
          const desiredProfile = desiredProfiles.find((rp) => rp.name === change.identifier)
          const existingProfile = currentByName.get(change.identifier)

          if (!desiredProfile || !existingProfile?.id) {
            throw new Error(`Could not find release profile ${change.identifier} for update`)
          }

          await this.client.updateReleaseProfile(existingProfile.id, desiredProfile)
          results.push({ ...change, type: 'update' })
          context.logger.info('Release profile updated successfully', { name: desiredProfile.name })
        } else if (change.type === 'delete') {
          const id = change.details?.id as number | undefined
          if (!id) {
            throw new Error(`No ID found for release profile ${change.identifier}`)
          }

          await this.client.deleteReleaseProfile(id)
          results.push({ ...change, type: 'delete' })
          context.logger.info('Release profile deleted successfully', { name: change.identifier })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage release profile', {
          error: stepError.message,
          change: change.identifier,
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
      const currentNames = current.map((rp) => rp.name).sort()
      const desiredNames = desired.map((rp) => rp.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Release profiles verification failed', { error })
      return false
    }
  }
}
