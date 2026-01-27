// Import all step classes
import { PostgresConnectivityStep } from '@/steps/connectivity/postgres-connectivity'
import { QBittorrentConnectivityStep } from '@/steps/connectivity/qbittorrent-connectivity'
import { ServarrConnectivityStep } from '@/steps/connectivity/servarr-connectivity'
import { PostgresDatabasesStep } from '@/steps/infrastructure/postgres-databases'
import { PostgresUsersStep } from '@/steps/infrastructure/postgres-users'
import { QBittorrentInitStep } from '@/steps/infrastructure/qbittorrent-init'
import { ServarrConfigFileStep } from '@/steps/infrastructure/servarr-config-file'
import { UserCreationStep } from '@/steps/infrastructure/user-creation'
import { QBittorrentConfigStep } from '@/steps/integrations/qbittorrent-config'
import { ApplicationsStep } from '@/steps/servarr/applications'
import { DownloadClientsStep } from '@/steps/servarr/download-clients'
import { IndexersStep } from '@/steps/servarr/indexers'
import { QualityProfilesStep } from '@/steps/servarr/quality-profiles'
import { RootFoldersStep } from '@/steps/servarr/root-folders'
import { ConfigLoadingStep } from '@/steps/validation/config-loading'
import { logger } from '@/utils/logger'
import type { ExecutionContext } from './context'
import { StepRegistry } from './registry'
import type { StepResult } from './step'

export interface ExecutionResult {
  success: boolean
  stepResults: Map<string, StepResult>
  errors: Error[]
  warnings: import('./step').Warning[]
  summary: ExecutionSummary
  duration: number
}

export interface ExecutionSummary {
  totalSteps: number
  successfulSteps: number
  failedSteps: number
  skippedSteps: number
  totalChanges: number
  criticalFailures: string[]
}

export class ConfigurationEngine {
  private registry: StepRegistry
  private context: ExecutionContext

  constructor(context: ExecutionContext) {
    this.context = context
    this.registry = new StepRegistry()
    this.registerSteps()
  }

  private registerSteps(): void {
    logger.info('Registering configuration steps...')

    try {
      // Register all steps
      this.registry.register(new PostgresConnectivityStep())
      this.registry.register(new ServarrConnectivityStep())
      this.registry.register(new QBittorrentConnectivityStep())
      this.registry.register(new PostgresDatabasesStep())
      this.registry.register(new PostgresUsersStep())
      this.registry.register(new ServarrConfigFileStep())
      this.registry.register(new UserCreationStep())
      this.registry.register(new QBittorrentInitStep())
      this.registry.register(new ConfigLoadingStep())
      this.registry.register(new RootFoldersStep())
      this.registry.register(new IndexersStep())
      this.registry.register(new DownloadClientsStep())
      this.registry.register(new QualityProfilesStep())
      this.registry.register(new ApplicationsStep())
      this.registry.register(new QBittorrentConfigStep())

      logger.info('Configuration steps registered successfully', {
        totalSteps: this.registry.getAll().length,
        executionOrder: this.registry.getExecutionOrder(),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error('Error registering steps', { error: errorMessage, stack: errorStack })
      throw error
    }
  }

  async execute(mode: 'init' | 'sidecar'): Promise<ExecutionResult> {
    const startTime = Date.now()
    const results: Map<string, StepResult> = new Map()
    const errors: Error[] = []
    const warnings: import('./step').Warning[] = []
    const criticalFailures: string[] = []

    logger.info(`Starting configuration execution in ${mode} mode`, {
      mode,
      totalSteps: this.registry.getStepsForMode(mode).length,
    })

    // Validate dependencies
    const validation = this.registry.validateDependencies()
    if (!validation.valid) {
      logger.error('Step dependency validation failed', { errors: validation.errors })
      return {
        success: false,
        stepResults: results,
        errors: validation.errors.map((e) => new Error(e)),
        warnings,
        summary: this.generateSummary(results, criticalFailures),
        duration: Date.now() - startTime,
      }
    }

    // Get execution order for the specified mode
    const stepsToExecute = this.registry.getStepsForMode(mode)
    const executionOrder = this.registry
      .getExecutionOrder()
      .filter((stepName) => stepsToExecute.some((step) => step.name === stepName))

    logger.info('Execution order determined', {
      steps: executionOrder,
      mode,
    })

    // Execute steps in order
    for (const stepName of executionOrder) {
      const step = this.registry.get(stepName)
      if (!step) {
        logger.warn(`Step not found: ${stepName}`)
        continue
      }

      if (!this.shouldExecuteStep(step, mode)) {
        logger.debug(`Skipping step: ${stepName} (not applicable for ${mode} mode)`)
        continue
      }

      logger.info(`Executing step: ${step.name}`, {
        description: step.description,
        dependencies: step.dependencies,
      })

      try {
        const result = await step.execute(this.context)
        results.set(stepName, result)

        // Collect errors and warnings
        errors.push(...result.errors)
        warnings.push(...result.warnings)

        if (result.skipped) {
          logger.debug(`Step skipped: ${step.name} (prerequisites not met)`)
        } else if (!result.success) {
          logger.error(`Step failed: ${step.name}`, {
            errors: result.errors.map((e) => e.message),
            warnings: result.warnings.map((w) => w.message),
          })

          if (this.isCriticalStep(step)) {
            criticalFailures.push(step.name)
            logger.error(`Critical step failed: ${step.name}, stopping execution`)
            break
          }
        } else {
          logger.info(`Step completed successfully: ${step.name}`, {
            changes: result.changes.length,
            warnings: result.warnings.length,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        logger.error(`Unexpected error in step: ${step.name}`, {
          error: stepError.message,
          stack: stepError.stack,
        })

        errors.push(stepError)
        results.set(stepName, {
          success: false,
          changes: [],
          errors: [stepError],
          warnings: [],
        })

        if (this.isCriticalStep(step)) {
          criticalFailures.push(step.name)
          break
        }
      }
    }

    const duration = Date.now() - startTime
    const success = errors.length === 0 && criticalFailures.length === 0

    logger.info('Configuration execution completed', {
      success,
      duration,
      totalSteps: results.size,
      errors: errors.length,
      warnings: warnings.length,
      criticalFailures,
    })

    return {
      success,
      stepResults: results,
      errors,
      warnings,
      summary: this.generateSummary(results, criticalFailures),
      duration,
    }
  }

  private shouldExecuteStep(
    step: import('./step').ConfigurationStep,
    mode: 'init' | 'sidecar',
  ): boolean {
    return step.mode === mode || step.mode === 'both'
  }

  private isCriticalStep(step: import('./step').ConfigurationStep): boolean {
    // Define which steps are critical and should stop execution if they fail
    const criticalSteps = ['config-validation', 'postgres-connectivity', 'servarr-connectivity']
    return criticalSteps.includes(step.name)
  }

  private generateSummary(
    results: Map<string, StepResult>,
    criticalFailures: string[],
  ): ExecutionSummary {
    const totalSteps = results.size
    const successfulSteps = Array.from(results.values()).filter((r) => r.success).length
    const skippedSteps = Array.from(results.values()).filter((r) => r.skipped).length
    const failedSteps = totalSteps - successfulSteps
    const totalChanges = Array.from(results.values()).reduce((sum, r) => sum + r.changes.length, 0)

    return {
      totalSteps,
      successfulSteps,
      failedSteps,
      skippedSteps,
      totalChanges,
      criticalFailures,
    }
  }

  getRegistry(): StepRegistry {
    return this.registry
  }
}
