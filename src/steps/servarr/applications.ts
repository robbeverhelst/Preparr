import type { Application } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'

export class ApplicationsStep extends ConfigurationStep {
  readonly name = 'applications'
  readonly description = 'Configure Servarr applications (Prowlarr)'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run for Prowlarr
    if (context.servarrType !== 'prowlarr') {
      return false
    }

    // Check if Servarr is ready and API key is available
    return context.servarrClient.isReady()
  }

  async readCurrentState(context: StepContext): Promise<Application[]> {
    try {
      const apiApplications = await context.servarrClient.getApplications()
      // Convert ApiApplication[] to Application[]
      return apiApplications.map((app) => ({
        id: app.id,
        name: app.name,
        implementation: app.implementation,
        implementationName: app.implementationName,
        configContract: app.configContract,
        fields: app.fields
          .map((field: { name: string; value: string | number | boolean | number[] }) => ({
            name: field.name,
            value: field.value as string | number | boolean | number[],
          }))
          .filter(
            (field: { name: string; value: string | number | boolean | number[] }) =>
              field.value !== undefined,
          ),
        enable: app.enable,
        syncLevel: app.syncLevel,
        tags: app.tags,
      }))
    } catch (error) {
      context.logger.warn('Failed to read current applications', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): Application[] {
    // Get from loaded configuration
    return (context.config.app?.applications as Application[]) || []
  }

  compareAndPlan(
    current: Application[],
    desired: Application[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const desiredNames = desired.map((a) => a.name)

    // Find applications to add or update
    for (const application of desired) {
      const existing = current.find((a) => a.name === application.name)

      if (!existing) {
        changes.push({
          type: 'create',
          resource: 'application',
          identifier: application.name,
          details: {
            name: application.name,
            implementation: application.implementation,
            implementationName: application.implementationName,
            configContract: application.configContract,
            enable: application.enable,
            syncLevel: application.syncLevel,
            fieldCount: application.fields?.length || 0,
          },
        })
      } else if (!applicationsMatch(existing, application)) {
        changes.push({
          type: 'update',
          resource: 'application',
          identifier: application.name,
          details: {
            name: application.name,
            implementation: application.implementation,
            implementationName: application.implementationName,
            configContract: application.configContract,
            fieldCount: application.fields?.length || 0,
            currentId: existing.id,
          },
        })
      }
    }

    // Find applications to remove
    for (const application of current) {
      if (!desiredNames.includes(application.name)) {
        changes.push({
          type: 'delete',
          resource: 'application',
          identifier: application.name,
          details: {
            name: application.name,
            implementation: application.implementation,
          },
        })
      }
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          // Get the full application from desired state
          const desiredApplications = this.getDesiredState(context)
          const application = desiredApplications.find((a) => a.name === change.identifier)

          if (application) {
            await context.servarrClient.addApplication(application)
            results.push({
              ...change,
              type: 'create',
            })

            context.logger.info('Application added successfully', {
              name: application.name,
              implementation: application.implementation,
              syncLevel: application.syncLevel,
            })
          } else {
            errors.push(new Error(`Application not found in desired state: ${change.identifier}`))
          }
        } else if (change.type === 'update') {
          const desiredApplications = this.getDesiredState(context)
          const application = desiredApplications.find((a) => a.name === change.identifier)
          const currentId =
            typeof change.details?.currentId === 'number' ? change.details.currentId : undefined

          if (currentId) {
            await context.servarrClient.deleteApplication(currentId)
          }

          if (application) {
            await context.servarrClient.addApplication(application)
            results.push({
              ...change,
              type: 'update',
            })

            context.logger.info('Application updated successfully', {
              name: application.name,
              implementation: application.implementation,
              syncLevel: application.syncLevel,
            })
          } else {
            warnings.push(
              new Warning(`Desired application missing during update: ${change.identifier}`),
            )
          }
        } else if (change.type === 'delete') {
          // Find the application ID first
          const currentApplications = await this.readCurrentState(context)
          const application = currentApplications.find((a) => a.name === change.identifier)

          if (application?.id) {
            await context.servarrClient.deleteApplication(application.id)
            results.push({
              ...change,
              type: 'delete',
            })

            context.logger.info('Application removed successfully', {
              name: change.identifier,
            })
          } else {
            warnings.push(new Warning(`Application not found for deletion: ${change.identifier}`))
          }
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage application', {
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
      const currentNames = current.map((a) => a.name).sort()
      const desiredNames = desired.map((a) => a.name).sort()

      return JSON.stringify(currentNames) === JSON.stringify(desiredNames)
    } catch (error) {
      context.logger.debug('Applications verification failed', { error })
      return false
    }
  }
}
const normalizeFields = (
  fields: Application['fields'] = [],
): { name: string; value: string | number | boolean | number[] | undefined }[] =>
  fields
    .map((field) => ({
      name: field?.name,
      value: field?.value,
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

const applicationsMatch = (current?: Application, desired?: Application): boolean => {
  if (!current || !desired) return false
  return (
    current.implementation === desired.implementation &&
    current.configContract === desired.configContract &&
    Boolean(current.enable) === Boolean(desired.enable) &&
    (current.syncLevel ?? 'addOnly') === (desired.syncLevel ?? 'addOnly') &&
    JSON.stringify(normalizeFields(current.fields)) ===
      JSON.stringify(normalizeFields(desired.fields))
  )
}
