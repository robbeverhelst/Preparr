import type { CustomFormat } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class CustomFormatsStep extends ConfigurationStep {
  readonly name = 'custom-formats'
  readonly description = 'Configure Servarr custom formats'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Check if Servarr is ready
    if (!context.servarrClient!.isReady()) {
      return false
    }

    // Only supported for Radarr and Sonarr
    const capabilities = context.servarrClient!.getCapabilities()
    if (!capabilities.hasCustomFormats) {
      context.logger.debug('Custom formats not supported for this Servarr type')
      return false
    }

    const config = context.config.app

    // Skip if no custom formats defined
    if (!config?.customFormats || config.customFormats.length === 0) {
      context.logger.debug('No custom formats defined in config, skipping')
      return false
    }

    return true
  }

  async readCurrentState(context: StepContext): Promise<CustomFormat[]> {
    try {
      return await context.servarrClient!.getCustomFormats()
    } catch (error) {
      context.logger.warn('Failed to read current custom formats', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): CustomFormat[] {
    const config = context.config.app
    context.logger.debug('Getting desired custom format state', {
      hasConfig: !!config,
      hasCustomFormats: !!config?.customFormats,
      customFormatCount: config?.customFormats?.length || 0,
    })

    if (!config?.customFormats) {
      return []
    }

    return config.customFormats
  }

  compareAndPlan(
    current: CustomFormat[],
    desired: CustomFormat[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentByName = new Map(current.map((cf) => [cf.name, cf]))
    const desiredByName = new Map(desired.map((cf) => [cf.name, cf]))

    // Find custom formats to add
    for (const customFormat of desired) {
      if (!currentByName.has(customFormat.name)) {
        changes.push({
          type: 'create',
          resource: 'custom-format',
          identifier: customFormat.name,
          details: {
            name: customFormat.name,
            specificationCount: customFormat.specifications?.length || 0,
          },
        })
      } else {
        // Check if update is needed
        const existing = currentByName.get(customFormat.name)
        if (existing && this.needsUpdate(existing, customFormat)) {
          changes.push({
            type: 'update',
            resource: 'custom-format',
            identifier: customFormat.name,
            details: {
              name: customFormat.name,
              id: existing.id,
            },
          })
        }
      }
    }

    // Find custom formats to remove
    for (const customFormat of current) {
      if (!desiredByName.has(customFormat.name)) {
        changes.push({
          type: 'delete',
          resource: 'custom-format',
          identifier: customFormat.name,
          details: {
            name: customFormat.name,
            id: customFormat.id,
          },
        })
      }
    }

    return changes
  }

  private needsUpdate(current: CustomFormat, desired: CustomFormat): boolean {
    // Compare specifications count
    if ((current.specifications?.length || 0) !== (desired.specifications?.length || 0)) {
      return true
    }

    // Compare includeCustomFormatWhenRenaming
    if (current.includeCustomFormatWhenRenaming !== desired.includeCustomFormatWhenRenaming) {
      return true
    }

    // Deep compare specifications (simplified)
    const currentSpecs = JSON.stringify(current.specifications || [])
    const desiredSpecs = JSON.stringify(desired.specifications || [])
    return currentSpecs !== desiredSpecs
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    const desiredFormats = this.getDesiredState(context)
    const currentFormats = await this.readCurrentState(context)
    const currentByName = new Map(currentFormats.map((cf) => [cf.name, cf]))

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          const desiredFormat = desiredFormats.find((cf) => cf.name === change.identifier)
          if (!desiredFormat) {
            throw new Error(`Could not find custom format ${change.identifier} in desired state`)
          }

          await context.servarrClient!.addCustomFormat(desiredFormat)
          results.push({ ...change, type: 'create' })
          context.logger.info('Custom format added successfully', { name: desiredFormat.name })
        } else if (change.type === 'update') {
          const desiredFormat = desiredFormats.find((cf) => cf.name === change.identifier)
          const existingFormat = currentByName.get(change.identifier)

          if (!desiredFormat || !existingFormat?.id) {
            throw new Error(`Could not find custom format ${change.identifier} for update`)
          }

          await context.servarrClient!.updateCustomFormat(existingFormat.id, desiredFormat)
          results.push({ ...change, type: 'update' })
          context.logger.info('Custom format updated successfully', { name: desiredFormat.name })
        } else if (change.type === 'delete') {
          const id = change.details?.id as number | undefined
          if (!id) {
            throw new Error(`No ID found for custom format ${change.identifier}`)
          }

          await context.servarrClient!.deleteCustomFormat(id)
          results.push({ ...change, type: 'delete' })
          context.logger.info('Custom format deleted successfully', { name: change.identifier })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage custom format', {
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
      const currentNames = current.map((cf) => cf.name).sort()
      const desiredNames = desired.map((cf) => cf.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Custom formats verification failed', { error })
      return false
    }
  }
}
