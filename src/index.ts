import { loadEnvironmentConfig } from '@/config/env'
import type { EnvironmentConfig } from '@/config/schema'
import { HealthServer } from '@/health/server'
import { PostgresClient } from '@/postgres/client'
import { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'
import { ConfigWatcher } from '@/watcher/config'

class PrepArr {
  private config: EnvironmentConfig
  private postgres: PostgresClient
  private servarr: ServarrManager
  private health: HealthServer
  private watcher: ConfigWatcher | null = null

  constructor() {
    this.config = loadEnvironmentConfig()
    this.postgres = new PostgresClient(this.config.postgres)
    this.servarr = new ServarrManager(this.config.servarr)
    this.health = new HealthServer()
  }

  async initialize(): Promise<void> {
    logger.info('PrepArr starting initialization...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    this.health.start()

    try {
      logger.info('Initializing PostgreSQL...')
      await this.postgres.initialize()
      this.health.updateHealthCheck('postgres', true)

      logger.info('Waiting for Servarr to be ready...')
      await this.servarr.waitForStartup()

      logger.info('Setting up Servarr initial configuration...')
      const apiKey = await this.servarr.setupInitialUser()

      logger.info('Configuring Servarr database connection...')
      await this.servarr.configureDatabase(this.config.postgres)

      this.health.updateHealthCheck('servarr', true)
      this.health.updateHealthCheck('config', true)

      if (this.config.configWatch) {
        await this.startConfigWatcher()
      }

      logger.info('PrepArr initialization completed successfully', { apiKey })
    } catch (error) {
      logger.error('PrepArr initialization failed', { error })
      throw error
    }
  }

  private async startConfigWatcher(): Promise<void> {
    this.watcher = new ConfigWatcher(this.config.configPath, async () => {
      logger.info('Configuration changed, applying updates...')
      const config = await this.watcher?.loadConfig()
      if (config) {
        await this.applyConfiguration(config)
      }
    })

    this.watcher.start().catch((error) => {
      logger.error('Config watcher failed', { error })
    })
  }

  private applyConfiguration(config: unknown): void {
    logger.info('Applying Servarr configuration...')
    logger.debug('Configuration to apply', { config })
  }

  shutdown(): void {
    logger.info('PrepArr shutting down...')

    if (this.watcher) {
      this.watcher.stop()
    }

    this.health.stop()
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
