import type { BazarrManager } from '@/bazarr/client'
import type { Config } from '@/config/schema'
import type { PostgresClient } from '@/postgres/client'
import type { QBittorrentManager } from '@/qbittorrent/client'
import type { ServarrManager } from '@/servarr/client'
import type { logger } from '@/utils/logger'

export interface StepContext {
  config: Config
  servarrType: string
  apiKey?: string | undefined
  postgresClient: PostgresClient
  servarrClient: ServarrManager
  qbittorrentClient?: QBittorrentManager | undefined
  bazarrClient?: BazarrManager | undefined
  logger: typeof logger
  executionMode?: 'init' | 'sidecar'
}

export interface ChangeRecord {
  type: 'create' | 'update' | 'delete' | 'no-change'
  resource: string
  identifier: string
  details?: Record<string, unknown>
}

export interface StepResult {
  success: boolean
  changes: ChangeRecord[]
  errors: Error[]
  warnings: Warning[]
  metadata?: Record<string, unknown>
  skipped?: boolean // Indicates if the step was skipped due to prerequisites
}

export class Warning {
  constructor(
    public message: string,
    public details?: Record<string, unknown>,
  ) {}
}

export abstract class ConfigurationStep {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly dependencies: string[]
  abstract readonly mode: 'init' | 'sidecar' | 'both'

  async execute(context: StepContext): Promise<StepResult> {
    try {
      context.logger.info(`Starting step: ${this.name}`, {
        description: this.description,
        dependencies: this.dependencies,
      })

      // 1. Validate prerequisites
      const prerequisitesResult = this.validatePrerequisites(context)
      const prerequisitesValid =
        prerequisitesResult instanceof Promise ? await prerequisitesResult : prerequisitesResult

      if (!prerequisitesValid) {
        context.logger.debug('Step prerequisites not met, skipping step', {
          step: this.name,
        })
        return {
          success: true, // Mark as successful since it was intentionally skipped
          changes: [],
          errors: [],
          warnings: [],
          skipped: true,
        }
      }

      // 2. Read current state
      const currentState = await this.readCurrentState(context)
      context.logger.debug('Current state read', {
        step: this.name,
        stateType: typeof currentState,
      })

      // 3. Get desired state from context
      const desiredState = this.getDesiredState(context)
      context.logger.debug('Desired state determined', {
        step: this.name,
        stateType: typeof desiredState,
      })

      // 4. Compare and plan changes
      const plannedChangesResult = this.compareAndPlan(currentState, desiredState, context)
      const plannedChanges =
        plannedChangesResult instanceof Promise ? await plannedChangesResult : plannedChangesResult
      context.logger.info('Changes planned', {
        step: this.name,
        changeCount: plannedChanges.length,
        changes: plannedChanges.map((c) => ({
          type: c.type,
          resource: c.resource,
          identifier: c.identifier,
        })),
      })

      // 5. Execute changes
      const result = await this.executeChanges(plannedChanges, context)

      // 6. Verify success
      const verifyResult = this.verifySuccess(context)
      const verified = verifyResult instanceof Promise ? await verifyResult : verifyResult

      if (!verified) {
        result.warnings.push(new Warning(`Verification failed for step: ${this.name}`))
        context.logger.warn('Step verification failed', { step: this.name })
      }

      context.logger.info(`Step completed: ${this.name}`, {
        success: result.success,
        changes: result.changes.length,
        errors: result.errors.length,
        warnings: result.warnings.length,
      })

      return result
    } catch (error) {
      const stepError = error instanceof Error ? error : new Error(String(error))
      context.logger.error(`Step execution failed: ${this.name}`, {
        error: stepError.message,
        stack: stepError.stack,
      })

      return {
        success: false,
        changes: [],
        errors: [stepError],
        warnings: [],
      }
    }
  }

  abstract validatePrerequisites(context: StepContext): boolean | Promise<boolean>
  abstract readCurrentState(context: StepContext): Promise<unknown>
  abstract compareAndPlan(
    current: unknown,
    desired: unknown,
    context: StepContext,
  ): ChangeRecord[] | Promise<ChangeRecord[]>
  abstract executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult>
  abstract verifySuccess(context: StepContext): boolean | Promise<boolean>
  protected abstract getDesiredState(context: StepContext): unknown
}
