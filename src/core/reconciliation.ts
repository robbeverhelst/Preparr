import type { Config } from '@/config/schema'
import type { ConfigurationEngine } from '@/core/engine'
import type { StepContext } from '@/core/step'
import { toError } from '@/utils/errors'
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
    private baseContext: StepContext,
    private engine: ConfigurationEngine,
    private loadConfiguration: () => Promise<Config>,
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
      configWatch: this.baseContext.config.configWatch,
      reconcileInterval: this.baseContext.config.configReconcileInterval,
    })

    if (this.baseContext.config.configReconcileInterval > 0) {
      this.intervalId = setInterval(
        () => this.runReconciliation(),
        this.baseContext.config.configReconcileInterval * 1000,
      )
      logger.info('Periodic reconciliation started', {
        intervalSeconds: this.baseContext.config.configReconcileInterval,
      })
    }

    if (this.baseContext.config.configWatch && this.baseContext.config.configPath) {
      this.startConfigWatching()
    }

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
      configPath: this.baseContext.config.configPath,
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

  private calculateConfigHash(config?: Config): string {
    if (!config) return ''
    // Hash only desired-state section so infra changes don't flap reconciliation unnecessarily
    return Bun.hash(JSON.stringify(config.app || {})).toString()
  }

  private async runReconciliation(): Promise<void> {
    const startTime = Date.now()

    try {
      logger.info('Starting reconciliation cycle', {
        cycle: this.state.reconciliationCount + 1,
        lastReconciliation: this.state.lastReconciliation.toISOString(),
      })

      // Reload configuration — create fresh context per cycle (immutable)
      let config: Config
      try {
        config = await this.loadConfiguration()
        this.state.lastConfigHash = this.calculateConfigHash(config)
      } catch (error) {
        logger.warn('Failed to reload configuration, continuing with existing config', { error })
        config = this.baseContext.config
      }

      const cycleContext: StepContext = { ...this.baseContext, config }

      const result = await withRetry(() => this.engine.execute('sidecar', cycleContext), {
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
      this.state.lastError = toError(error)

      const duration = Date.now() - startTime

      logger.error('Reconciliation cycle failed', {
        cycle: this.state.reconciliationCount + 1,
        duration,
        error: this.state.lastError.message,
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
