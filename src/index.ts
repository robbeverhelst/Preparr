import { loadEnvironmentConfig } from '@/config/env'
import { ConfigLoader } from '@/config/loader'
import type { EnvironmentConfig, ServarrApplicationConfig } from '@/config/schema'
import { HealthServer } from '@/health/server'
import { PostgresClient } from '@/postgres/client'
import { QBittorrentManager } from '@/qbittorrent/client'
import { ConfigReconciler } from '@/reconciler'
import { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'
import { ConfigWatcher } from '@/watcher/config'

interface CliArgs {
  init: boolean
  help: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  return {
    init: args.includes('--init'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

function showHelp(): void {
  console.log(`
PrepArr - Servarr Automation Tool

Usage: preparr [OPTIONS]

Options:
  --init     Run in init mode (setup databases, config, then exit)
  --help, -h Show this help message

Modes:
  Default    Run in sidecar mode (full initialization + ongoing reconciliation)
  --init     Run initialization tasks only (databases, config, users) then exit
`)
}

class PrepArr {
  private config: EnvironmentConfig
  private postgres: PostgresClient
  private servarr: ServarrManager
  private qbittorrent: QBittorrentManager | null = null
  private health: HealthServer
  private watcher: ConfigWatcher | null = null
  private configLoader: ConfigLoader
  private reconciler: ConfigReconciler | null = null

  constructor() {
    this.config = loadEnvironmentConfig()
    this.postgres = new PostgresClient(this.config.postgres)
    this.servarr = new ServarrManager(this.config.servarr)
    this.qbittorrent = this.config.services?.qbittorrent
      ? new QBittorrentManager(
          this.config.services.qbittorrent,
          '/shared-qbittorrent/qBittorrent.conf',
        )
      : null
    this.health = new HealthServer(this.config.health.port)
    this.configLoader = new ConfigLoader()
  }

  async initializeInfrastructure(): Promise<void> {
    const servarrType = this.config.servarr.type

    // Special case: qBittorrent-only initialization
    if (servarrType === 'qbittorrent') {
      logger.info('PrepArr starting qBittorrent infrastructure initialization...')
      return this.initializeQBittorrentInfrastructure()
    }

    logger.info('PrepArr starting infrastructure initialization...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    try {
      // Initialize PostgreSQL first
      logger.info('Initializing PostgreSQL...')
      await this.postgres.initialize()

      // Use configured type (service not running in init mode)
      if (servarrType === 'auto') {
        throw new Error(
          'SERVARR_TYPE must be explicitly set in init mode, cannot auto-detect when service is not running',
        )
      }
      logger.info('Using configured Servarr type for init', { type: servarrType })

      // Create PostgreSQL databases and users
      logger.info('Initializing Servarr PostgreSQL databases...', { type: servarrType })
      await this.postgres.initializeServarrDatabases(servarrType)

      // Write config.xml with PostgreSQL settings
      logger.info('Writing Servarr configuration...')
      await this.servarr.writeConfigurationOnly()

      logger.info('Infrastructure initialization completed successfully', {
        servarrType,
      })
    } catch (error) {
      logger.error('Infrastructure initialization failed', { error })
      throw error
    }
  }

  async initialize(): Promise<void> {
    // Special case: qBittorrent-only sidecar
    if (this.config.servarr.type === 'qbittorrent') {
      logger.info('PrepArr starting qBittorrent-only sidecar mode...')
      return this.initializeQBittorrentOnly()
    }

    logger.info('PrepArr starting sidecar mode...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    this.health.start()

    try {
      // In sidecar mode, skip database/config setup (done by init container)
      // Just verify PostgreSQL connection
      logger.info('Verifying PostgreSQL connection...')
      await this.postgres.initialize()
      this.health.updateHealthCheck('postgres', true)

      // Initialize Servarr manager (wait for service, create client)
      logger.info('Initializing Servarr manager for sidecar operations...')
      try {
        await this.servarr.initializeSidecarMode()
      } catch (servarrError) {
        logger.error('Servarr sidecar initialization failed', {
          error: servarrError instanceof Error ? servarrError.message : String(servarrError),
          stack: servarrError instanceof Error ? servarrError.stack : undefined,
        })
        throw servarrError
      }

      this.health.updateHealthCheck('servarr', true)

      // Initialize qBittorrent if configured
      if (this.qbittorrent) {
        logger.info('Initializing qBittorrent...')
        try {
          await this.qbittorrent.initialize()
          this.health.updateHealthCheck('qbittorrent', true)
        } catch (error) {
          logger.error('qBittorrent initialization failed', { error })
          this.health.updateHealthCheck('qbittorrent', false)
        }
      }

      this.health.updateHealthCheck('config', true)
      logger.debug('Health checks updated successfully')

      // Initialize reconciler
      this.reconciler = new ConfigReconciler(this.servarr)

      // Load and apply initial configuration if it exists
      try {
        const appConfig = await this.configLoader.loadConfig(this.config.configPath)
        await this.applyConfiguration(appConfig)
      } catch (error) {
        logger.warn('No initial configuration found or failed to apply', { error })
      }

      if (this.config.configWatch) {
        await this.startConfigWatcher()
      }

      logger.info('PrepArr initialization completed successfully', {
        apiKey: this.servarr.getApiKey(),
        servarrType: this.config.servarr.type,
        ready: this.servarr.isReady(),
      })
    } catch (error) {
      logger.error('PrepArr initialization failed', { error })
      this.health.updateHealthCheck('postgres', false)
      this.health.updateHealthCheck('servarr', false)
      throw error
    }
  }

  private async startConfigWatcher(): Promise<void> {
    this.watcher = new ConfigWatcher(this.config.configPath, async (config) => {
      logger.info('Configuration changed, applying updates...')
      await this.applyConfiguration(config)
    })

    this.watcher.start().catch((error) => {
      logger.error('Config watcher failed', { error })
    })
  }

  private async applyConfiguration(config: ServarrApplicationConfig): Promise<void> {
    if (!this.reconciler) {
      throw new Error('Reconciler not initialized')
    }

    logger.info('Applying Servarr configuration...', {
      rootFolders: config.rootFolders.length,
      qualityProfiles: config.qualityProfiles.length,
      indexers: config.indexers.length,
      downloadClients: config.downloadClients.length,
      qbittorrent: config.qbittorrent ? 'configured' : 'not configured',
    })

    try {
      // Validate configuration first
      const isValid = this.reconciler.validateConfiguration(config)
      if (!isValid) {
        throw new Error('Configuration validation failed')
      }

      // Apply configuration using reconciler
      const result = await this.reconciler.reconcile(config)

      if (!result.applied) {
        throw new Error(`Configuration reconciliation failed: ${result.errors.join(', ')}`)
      }

      if (result.errors.length > 0) {
        logger.warn('Configuration applied with some errors', { errors: result.errors })
      }

      logger.info('Configuration applied successfully', { changes: result.changes })

      // Apply qBittorrent configuration if provided
      if (config.qbittorrent && this.qbittorrent) {
        logger.info('Applying qBittorrent configuration...')
        try {
          await this.qbittorrent.applyConfiguration(config.qbittorrent)
          logger.info('qBittorrent configuration applied successfully')
        } catch (error) {
          logger.error('Failed to apply qBittorrent configuration', { error })
        }
      }

      // Auto-configure service integrations from environment
      await this.autoConfigureServiceIntegrations()
    } catch (error) {
      logger.error('Failed to apply configuration', { error })
      throw error
    }
  }

  private async autoConfigureServiceIntegrations(): Promise<void> {
    logger.info('Auto-configuring service integrations...')

    try {
      // Auto-add qBittorrent as download client if configured
      if (this.config.services?.qbittorrent) {
        logger.info('Auto-configuring qBittorrent as download client...')
        await this.addQBittorrentDownloadClient()
      }

      // Auto-add Prowlarr indexers if configured
      if (this.config.services?.prowlarr) {
        logger.info('Auto-configuring Prowlarr indexers...')
        await this.addProwlarrIndexer()
      }

      logger.info('Service integrations auto-configured successfully')
    } catch (error) {
      logger.error('Failed to auto-configure service integrations', { error })
    }
  }

  private async addQBittorrentDownloadClient(): Promise<void> {
    if (!this.config.services?.qbittorrent) {
      return
    }

    const qbConfig = this.config.services.qbittorrent
    const url = new URL(qbConfig.url)
    const categoryName =
      this.config.servarr.type === 'sonarr'
        ? 'tv'
        : this.config.servarr.type === 'radarr'
          ? 'movies'
          : this.config.servarr.type === 'lidarr'
            ? 'music'
            : this.config.servarr.type === 'readarr'
              ? 'books'
              : 'downloads'

    const downloadClient = {
      name: 'qBittorrent',
      implementation: 'QBittorrent',
      implementationName: 'qBittorrent',
      configContract: 'QBittorrentSettings',
      tags: [],
      fields: [
        { name: 'host', value: url.hostname },
        { name: 'port', value: Number(url.port) || 8080 },
        { name: 'username', value: qbConfig.username },
        { name: 'password', value: qbConfig.password },
        { name: 'category', value: categoryName },
        { name: 'priority', value: 0 },
        { name: 'removeCompletedDownloads', value: false },
        { name: 'removeFailedDownloads', value: false },
      ],
      enable: true,
      priority: 1,
    }

    try {
      await this.servarr.addDownloadClient(downloadClient)
      logger.info('qBittorrent download client added successfully')
    } catch (error) {
      logger.error('Failed to add qBittorrent download client', { error })
    }
  }

  private async addProwlarrIndexer(): Promise<void> {
    if (!this.config.services?.prowlarr) {
      return
    }

    logger.info('Adding Prowlarr as indexer source...')

    const prowlarrConfig = this.config.services.prowlarr

    const indexer = {
      name: 'Prowlarr',
      implementation: 'Prowlarr',
      implementationName: 'Prowlarr',
      configContract: 'ProwlarrSettings',
      tags: [],
      fields: [
        { name: 'baseUrl', value: prowlarrConfig.url },
        { name: 'apiKey', value: prowlarrConfig.apiKey || '' },
        { name: 'syncLevel', value: 'addOnly' },
      ],
      enable: true,
      priority: 10,
    }

    try {
      await this.servarr.addIndexer(indexer)
      logger.info('Prowlarr indexer added successfully')
    } catch (error) {
      logger.error('Failed to add Prowlarr indexer', { error })
    }
  }

  shutdown(): void {
    logger.info('PrepArr shutting down...')

    if (this.watcher) {
      this.watcher.stop()
    }

    this.health.stop()

    // Close PostgreSQL connections
    this.postgres.close()

    logger.info('PrepArr shutdown completed')
  }

  private async initializeQBittorrentInfrastructure(): Promise<void> {
    logger.info('Initializing qBittorrent infrastructure (init mode)...')

    try {
      // Initialize qBittorrent configuration only
      if (this.qbittorrent) {
        logger.info('Writing qBittorrent initial configuration...')
        await this.qbittorrent.writeInitialConfig()

        logger.info('qBittorrent infrastructure initialization completed successfully')
      } else {
        logger.warn('No qBittorrent configuration found')
      }
    } catch (error) {
      logger.error('qBittorrent infrastructure initialization failed', { error })
      throw error
    }
  }

  private async initializeQBittorrentOnly(): Promise<void> {
    logger.info('Initializing qBittorrent-only sidecar...')

    this.health.start()

    try {
      // Initialize qBittorrent configuration
      if (this.qbittorrent) {
        logger.info('Writing qBittorrent configuration...')
        await this.qbittorrent.writeInitialConfig()

        logger.info('Initializing qBittorrent...')
        await this.qbittorrent.initialize()
        this.health.updateHealthCheck('qbittorrent', true)

        logger.info('qBittorrent-only sidecar initialization completed successfully')
      } else {
        logger.warn('No qBittorrent configuration found')
      }
    } catch (error) {
      logger.error('qBittorrent-only sidecar initialization failed', { error })
      throw error
    }
  }
}

async function main() {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  const preparr = new PrepArr()

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

  if (args.init) {
    logger.info('Running in init mode...')
    await preparr.initializeInfrastructure()
    logger.info('Init mode completed successfully, exiting...')
    process.exit(0)
  } else {
    logger.info('Running in sidecar mode...')
    await preparr.initialize()
  }
}

try {
  await main()
} catch (error) {
  logger.error('Fatal error during startup', { error })
  process.exit(1)
}
