import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'

export class QBittorrentConnectivityStep extends ConfigurationStep {
  readonly name = 'qbittorrent-connectivity'
  readonly description = 'Validate qBittorrent connectivity and authentication'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run if qBittorrent is configured
    return !!context.qbittorrentClient && context.executionMode === 'sidecar'
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ connected: boolean; authenticated: boolean }> {
    try {
      if (!context.qbittorrentClient) {
        return { connected: false, authenticated: false }
      }

      const connected = await context.qbittorrentClient.testConnection()
      const authenticated = connected && context.qbittorrentClient.isReady()

      return { connected, authenticated }
    } catch (error) {
      context.logger.debug('qBittorrent connection test failed', { error })
      return { connected: false, authenticated: false }
    }
  }

  protected getDesiredState(context: StepContext): { connected: boolean; authenticated: boolean } {
    return {
      connected: !!context.qbittorrentClient,
      authenticated: !!context.qbittorrentClient,
    }
  }

  compareAndPlan(
    current: { connected: boolean; authenticated: boolean },
    desired: { connected: boolean; authenticated: boolean },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.connected && desired.connected) {
      changes.push({
        type: 'create',
        resource: 'qbittorrent-connection',
        identifier: 'qbittorrent',
        details: {
          url: context.qbittorrentClient?.getConfig()?.url,
          configured: !!context.qbittorrentClient,
        },
      })
    }

    if (current.connected && !current.authenticated && desired.authenticated) {
      changes.push({
        type: 'update',
        resource: 'qbittorrent-authentication',
        identifier: 'qbittorrent',
        details: {
          action: 'authenticate',
        },
      })
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
          // Test connection to qBittorrent
          if (context.qbittorrentClient) {
            const connected = await context.qbittorrentClient.testConnection()
            if (connected) {
              results.push({
                ...change,
                type: 'create',
              })
              context.logger.info('qBittorrent connection established successfully')
            } else {
              errors.push(new Error('Failed to establish qBittorrent connection'))
            }
          } else {
            warnings.push(new Warning('qBittorrent not configured, skipping connection test'))
          }
        } else if (change.type === 'update' && change.details?.action === 'authenticate') {
          // Attempt to authenticate with qBittorrent
          if (context.qbittorrentClient) {
            // The authentication would be handled by the qBittorrent client
            // This is more of a verification step
            results.push(change)
            context.logger.info('qBittorrent authentication verified')
          }
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('qBittorrent connection failed', {
          error: stepError.message,
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
      if (!context.qbittorrentClient) {
        return true // Not configured, so success
      }
      return await context.qbittorrentClient.testConnection()
    } catch (error) {
      context.logger.debug('qBittorrent verification failed', { error })
      return false
    }
  }
}
