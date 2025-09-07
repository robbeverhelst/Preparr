import { type EnvironmentConfig, loadConfigurationSafe } from '@/config'
import { getEnvironmentInfo } from '@/config/loaders/env'
import type { ServarrApplicationConfig } from '@/config/schema'
import { ContextBuilder } from '@/core/context'
import { ConfigurationEngine } from '@/core/engine'
import { HealthServer } from '@/core/health'
import { ReconciliationManager } from '@/core/reconciliation'
import { PostgresClient } from '@/postgres/client'
import { QBittorrentManager } from '@/qbittorrent/client'
import { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'
import { file } from 'bun'

// CLI parsing is now handled by the configuration system

class PrepArrNew {
  private config: EnvironmentConfig
  private health: HealthServer
  private engine: ConfigurationEngine | null = null
  private reconciliationManager: ReconciliationManager | null = null

  constructor(config: EnvironmentConfig) {
    this.config = config
    this.health = new HealthServer(this.config.health.port)
  }

  async initializeInfrastructure(): Promise<void> {
    logger.info('PrepArr starting infrastructure initialization (new architecture)...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    try {
      // Build execution context
      const servarrClient = new ServarrManager(this.config.servarr)
      // Don't initialize ServarrManager in init mode - services aren't ready yet

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
        .setExecutionMode('init')
        .setConfigPath(this.config.configPath)
        .setConfigWatch(this.config.configWatch)
        .build()

      // Create and execute configuration engine
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
      // Load configuration first
      let servarrConfig: ServarrApplicationConfig | undefined
      try {
        servarrConfig = await this.loadConfiguration()
      } catch (error) {
        logger.warn('No configuration found or failed to load', { error })
      }

      // Build execution context
      const servarrClient = new ServarrManager(this.config.servarr)
      await servarrClient.initializeSidecarMode()

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
        .setExecutionMode('sidecar')
        .setConfigPath(this.config.configPath)
        .setConfigWatch(this.config.configWatch)
        .setServarrConfig(servarrConfig || ({} as ServarrApplicationConfig))
        .build()

      // Create configuration engine and reconciliation manager
      this.engine = new ConfigurationEngine(context)
      this.reconciliationManager = new ReconciliationManager(
        context,
        this.engine,
        this.loadConfiguration.bind(this),
      )

      // Set up health server with reconciliation manager
      this.health.setReconciliationManager(this.reconciliationManager)

      // Start reconciliation manager (includes initial run)
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

  private async loadConfiguration(): Promise<ServarrApplicationConfig | undefined> {
    try {
      const configPath = this.config.configPath
      const configFile = file(configPath)

      if (!(await configFile.exists())) {
        logger.debug('Config file does not exist', { configPath })
        return undefined
      }

      const content = await configFile.text()
      if (!content.trim()) {
        logger.debug('Config file is empty', { configPath })
        return undefined
      }

      // Try to parse as JSON first, then YAML
      let config: ServarrApplicationConfig
      try {
        config = JSON.parse(content)
      } catch {
        // If JSON parsing fails, try YAML (would need a YAML parser)
        logger.warn('YAML parsing not implemented, only JSON configs supported', { configPath })
        return undefined
      }

      // Basic validation
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration format')
      }

      // Ensure required arrays exist
      config.rootFolders = config.rootFolders || []
      config.indexers = config.indexers || []
      config.downloadClients = config.downloadClients || []
      config.qualityProfiles = config.qualityProfiles || []
      config.applications = config.applications || []

      logger.info('Configuration loaded successfully', {
        configPath,
        rootFolders: config.rootFolders.length,
        indexers: config.indexers.length,
        downloadClients: config.downloadClients.length,
        qualityProfiles: config.qualityProfiles.length,
        applications: config.applications.length,
      })

      return config
    } catch (error) {
      logger.error('Failed to load configuration file', {
        configPath: this.config.configPath,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  shutdown(): void {
    logger.info('PrepArr shutting down...')

    // Stop reconciliation manager first
    if (this.reconciliationManager) {
      this.reconciliationManager.stop()
    }

    // Stop health server
    this.health.stop()

    logger.info('PrepArr shutdown completed')
  }
}

async function main() {
  // Load configuration from all sources
  const configResult = await loadConfigurationSafe()
  const { config, metadata } = configResult

  // Display configuration info
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
