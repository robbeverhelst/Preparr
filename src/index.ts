import { BazarrManager } from '@/bazarr/client'
import { type Config, loadConfigurationSafe } from '@/config'
import { getEnvironmentInfo } from '@/config/loaders/env'
import { ContextBuilder } from '@/core/context'
import { ConfigurationEngine } from '@/core/engine'
import { HealthServer } from '@/core/health'
import { ReconciliationManager } from '@/core/reconciliation'
import { PostgresClient } from '@/postgres/client'
import { QBittorrentManager } from '@/qbittorrent/client'
import { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'

class PrepArrNew {
  private config: Config
  private health: HealthServer
  private engine: ConfigurationEngine | null = null
  private reconciliationManager: ReconciliationManager | null = null

  constructor(config: Config) {
    this.config = config
    this.health = new HealthServer(this.config.health.port)
  }

  private createBazarrClient(): BazarrManager | undefined {
    if (this.config.servarr.type === 'bazarr') {
      // This IS a Bazarr deployment - use servarr config for URL and API key
      return new BazarrManager({
        url: this.config.servarr.url || 'http://localhost:6767',
        ...(this.config.servarr.apiKey ? { apiKey: this.config.servarr.apiKey } : {}),
      })
    }
    // Non-Bazarr deployment that might reference an external Bazarr
    const bazarrConfig = this.config.services?.bazarr || this.config.app?.bazarr
    return bazarrConfig?.url
      ? new BazarrManager({
          url: bazarrConfig.url,
          ...(bazarrConfig.apiKey ? { apiKey: bazarrConfig.apiKey } : {}),
        })
      : undefined
  }

  async initializeInfrastructure(): Promise<void> {
    logger.info('PrepArr starting infrastructure initialization (new architecture)...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    try {
      const servarrClient = new ServarrManager(this.config.servarr)
      const bazarrClient = this.createBazarrClient()

      const context = new ContextBuilder()
        .setConfig(this.config)
        .setServarrType(this.config.servarr.type)
        .setPostgresClient(new PostgresClient(this.config.postgres))
        .setServarrClient(servarrClient)
        .setQBittorrentClient(
          this.config.services?.qbittorrent
            ? new QBittorrentManager(
                this.config.services.qbittorrent,
                '/shared-qbittorrent/qBittorrent.conf',
              )
            : undefined,
        )
        .setBazarrClient(bazarrClient)
        .setExecutionMode('init')
        .setConfigPath(this.config.configPath)
        .setConfigWatch(this.config.configWatch)
        .build()

      this.engine = new ConfigurationEngine(context)
      const result = await this.engine.execute('init')

      if (result.success) {
        logger.info('Infrastructure initialization completed successfully', {
          summary: result.summary,
          duration: result.duration,
        })
      } else {
        logger.error('Infrastructure initialization failed', {
          errors: result.errors.map((e) => e.message),
          summary: result.summary,
          duration: result.duration,
        })
        throw new Error(
          `Infrastructure initialization failed: ${result.errors.map((e) => e.message).join(', ')}`,
        )
      }
    } catch (error) {
      logger.error('Infrastructure initialization failed', { error })
      throw error
    }
  }

  async initialize(): Promise<void> {
    logger.info('PrepArr starting sidecar mode (new architecture)...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    this.health.start()

    try {
      const servarrClient = new ServarrManager(this.config.servarr)

      // Bazarr uses BazarrManager, not ServarrManager for API communication
      if (this.config.servarr.type !== 'bazarr') {
        await servarrClient.initializeSidecarMode()
      }

      const bazarrClient = this.createBazarrClient()
      if (this.config.servarr.type === 'bazarr' && bazarrClient) {
        await bazarrClient.initialize()
      }

      const context = new ContextBuilder()
        .setConfig(this.config)
        .setServarrType(this.config.servarr.type)
        .setPostgresClient(new PostgresClient(this.config.postgres))
        .setServarrClient(servarrClient)
        .setQBittorrentClient(
          this.config.services?.qbittorrent
            ? new QBittorrentManager(
                this.config.services.qbittorrent,
                '/shared-qbittorrent/qBittorrent.conf',
              )
            : undefined,
        )
        .setBazarrClient(bazarrClient)
        .setExecutionMode('sidecar')
        .setConfigPath(this.config.configPath)
        .setConfigWatch(this.config.configWatch)
        .build()

      this.engine = new ConfigurationEngine(context)
      this.reconciliationManager = new ReconciliationManager(context, this.engine, async () => {
        const { config } = await loadConfigurationSafe()
        return config as Config
      })

      this.health.setReconciliationManager(this.reconciliationManager)

      await this.reconciliationManager.start()

      logger.info('Sidecar initialization completed successfully with continuous reconciliation', {
        configPath: this.config.configPath,
        reconcileInterval: this.config.configReconcileInterval,
        configWatch: this.config.configWatch,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      logger.error('Sidecar initialization failed', {
        error: errorMessage,
        stack: errorStack,
        name: errorName,
      })
      this.health.markUnhealthy(`Initialization failed: ${errorMessage}`)
      throw error
    }
  }

  // Unified configuration loader is centralized; no per-app file parsing here anymore

  shutdown(): void {
    logger.info('PrepArr shutting down...')

    if (this.reconciliationManager) {
      this.reconciliationManager.stop()
    }

    this.health.stop()

    logger.info('PrepArr shutdown completed')
  }
}

async function main() {
  const configResult = await loadConfigurationSafe()
  const { config, metadata } = configResult

  getEnvironmentInfo()

  const preparr = new PrepArrNew(config)

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...')
    preparr.shutdown()
    process.exit(0)
  })

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...')
    preparr.shutdown()
    process.exit(0)
  })

  if (metadata.cliArgs.init) {
    logger.info('Running in init mode (new architecture)...')
    await preparr.initializeInfrastructure()
    logger.info('Init mode completed successfully, exiting...')
    process.exit(0)
  } else {
    logger.info('Running in sidecar mode (new architecture)...')
    await preparr.initialize()
  }
}

try {
  await main()
} catch (error) {
  logger.error('Fatal error during startup', { error })
  process.exit(1)
}
