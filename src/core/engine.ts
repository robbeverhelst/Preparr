import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'
import { StepRegistry } from './registry'
import type { ConfigurationStep, StepContext, StepResult } from './step'

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

  constructor(steps: ConfigurationStep[]) {
    this.registry = new StepRegistry()
    for (const step of steps) {
      this.registry.register(step)
    }
    logger.info('Configuration steps registered successfully', {
      totalSteps: this.registry.getAll().length,
      executionOrder: this.registry.getExecutionOrder(),
    })
  }

  async execute(mode: 'init' | 'sidecar', context: StepContext): Promise<ExecutionResult> {
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
        const result = await step.execute(context)
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
        const stepError = toError(error)
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

  private shouldExecuteStep(step: ConfigurationStep, mode: 'init' | 'sidecar'): boolean {
    return step.mode === mode || step.mode === 'both'
  }

  private isCriticalStep(step: ConfigurationStep): boolean {
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
