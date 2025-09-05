import type { RootFolder } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class RootFoldersStep extends ConfigurationStep {
  readonly name = 'root-folders'
  readonly description = 'Configure Servarr root folders'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Skip for Prowlarr as it doesn't have root folders
    if (context.servarrType === 'prowlarr') {
      return false
    }

    // Check if Servarr is ready and API key is available
    return context.servarrClient.isReady()
  }

  async readCurrentState(context: StepContext): Promise<RootFolder[]> {
    try {
      return await context.servarrClient.getRootFolders()
    } catch (error) {
      context.logger.warn('Failed to read current root folders', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): RootFolder[] {
    const config = context.servarrConfig
    if (!config || !config.rootFolders) {
      context.logger.warn('No configuration or root folders found in context for root folders step')
      return []
    }

    context.logger.info('Root folders desired state loaded', {
      count: config.rootFolders.length,
      paths: config.rootFolders.map((f) => f.path),
    })

    return config.rootFolders
  }

  compareAndPlan(
    current: RootFolder[],
    desired: RootFolder[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentPaths = current.map((f) => f.path)
    const desiredPaths = desired.map((f) => f.path)

    // Find folders to add
    for (const folder of desired) {
      if (!currentPaths.includes(folder.path)) {
        changes.push({
          type: 'create',
          resource: 'root-folder',
          identifier: folder.path,
          details: {
            path: folder.path,
            accessible: folder.accessible,
            freeSpace: folder.freeSpace,
          },
        })
      }
    }

    // Find folders to remove (optional - might want to keep existing)
    for (const folder of current) {
      if (!desiredPaths.includes(folder.path)) {
        changes.push({
          type: 'delete',
          resource: 'root-folder',
          identifier: folder.path,
          details: { path: folder.path },
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
          const folder: RootFolder = {
            path: change.identifier,
            accessible: (change.details?.accessible as boolean) ?? true,
            freeSpace: change.details?.freeSpace as number,
            unmappedFolders: [],
          }

          await context.servarrClient.addRootFolder(folder)
          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('Root folder added successfully', {
            path: folder.path,
          })
        } else if (change.type === 'delete') {
          await context.servarrClient.removeRootFolder(change.identifier)
          results.push({
            ...change,
            type: 'delete',
          })

          context.logger.info('Root folder removed successfully', {
            path: change.identifier,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage root folder', {
          error: stepError.message,
          change: change.identifier,
          path: change.identifier,
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
      const currentPaths = current.map((f) => f.path).sort()
      const desiredPaths = desired.map((f) => f.path).sort()

      return JSON.stringify(currentPaths) === JSON.stringify(desiredPaths)
    } catch (error) {
      context.logger.debug('Root folders verification failed', { error })
      return false
    }
  }
}
