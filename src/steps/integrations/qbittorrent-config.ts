import type { QBittorrentConfig } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  Warning,
} from '@/core/step'

export class QBittorrentConfigStep extends ConfigurationStep {
  readonly name = 'qbittorrent-config'
  readonly description = 'Configure qBittorrent settings'
  readonly dependencies: string[] = ['qbittorrent-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    return !!context.qbittorrentClient && context.qbittorrentClient.isReady()
  }

  readCurrentState(context: StepContext): Promise<{ configured: boolean }> {
    try {
      return Promise.resolve({ configured: !!context.qbittorrentClient })
    } catch (error) {
      context.logger.debug('Failed to check qBittorrent configuration', { error })
      return Promise.resolve({ configured: false })
    }
  }

  protected getDesiredState(context: StepContext): { configured: boolean } {
    return { configured: !!context.config.app?.qbittorrent }
  }

  compareAndPlan(
    _current: { configured: boolean },
    desired: { configured: boolean },
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (desired.configured && _context.qbittorrentClient) {
      changes.push({
        type: 'update',
        resource: 'qbittorrent-config',
        identifier: 'qbittorrent',
        details: {
          action: 'apply-configuration',
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
        if (change.type === 'update' && change.details?.action === 'apply-configuration') {
          const qbittorrentConfig = context.config.app?.qbittorrent as QBittorrentConfig

          if (qbittorrentConfig && context.qbittorrentClient) {
            await context.qbittorrentClient.applyConfiguration(qbittorrentConfig)

            results.push({
              ...change,
              type: 'update',
            })

            context.logger.info('qBittorrent configuration applied successfully', {
              hasWebUIConfig: !!qbittorrentConfig.webui,
              hasDownloadsConfig: !!qbittorrentConfig.downloads,
              hasConnectionConfig: !!qbittorrentConfig.connection,
            })
          } else {
            warnings.push(new Warning('No qBittorrent configuration found in config'))
          }
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to apply qBittorrent configuration', {
          error: stepError.message,
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
      return (await context.qbittorrentClient?.testConnection()) || false
    } catch (error) {
      context.logger.debug('qBittorrent configuration verification failed', { error })
      return false
    }
  }
}
