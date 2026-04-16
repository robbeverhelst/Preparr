import { BazarrManager } from '@/bazarr/client'
import { type Config, loadConfigurationSafe } from '@/config'
import { getEnvironmentInfo } from '@/config/loaders/env'
import { ContextBuilder } from '@/core/context'
import { ConfigurationEngine } from '@/core/engine'
import { HealthServer } from '@/core/health'
import { ReconciliationManager } from '@/core/reconciliation'
import type { StepContext } from '@/core/step'
import { PostgresClient } from '@/postgres/client'
import { QBittorrentManager } from '@/qbittorrent/client'
import { ServarrManager } from '@/servarr/client'
import { allSteps } from '@/steps'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

class PrepArr {
  private config: Config
  private health: HealthServer
  private engine: ConfigurationEngine
  private reconciliationManager: ReconciliationManager | null = null

  constructor(config: Config) {
    this.config = config
    this.health = new HealthServer(this.config.health.port)
    this.engine = new ConfigurationEngine(allSteps)
  }

  private get isBazarrDeployment(): boolean {
    return this.config.servarr.type === 'bazarr'
  }

  private get isQbittorrentDeployment(): boolean {
    return this.config.servarr.type === 'qbittorrent'
  }

  private createServarrClient(): ServarrManager | undefined {
    if (this.isBazarrDeployment || this.isQbittorrentDeployment) {
      return undefined
    }

    return new ServarrManager(this.config.servarr, {
      logDatabaseEnabled: this.config.postgres.logDatabaseEnabled,
    })
  }

  private createBazarrClient(): BazarrManager | undefined {
    const bazarrConfig = this.config.services?.bazarr

    if (this.isBazarrDeployment) {
      return new BazarrManager({
        url: bazarrConfig?.url || 'http://localhost:6767',
        ...(bazarrConfig?.apiKey ? { apiKey: bazarrConfig.apiKey } : {}),
      })
    }
    if (!bazarrConfig?.url) return undefined
    return new BazarrManager({
      url: bazarrConfig.url,
      ...(bazarrConfig.apiKey ? { apiKey: bazarrConfig.apiKey } : {}),
    })
  }

  private buildContext(
    mode: 'init' | 'sidecar',
    options?: {
      servarrClient?: ServarrManager | undefined
      bazarrClient?: BazarrManager | undefined
    },
  ): StepContext {
    const servarrClient = options?.servarrClient ?? this.createServarrClient()
    const bazarrClient = options?.bazarrClient ?? this.createBazarrClient()

    return new ContextBuilder()
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
      .setExecutionMode(mode)
      .build()
  }

  async initializeInfrastructure(): Promise<void> {
    logger.info('PrepArr starting infrastructure initialization...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    try {
      const context = this.buildContext('init')
      const result = await this.engine.execute('init', context)

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
    logger.info('PrepArr starting sidecar mode...', {
      servarrType: this.config.servarr.type,
      servarrUrl: this.config.servarr.url,
    })

    this.health.start()

    try {
      const servarrClient = this.createServarrClient()
      if (servarrClient) {
        await servarrClient.initializeSidecarMode()
      }

      const bazarrClient = this.createBazarrClient()
      if (bazarrClient) {
        await bazarrClient.initialize()
      }

      const context = this.buildContext('sidecar', { servarrClient, bazarrClient })

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
      const err = toError(error)
      logger.error('Sidecar initialization failed', {
        error: err.message,
        stack: err.stack,
        name: err.name,
      })
      this.health.markUnhealthy(`Initialization failed: ${err.message}`)
      throw error
    }
  }

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

  const preparr = new PrepArr(config)

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
