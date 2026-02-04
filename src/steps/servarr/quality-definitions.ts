import type { QualityDefinition } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
} from '@/core/step'

export class QualityDefinitionsStep extends ConfigurationStep {
  readonly name = 'quality-definitions'
  readonly description = 'Configure Servarr quality definitions (size limits)'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready
    if (!context.servarrClient.isReady()) {
      return false
    }

    // Check if quality definitions are supported
    const capabilities = context.servarrClient.getCapabilities()
    if (!capabilities.hasQualityDefinitions) {
      context.logger.debug('Quality definitions not supported for this Servarr type')
      return false
    }

    const config = context.config.app

    // Skip if no quality definitions defined
    if (!config?.qualityDefinitions || config.qualityDefinitions.length === 0) {
      context.logger.debug('No quality definitions defined in config, skipping')
      return false
    }

    return true
  }

  async readCurrentState(context: StepContext): Promise<QualityDefinition[]> {
    try {
      return await context.servarrClient.getQualityDefinitions()
    } catch (error) {
      context.logger.warn('Failed to read current quality definitions', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): QualityDefinition[] {
    const config = context.config.app
    context.logger.debug('Getting desired quality definitions state', {
      hasConfig: !!config,
      hasQualityDefinitions: !!config?.qualityDefinitions,
      qualityDefinitionCount: config?.qualityDefinitions?.length || 0,
    })

    if (!config?.qualityDefinitions) {
      return []
    }

    return config.qualityDefinitions
  }

  compareAndPlan(
    current: QualityDefinition[],
    desired: QualityDefinition[],
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentByQuality = new Map(current.map((qd) => [qd.quality.toLowerCase(), qd]))

    // Quality definitions are predefined, so we can only update existing ones
    for (const desiredDef of desired) {
      const currentDef = currentByQuality.get(desiredDef.quality.toLowerCase())

      if (!currentDef) {
        context.logger.warn('Quality definition not found, skipping', {
          quality: desiredDef.quality,
        })
        continue
      }

      // Check if update is needed
      const needsUpdate =
        (desiredDef.minSize !== undefined && desiredDef.minSize !== currentDef.minSize) ||
        (desiredDef.maxSize !== undefined && desiredDef.maxSize !== currentDef.maxSize) ||
        (desiredDef.preferredSize !== undefined &&
          desiredDef.preferredSize !== currentDef.preferredSize)

      if (needsUpdate) {
        changes.push({
          type: 'update',
          resource: 'quality-definition',
          identifier: desiredDef.quality,
          details: {
            quality: desiredDef.quality,
            minSize: desiredDef.minSize,
            maxSize: desiredDef.maxSize,
            preferredSize: desiredDef.preferredSize,
            currentMinSize: currentDef.minSize,
            currentMaxSize: currentDef.maxSize,
            currentPreferredSize: currentDef.preferredSize,
          },
        })
      }
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []

    const desired = this.getDesiredState(context)
    const desiredByQuality = new Map(desired.map((qd) => [qd.quality.toLowerCase(), qd]))

    for (const change of changes) {
      try {
        if (change.type === 'update') {
          const desiredDef = desiredByQuality.get(change.identifier.toLowerCase())
          if (!desiredDef) {
            throw new Error(
              `Could not find quality definition ${change.identifier} in desired state`,
            )
          }

          await context.servarrClient.updateQualityDefinition(change.identifier, {
            minSize: desiredDef.minSize,
            maxSize: desiredDef.maxSize,
            preferredSize: desiredDef.preferredSize,
          })

          results.push({ ...change, type: 'update' })
          context.logger.info('Quality definition updated successfully', {
            quality: change.identifier,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to update quality definition', {
          error: stepError.message,
          quality: change.identifier,
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

      const currentByQuality = new Map(current.map((qd) => [qd.quality.toLowerCase(), qd]))

      // Verify each desired definition matches current state
      for (const desiredDef of desired) {
        const currentDef = currentByQuality.get(desiredDef.quality.toLowerCase())
        if (!currentDef) {
          continue // Skip unknown qualities
        }

        if (
          (desiredDef.minSize !== undefined && desiredDef.minSize !== currentDef.minSize) ||
          (desiredDef.maxSize !== undefined && desiredDef.maxSize !== currentDef.maxSize) ||
          (desiredDef.preferredSize !== undefined &&
            desiredDef.preferredSize !== currentDef.preferredSize)
        ) {
          return false
        }
      }

      return true
    } catch (error) {
      context.logger.debug('Quality definitions verification failed', { error })
      return false
    }
  }
}
