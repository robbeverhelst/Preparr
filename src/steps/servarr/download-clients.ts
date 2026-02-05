import type { DownloadClient } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class DownloadClientsStep extends ConfigurationStep {
  readonly name = 'download-clients'
  readonly description = 'Configure Servarr download clients'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    if (!context.servarrClient) return false
    // In init mode, Servarr won't be running yet, so we can't validate connectivity
    if (context.executionMode === 'init') {
      return true
    }

    return context.servarrClient!.isReady()
  }

  async readCurrentState(context: StepContext): Promise<DownloadClient[]> {
    // In init mode, Servarr won't be running yet, so no download clients exist
    if (context.executionMode === 'init') {
      context.logger.info('Init mode: no existing download clients')
      return []
    }
    try {
      context.logger.info('Reading current download clients...')
      const result = await context.servarrClient!.getDownloadClients()
      context.logger.info('Current download clients read', { count: result.length })
      return result
    } catch (error) {
      context.logger.warn('Failed to read current download clients', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  protected getDesiredState(context: StepContext): DownloadClient[] {
    const desired = (context.config.app?.downloadClients as DownloadClient[]) || []
    const svcQbt = context.config.services?.qbittorrent
    if (!svcQbt) return desired

    const parseHostPort = (url: string | undefined): { host?: string; port?: number } => {
      try {
        if (!url) return {}
        const u = new URL(url)
        const port = u.port ? Number(u.port) : undefined
        return { host: u.hostname, ...(port !== undefined && { port }) }
      } catch {
        return {}
      }
    }
    const hp = parseHostPort(svcQbt.url)
    const looksLikePlaceholder = (v: unknown): boolean =>
      typeof v === 'string' && /^\$\{[^}]+\}$/.test(v)

    return desired.map((client) => {
      if (client.implementation?.toLowerCase() !== 'qbittorrent') return client
      const fields = client.fields ? [...client.fields] : []
      const upsert = (name: string, value: string | number | boolean) => {
        const i = fields.findIndex((f) => f.name === name)
        if (i >= 0) fields[i] = { name, value }
        else fields.push({ name, value })
      }
      const u = fields.find((f) => f.name === 'username')
      if (!u || looksLikePlaceholder(u.value)) {
        if (svcQbt.username) upsert('username', svcQbt.username)
      }
      const p = fields.find((f) => f.name === 'password')
      if (!p || looksLikePlaceholder(p.value)) {
        if (svcQbt.password) upsert('password', svcQbt.password)
      }
      const h = fields.find((f) => f.name === 'host')
      if (!h && hp.host) upsert('host', hp.host)
      const prt = fields.find((f) => f.name === 'port')
      if (!prt && hp.port) upsert('port', hp.port)
      return { ...client, fields }
    })
  }

  compareAndPlan(
    current: DownloadClient[],
    desired: DownloadClient[],
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []
    const currentMap = new Map(current.map((c) => [c.name, c]))
    const desiredMap = new Map(desired.map((c) => [c.name, c]))

    // Find download clients to add or update
    for (const [name, desiredClient] of desiredMap) {
      const currentClient = currentMap.get(name)

      if (!currentClient) {
        // Client doesn't exist, create it
        changes.push({
          type: 'create',
          resource: 'download-client',
          identifier: name,
          details: {
            name: desiredClient.name,
            implementation: desiredClient.implementation,
            implementationName: desiredClient.implementationName,
            configContract: desiredClient.configContract,
            enable: desiredClient.enable,
            priority: desiredClient.priority,
            fieldCount: desiredClient.fields?.length || 0,
          },
        })
      } else {
        // Client exists, check if it needs updating
        const needsUpdate = this.clientNeedsUpdate(currentClient, desiredClient)
        if (needsUpdate) {
          changes.push({
            type: 'update',
            resource: 'download-client',
            identifier: name,
            details: {
              name: desiredClient.name,
              implementation: desiredClient.implementation,
              implementationName: desiredClient.implementationName,
              configContract: desiredClient.configContract,
              enable: desiredClient.enable,
              priority: desiredClient.priority,
              fieldCount: desiredClient.fields?.length || 0,
              reason: 'Configuration mismatch detected',
            },
          })
        }
      }
    }

    // Find download clients to remove
    for (const [name, currentClient] of currentMap) {
      if (!desiredMap.has(name)) {
        changes.push({
          type: 'delete',
          resource: 'download-client',
          identifier: name,
          details: {
            name: currentClient.name,
            implementation: currentClient.implementation,
          },
        })
      }
    }

    return changes
  }

  /**
   * Check if a download client needs updating by comparing configurations
   */
  private clientNeedsUpdate(current: DownloadClient, desired: DownloadClient): boolean {
    // Compare basic properties
    if (current.implementation !== desired.implementation) return true
    if (current.implementationName !== desired.implementationName) return true
    if (current.configContract !== desired.configContract) return true
    if (current.enable !== desired.enable) return true
    if (current.priority !== desired.priority) return true

    // Compare fields (normalize and compare only desired keys)
    const currentFields = current.fields || []
    const desiredFields = desired.fields || []

    // Normalize current field names so vendor-specific names collapse to generic ones
    const normalizeKey = (key: string): string => {
      if (key === 'tvCategory' || key === 'movieCategory') return 'category'
      return key
    }

    const ignored = new Set([
      'password',
      'priority',
      'removeCompletedDownloads',
      'removeFailedDownloads',
      'protocol',
    ])

    const currentFieldMap = new Map(
      currentFields
        .filter((f) => !ignored.has(normalizeKey(f.name)))
        .map((f) => [normalizeKey(f.name), f.value]),
    )
    const desiredFieldMap = new Map(
      desiredFields
        .filter((f) => !ignored.has(normalizeKey(f.name)))
        .map((f) => [normalizeKey(f.name), f.value]),
    )

    // Only compare desired keys to avoid false positives due to extra server defaults
    for (const [name, desiredValue] of desiredFieldMap) {
      const currentValue = currentFieldMap.get(name)
      if (currentValue !== desiredValue) {
        return true
      }
    }

    return false
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          // Get the full download client from desired state
          const desiredClients = this.getDesiredState(context)
          const client = desiredClients.find((c) => c.name === change.identifier)

          if (client) {
            context.logger.info('About to call addDownloadClient', {
              clientName: client.name,
              hasServarrClient: !!context.servarrClient,
              servarrClientType: context.servarrClient!.constructor?.name,
            })

            try {
              await context.servarrClient!.addDownloadClient(client)
              results.push({
                ...change,
                type: 'create',
              })

              context.logger.info('Download client added successfully', {
                name: client.name,
                implementation: client.implementation,
              })
            } catch (innerError) {
              context.logger.error('Direct error from addDownloadClient', {
                error: innerError,
                errorType: typeof innerError,
                errorMessage: innerError instanceof Error ? innerError.message : String(innerError),
                errorStack: innerError instanceof Error ? innerError.stack : undefined,
              })
              throw innerError
            }
          } else {
            errors.push(
              new Error(`Download client not found in desired state: ${change.identifier}`),
            )
          }
        } else if (change.type === 'update') {
          // Get the full download client from desired state
          const desiredClients = this.getDesiredState(context)
          const client = desiredClients.find((c) => c.name === change.identifier)

          if (client) {
            context.logger.info('About to update download client', {
              clientName: client.name,
              reason: change.details?.reason,
            })

            try {
              // For updates, we need to remove the old client and add the new one
              // since Servarr doesn't have a direct update API for download clients
              await context.servarrClient!.removeDownloadClient(change.identifier)
              await context.servarrClient!.addDownloadClient(client)

              results.push({
                ...change,
                type: 'update',
              })

              context.logger.info('Download client updated successfully', {
                name: client.name,
                implementation: client.implementation,
                reason: change.details?.reason,
              })
            } catch (innerError) {
              context.logger.error('Direct error from updateDownloadClient', {
                error: innerError,
                errorType: typeof innerError,
                errorMessage: innerError instanceof Error ? innerError.message : String(innerError),
                errorStack: innerError instanceof Error ? innerError.stack : undefined,
              })
              throw innerError
            }
          } else {
            errors.push(
              new Error(`Download client not found in desired state: ${change.identifier}`),
            )
          }
        } else if (change.type === 'delete') {
          await context.servarrClient!.removeDownloadClient(change.identifier)
          results.push({
            ...change,
            type: 'delete',
          })

          context.logger.info('Download client removed successfully', {
            name: change.identifier,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage download client', {
          error: stepError.message,
          change: change.identifier,
          details: change.details,
          fullError: error,
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
      const currentNames = current.map((c) => c.name).sort()
      const desiredNames = desired.map((c) => c.name).sort()

      // Check if all desired clients exist
      const allExist = JSON.stringify(currentNames) === JSON.stringify(desiredNames)
      if (!allExist) {
        return false
      }

      // Check if all clients are configured correctly
      const currentMap = new Map(current.map((c) => [c.name, c]))
      const desiredMap = new Map(desired.map((c) => [c.name, c]))

      for (const [name, desiredClient] of desiredMap) {
        const currentClient = currentMap.get(name)
        if (!currentClient || this.clientNeedsUpdate(currentClient, desiredClient)) {
          context.logger.info('Download client verification failed', {
            name,
            reason: !currentClient ? 'Client not found' : 'Configuration mismatch',
          })
          return false
        }
      }

      return true
    } catch (error) {
      context.logger.info('Download clients verification failed', { error })
      return false
    }
  }
}
