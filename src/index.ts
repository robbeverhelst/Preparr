import { loadEnvironmentConfig } from '@/config/env'
import { ConfigLoader } from '@/config/loader'
import type { EnvironmentConfig, ServarrApplicationConfig } from '@/config/schema'
import { HealthServer } from '@/health/server'
import { PostgresClient } from '@/postgres/client'
import { ConfigReconciler } from '@/reconciler'
import { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'
import { ConfigWatcher } from '@/watcher/config'

class PrepArr {
  private config: EnvironmentConfig
  private postgres: PostgresClient
  private servarr: ServarrManager
  private health: HealthServer
  private watcher: ConfigWatcher | null = null
  private configLoader: ConfigLoader
  private reconciler: ConfigReconciler | null = null

  constructor() {
    this.config = loadEnvironmentConfig()
    this.postgres = new PostgresClient(this.config.postgres)
    this.servarr = new ServarrManager(this.config.servarr, '/servarr-config/config.xml')
    this.health = new HealthServer(this.config.health.port)
    this.configLoader = new ConfigLoader()
  }

  async initialize(): Promise<void> {
    logger.info('PrepArr starting initialization...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    this.health.start()

    try {
      // Initialize PostgreSQL first
      logger.info('Initializing PostgreSQL...')
      await this.postgres.initialize()
      this.health.updateHealthCheck('postgres', true)

      // Initialize Servarr manager (auto-detects type, writes config.xml, waits for startup)
      logger.info('Initializing Servarr manager...')
      await this.servarr.initialize()

      // Now initialize Servarr-specific databases with the detected type
      await this.postgres.initializeServarrDatabases(this.servarr.getType())

      // Verify PostgreSQL connection with retries
      logger.info('Verifying PostgreSQL connection...')
      let pgConnected = false
      for (let i = 0; i < 10; i++) {
        pgConnected = await this.servarr.verifyPostgreSQLConnection()
        if (pgConnected) break

        logger.debug('PostgreSQL not ready, waiting...', { attempt: i + 1 })
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      if (!pgConnected) {
        throw new Error('Failed to verify PostgreSQL connection from Servarr')
      }

      // Wait for Servarr to initialize database tables
      logger.info('Waiting for Servarr to initialize database tables...')
      let tablesReady = false
      for (let i = 0; i < 10; i++) {
        tablesReady = await this.servarr.checkServarrTablesInitialized()
        if (tablesReady) break

        logger.debug('Database tables not ready yet, waiting...', { attempt: i + 1 })
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      if (!tablesReady) {
        throw new Error('Servarr failed to initialize database tables')
      }

      // Create initial user now that everything is ready
      await this.servarr.createInitialUser()

      // Final connection test
      const isConnected = await this.servarr.testConnection()
      if (!isConnected) {
        throw new Error('Failed to verify Servarr connection after user creation')
      }

      this.health.updateHealthCheck('servarr', true)
      this.health.updateHealthCheck('config', true)

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
    } catch (error) {
      logger.error('Failed to apply configuration', { error })
      throw error
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
}

async function main() {
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

  await preparr.initialize()
}

try {
  await main()
} catch (error) {
  logger.error('Fatal error during startup', { error })
  process.exit(1)
}
