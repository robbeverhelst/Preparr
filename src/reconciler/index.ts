import type {
  Application,
  DownloadClient,
  Indexer,
  RootFolder,
  ServarrApplicationConfig,
} from '@/config/schema'
import type { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'

// Define types for API responses
interface ApiApplication {
  id?: number
  name: string
  implementation: string
  implementationName?: string
  configContract?: string
  fields?: Array<{ name: string; value?: unknown }>
  enable?: boolean
  priority?: number
  syncLevel?: string
}

interface ApiField {
  name: string
  value?: unknown
}

interface ReconciliationResult {
  applied: boolean
  changes: {
    rootFoldersAdded: number
    indexersAdded: number
    downloadClientsAdded: number
    applicationsAdded: number
  }
  errors: string[]
}

export class ConfigReconciler {
  private servarrManager: ServarrManager

  constructor(servarrManager: ServarrManager) {
    this.servarrManager = servarrManager
  }

  async reconcile(desiredConfig: ServarrApplicationConfig): Promise<ReconciliationResult> {
    logger.info('Starting configuration reconciliation...')

    const result: ReconciliationResult = {
      applied: false,
      changes: {
        rootFoldersAdded: 0,
        indexersAdded: 0,
        downloadClientsAdded: 0,
        applicationsAdded: 0,
      },
      errors: [],
    }

    try {
      // Get the Servarr type to determine what features are supported
      const servarrType = await this.servarrManager.detectType()

      // Reconcile root folders (skip for Prowlarr as it doesn't have root folders)
      if (servarrType !== 'prowlarr') {
        const rootFolderChanges = await this.reconcileRootFolders(desiredConfig.rootFolders)
        result.changes.rootFoldersAdded = rootFolderChanges.added
      } else {
        logger.debug('Skipping root folder reconciliation for Prowlarr (not supported)')
      }

      // Reconcile indexers
      const indexerChanges = await this.reconcileIndexers(desiredConfig.indexers)
      result.changes.indexersAdded = indexerChanges.added

      // Reconcile download clients
      const downloadClientChanges = await this.reconcileDownloadClients(
        desiredConfig.downloadClients,
      )
      result.changes.downloadClientsAdded = downloadClientChanges.added

      // Reconcile applications (only for Prowlarr)
      if (servarrType === 'prowlarr') {
        const applicationChanges = await this.reconcileApplications(
          desiredConfig.applications || [],
        )
        result.changes.applicationsAdded = applicationChanges.added
      } else {
        logger.debug('Skipping application reconciliation (only supported by Prowlarr)')
      }

      result.applied = true
      logger.info('Configuration reconciliation completed successfully', {
        changes: result.changes,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMessage)
      logger.error('Configuration reconciliation failed', { error })
    }

    return result
  }

  private async reconcileRootFolders(
    desired: RootFolder[],
  ): Promise<{ added: number; removed: number }> {
    logger.debug('Reconciling root folders...', { desired: desired.length })

    try {
      const current = await this.servarrManager.getRootFolders()
      const currentPaths = current.map((f) => f.path)
      const desiredPaths = desired.map((f) => f.path)

      // Find folders to add
      const toAdd = desired.filter((folder) => !currentPaths.includes(folder.path))

      // Find folders to remove (only if they're not in desired config)
      const toRemove = current.filter((folder) => !desiredPaths.includes(folder.path))

      let added = 0
      let removed = 0

      // Add missing folders
      for (const folder of toAdd) {
        try {
          await this.servarrManager.addRootFolder(folder)
          added++
        } catch (error) {
          logger.error('Failed to add root folder during reconciliation', {
            path: folder.path,
            error,
          })
        }
      }

      // Remove extra folders (be careful - only remove if explicitly not in config)
      for (const folder of toRemove) {
        try {
          await this.servarrManager.removeRootFolder(folder.path)
          removed++
        } catch (error) {
          logger.error('Failed to remove root folder during reconciliation', {
            path: folder.path,
            error,
          })
        }
      }

      logger.debug('Root folder reconciliation completed', { added, removed })
      return { added, removed }
    } catch (error) {
      logger.error('Root folder reconciliation failed', { error })
      throw error
    }
  }

  private async reconcileIndexers(desired: Indexer[]): Promise<{ added: number; removed: number }> {
    logger.debug('Reconciling indexers...', { desired: desired.length })

    try {
      const current = await this.servarrManager.getIndexers()
      const currentNames = current.map((i) => i.name)
      const desiredNames = desired.map((i) => i.name)

      // Find indexers to add
      const toAdd = desired.filter((indexer) => !currentNames.includes(indexer.name))

      // Find indexers to remove
      const toRemove = current.filter((indexer) => !desiredNames.includes(indexer.name))

      let added = 0
      let removed = 0

      // Add missing indexers
      for (const indexer of toAdd) {
        try {
          await this.servarrManager.addIndexer(indexer)
          added++
        } catch (error) {
          logger.error('Failed to add indexer during reconciliation', {
            name: indexer.name,
            implementation: indexer.implementation,
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                  }
                : error,
            indexerConfig: {
              fields: indexer.fields?.map((f) => ({ name: f.name, hasValue: !!f.value })),
              enabled: indexer.enable,
              priority: indexer.priority,
            },
          })
        }
      }

      // Remove extra indexers
      for (const indexer of toRemove) {
        try {
          await this.servarrManager.removeIndexer(indexer.name)
          removed++
        } catch (error) {
          logger.error('Failed to remove indexer during reconciliation', {
            name: indexer.name,
            error,
          })
        }
      }

      logger.debug('Indexer reconciliation completed', { added, removed })
      return { added, removed }
    } catch (error) {
      logger.error('Indexer reconciliation failed', { error })
      throw error
    }
  }

  private async reconcileDownloadClients(
    desired: DownloadClient[],
  ): Promise<{ added: number; removed: number }> {
    logger.debug('Reconciling download clients...', { desired: desired.length })

    try {
      const current = await this.servarrManager.getDownloadClients()
      const currentNames = current.map((c) => c.name)
      const desiredNames = desired.map((c) => c.name)

      // Find download clients to add
      const toAdd = desired.filter((client) => !currentNames.includes(client.name))

      // Find download clients to remove
      const toRemove = current.filter((client) => !desiredNames.includes(client.name))

      let added = 0
      let removed = 0

      // Add missing download clients
      for (const client of toAdd) {
        try {
          await this.servarrManager.addDownloadClient(client)
          added++
        } catch (error) {
          logger.error('Failed to add download client during reconciliation', {
            name: client.name,
            error,
          })
        }
      }

      // Remove extra download clients
      for (const client of toRemove) {
        try {
          await this.servarrManager.removeDownloadClient(client.name)
          removed++
        } catch (error) {
          logger.error('Failed to remove download client during reconciliation', {
            name: client.name,
            error,
          })
        }
      }

      logger.debug('Download client reconciliation completed', { added, removed })
      return { added, removed }
    } catch (error) {
      logger.error('Download client reconciliation failed', { error })
      throw error
    }
  }

  validateConfiguration(config: ServarrApplicationConfig): boolean {
    logger.info('Validating configuration...')

    const issues: string[] = []

    // Validate root folders
    for (const folder of config.rootFolders) {
      if (!folder.path.startsWith('/')) {
        issues.push(`Root folder path must be absolute: ${folder.path}`)
      }
    }

    // Validate indexers
    for (const indexer of config.indexers) {
      if (!indexer.name.trim()) {
        issues.push('Indexer name cannot be empty')
      }
      if (!indexer.implementation.trim()) {
        issues.push(`Indexer implementation cannot be empty for: ${indexer.name}`)
      }
    }

    // Validate download clients
    for (const client of config.downloadClients) {
      if (!client.name.trim()) {
        issues.push('Download client name cannot be empty')
      }
      if (!client.implementation.trim()) {
        issues.push(`Download client implementation cannot be empty for: ${client.name}`)
      }
    }

    if (issues.length > 0) {
      logger.error('Configuration validation failed', { issues })
      return false
    }

    logger.info('Configuration validation passed')
    return true
  }

  private async reconcileApplications(
    desired: Application[],
  ): Promise<{ added: number; removed: number }> {
    logger.debug('Reconciling applications...', { desired: desired.length })

    try {
      const current = await this.servarrManager.getApplications()

      let added = 0
      let updated = 0

      for (const application of desired) {
        const existingApp = current.find((app) => app.name === application.name)

        if (!existingApp) {
          // Application doesn't exist, add it
          try {
            await this.servarrManager.addApplication(application)
            added++
            logger.debug('Added new application', { name: application.name })
          } catch (error) {
            logger.error('Failed to add application during reconciliation', {
              name: application.name,
              implementation: application.implementation,
              error,
            })
          }
        } else {
          // Application exists, check if it needs updating
          const needsUpdate = this.applicationNeedsUpdate(existingApp, application)

          if (needsUpdate) {
            try {
              logger.info('Application configuration changed, recreating', {
                name: application.name,
                changes: this.getApplicationChanges(existingApp, application),
              })

              // Delete existing application
              await this.servarrManager.deleteApplication(existingApp.id)

              // Add updated application
              await this.servarrManager.addApplication(application)
              updated++
              logger.debug('Updated application', { name: application.name })
            } catch (error) {
              logger.error('Failed to update application during reconciliation', {
                name: application.name,
                error,
              })
            }
          } else {
            logger.debug('Application already exists with correct configuration', {
              name: application.name,
            })
          }
        }
      }

      logger.debug('Application reconciliation completed', { added, updated, removed: 0 })
      return { added: added + updated, removed: 0 }
    } catch (error) {
      logger.error('Failed to reconcile applications', { error })
      throw error
    }
  }

  private applicationNeedsUpdate(current: ApiApplication, desired: Application): boolean {
    // Compare syncLevel - this is the main field we're interested in
    if (current.syncLevel !== desired.syncLevel) {
      return true
    }

    // Compare other key fields that might change
    if (current.implementation !== desired.implementation) {
      return true
    }

    if (current.enable !== desired.enable) {
      return true
    }

    // Compare fields array (API keys, URLs, etc.)
    if (this.fieldsHaveChanged(current.fields || [], desired.fields || [])) {
      return true
    }

    return false
  }

  private fieldsHaveChanged(currentFields: ApiField[], desiredFields: ApiField[]): boolean {
    if (currentFields.length !== desiredFields.length) {
      return true
    }

    for (const desiredField of desiredFields) {
      const currentField = currentFields.find((f) => f.name === desiredField.name)
      if (!currentField || currentField.value !== desiredField.value) {
        return true
      }
    }

    return false
  }

  private getApplicationChanges(
    current: ApiApplication,
    desired: Application,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {}

    if (current.syncLevel !== desired.syncLevel) {
      changes.syncLevel = { from: current.syncLevel, to: desired.syncLevel }
    }

    if (current.implementation !== desired.implementation) {
      changes.implementation = { from: current.implementation, to: desired.implementation }
    }

    if (current.enable !== desired.enable) {
      changes.enable = { from: current.enable, to: desired.enable }
    }

    return changes
  }
}
