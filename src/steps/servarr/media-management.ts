import type { MediaManagementConfig } from '@/config/schema'
import { type ChangeRecord, ServarrStep, type StepContext, type StepResult } from '@/core/step'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export class MediaManagementStep extends ServarrStep {
  readonly name = 'media-management'
  readonly description = 'Configure Servarr media management settings'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready
    if (!this.client.isReady()) {
      return false
    }

    // Check if media management config is supported
    const capabilities = this.client.getCapabilities()
    if (!capabilities.hasMediaManagement) {
      logger.debug('Media management config not supported for this Servarr type')
      return false
    }

    const config = context.config.app

    // Skip if no media management config defined
    if (!config?.mediaManagement) {
      logger.debug('No media management config defined, skipping')
      return false
    }

    return true
  }

  async readCurrentState(_context: StepContext): Promise<MediaManagementConfig | null> {
    try {
      return await this.client.getMediaManagementConfig()
    } catch (error) {
      logger.warn('Failed to read current media management config', { error })
      return null
    }
  }

  protected getDesiredState(context: StepContext): MediaManagementConfig | null {
    const config = context.config.app
    logger.debug('Getting desired media management config state', {
      hasConfig: !!config,
      hasMediaManagement: !!config?.mediaManagement,
    })

    return config?.mediaManagement || null
  }

  compareAndPlan(
    current: MediaManagementConfig | null,
    desired: MediaManagementConfig | null,
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!desired) {
      return changes
    }

    // Compare each field that's defined in desired state
    const changedFields: string[] = []

    if (current) {
      for (const [key, value] of Object.entries(desired)) {
        if (value !== undefined && current[key as keyof MediaManagementConfig] !== value) {
          changedFields.push(key)
        }
      }
    } else {
      // No current config, all fields are changes
      changedFields.push(
        ...Object.keys(desired).filter(
          (k) => desired[k as keyof MediaManagementConfig] !== undefined,
        ),
      )
    }

    if (changedFields.length > 0) {
      changes.push({
        type: 'update',
        resource: 'media-management',
        identifier: 'media-management',
        details: {
          changedFields,
          fieldCount: changedFields.length,
        },
      })
      logger.debug('Media management config changes detected', { changedFields })
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
          await this.client.updateMediaManagementConfig(desired)
          results.push({ ...change, type: 'update' })
          logger.info('Media management config updated successfully', {
            changedFields: change.details?.changedFields,
          })
        }
      } catch (error) {
        const stepError = toError(error)
        errors.push(stepError)
        logger.error('Failed to update media management config', {
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
        if (value !== undefined && current[key as keyof MediaManagementConfig] !== value) {
          return false
        }
      }

      return true
    } catch (error) {
      logger.debug('Media management config verification failed', { error })
      return false
    }
  }
}
