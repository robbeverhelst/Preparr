import type { ServarrApplicationConfig } from '@/config/schema'
import type { ConfigurationEngine } from '@/core/engine'
import type { StepContext } from '@/core/step'
import { logger } from '@/utils/logger'
import { withRetry } from '@/utils/retry'

export interface ReconciliationState {
  lastReconciliation: Date
  lastConfigHash: string
  reconciliationCount: number
  errors: number
  lastError?: Error | undefined
}

export class ReconciliationManager {
  private intervalId: NodeJS.Timeout | undefined = undefined
  private configWatcher: NodeJS.Timeout | undefined = undefined
  private state: ReconciliationState

  constructor(
    private context: StepContext,
    private engine: ConfigurationEngine,
    private loadConfiguration: () => Promise<ServarrApplicationConfig | undefined>,
  ) {
    this.state = {
      lastReconciliation: new Date(),
      lastConfigHash: '',
      reconciliationCount: 0,
      errors: 0,
      lastError: undefined,
    }
  }

  async start(): Promise<void> {
    logger.info('Starting reconciliation manager', {
      configWatch: this.context.config.configWatch,
      reconcileInterval: this.context.config.configReconcileInterval,
    })

    // Start periodic reconciliation
    if (this.context.config.configReconcileInterval > 0) {
      this.intervalId = setInterval(
        () => this.runReconciliation(),
        this.context.config.configReconcileInterval * 1000,
      )
      logger.info('Periodic reconciliation started', {
        intervalSeconds: this.context.config.configReconcileInterval,
      })
    }

    // Start configuration file watching if enabled
    if (this.context.config.configWatch && this.context.config.configPath) {
      this.startConfigWatching()
    }

    // Run initial reconciliation
    await this.runReconciliation()
  }

  stop(): void {
    logger.info('Stopping reconciliation manager')

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    if (this.configWatcher) {
      clearInterval(this.configWatcher)
      this.configWatcher = undefined
    }
  }

  private startConfigWatching(): void {
    logger.info('Starting configuration file watching', {
      configPath: this.context.config.configPath,
    })

    // Use polling-based watching (Bun's file watching is still experimental)
    this.configWatcher = setInterval(async () => {
      try {
        await this.checkConfigurationChanges()
      } catch (error) {
        logger.debug('Error checking configuration changes', { error })
      }
    }, 5000) // Check every 5 seconds

    logger.info('Configuration file watching started')
  }

  private async checkConfigurationChanges(): Promise<void> {
    try {
      const config = await this.loadConfiguration()
      const configHash = this.calculateConfigHash(config)

      if (configHash !== this.state.lastConfigHash) {
        logger.info('Configuration change detected, triggering reconciliation', {
          previousHash: this.state.lastConfigHash.slice(0, 8),
          newHash: configHash.slice(0, 8),
        })

        this.state.lastConfigHash = configHash
        await this.runReconciliation()
      }
    } catch (error) {
      logger.debug('Failed to check configuration changes', { error })
    }
  }

  private calculateConfigHash(config?: ServarrApplicationConfig): string {
    if (!config) return ''
    return Bun.hash(JSON.stringify(config)).toString()
  }

  private async runReconciliation(): Promise<void> {
    const startTime = Date.now()

    try {
      logger.info('Starting reconciliation cycle', {
        cycle: this.state.reconciliationCount + 1,
        lastReconciliation: this.state.lastReconciliation.toISOString(),
      })

      // Reload configuration with error tolerance
      let config: ServarrApplicationConfig | undefined
      try {
        config = await this.loadConfiguration()
        if (config) {
          // Update context with new configuration
          this.context.servarrConfig = config
          this.state.lastConfigHash = this.calculateConfigHash(config)
        }
      } catch (error) {
        logger.warn('Failed to reload configuration, continuing with existing config', { error })
        // Continue with existing config rather than failing the entire reconciliation
        config = this.context.servarrConfig
      }

      // Run configuration engine with retry for critical operations
      const result = await withRetry(() => this.engine.execute('sidecar'), {
        maxAttempts: 2,
        delayMs: 2000,
        operation: `reconciliation-cycle-${this.state.reconciliationCount + 1}`,
      })

      this.state.lastReconciliation = new Date()
      this.state.reconciliationCount++
      this.state.lastError = undefined

      const duration = Date.now() - startTime

      if (result.success) {
        logger.info('Reconciliation cycle completed successfully', {
          cycle: this.state.reconciliationCount,
          duration,
          changes: result.summary.totalChanges,
          warnings: result.warnings.length,
        })

        // Auto-recovery: reset error count on successful reconciliation
        if (this.state.errors > 0) {
          logger.info('Reconciliation recovered, resetting error count', {
            previousErrors: this.state.errors,
          })
          this.state.errors = 0
        }
      } else {
        this.state.errors++
        logger.warn('Reconciliation cycle completed with errors', {
          cycle: this.state.reconciliationCount,
          duration,
          errors: result.errors.length,
          warnings: result.warnings.length,
        })
      }
    } catch (error) {
      this.state.errors++
      this.state.lastError = error as Error

      const duration = Date.now() - startTime

      logger.error('Reconciliation cycle failed', {
        cycle: this.state.reconciliationCount + 1,
        duration,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  getState(): ReconciliationState {
    return { ...this.state }
  }

  async forceReconciliation(): Promise<void> {
    logger.info('Force reconciliation requested')
    await this.runReconciliation()
  }
}
