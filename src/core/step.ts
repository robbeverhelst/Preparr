import type { BazarrManager } from '@/bazarr/client'
import type { Config } from '@/config/schema'
import type { PostgresClient } from '@/postgres/client'
import type { QBittorrentManager } from '@/qbittorrent/client'
import type { ServarrManager } from '@/servarr/client'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export interface StepContext {
  config: Config
  servarrType: string
  apiKey?: string | undefined
  postgresClient: PostgresClient
  servarrClient?: ServarrManager | undefined
  qbittorrentClient?: QBittorrentManager | undefined
  bazarrClient?: BazarrManager | undefined
  executionMode: 'init' | 'sidecar'
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
  skipped?: boolean
}

export class Warning {
  constructor(
    public message: string,
    public details?: Record<string, unknown>,
  ) {}
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous step collections require any
export abstract class ConfigurationStep<TState = any> {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly dependencies: string[]
  abstract readonly mode: 'init' | 'sidecar' | 'both'

  async execute(context: StepContext): Promise<StepResult> {
    try {
      logger.info(`Starting step: ${this.name}`, {
        description: this.description,
        dependencies: this.dependencies,
      })

      const prerequisitesValid = await this.validatePrerequisites(context)

      if (!prerequisitesValid) {
        logger.debug('Step prerequisites not met, skipping step', {
          step: this.name,
        })
        return {
          success: true,
          changes: [],
          errors: [],
          warnings: [],
          skipped: true,
        }
      }

      const currentState = await this.readCurrentState(context)
      const desiredState = this.getDesiredState(context)
      const plannedChanges = await this.compareAndPlan(currentState, desiredState, context)

      logger.info('Changes planned', {
        step: this.name,
        changeCount: plannedChanges.length,
        changes: plannedChanges.map((c) => ({
          type: c.type,
          resource: c.resource,
          identifier: c.identifier,
        })),
      })

      const result = await this.executeChanges(plannedChanges, context)

      const verified = await this.verifySuccess(context)
      if (!verified) {
        result.warnings.push(new Warning(`Verification failed for step: ${this.name}`))
        logger.warn('Step verification failed', { step: this.name })
      }

      logger.info(`Step completed: ${this.name}`, {
        success: result.success,
        changes: result.changes.length,
        errors: result.errors.length,
        warnings: result.warnings.length,
      })

      return result
    } catch (error) {
      const stepError = toError(error)
      logger.error(`Step execution failed: ${this.name}`, {
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
  abstract readCurrentState(context: StepContext): Promise<TState>
  abstract compareAndPlan(
    current: TState,
    desired: TState,
    context: StepContext,
  ): ChangeRecord[] | Promise<ChangeRecord[]>
  abstract executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult>
  abstract verifySuccess(context: StepContext): boolean | Promise<boolean>
  protected abstract getDesiredState(context: StepContext): TState
}

/**
 * Base class for steps that require a ServarrManager client.
 * Auto-skips when servarrClient is not available (e.g. Bazarr deployments).
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous step collections require any
export abstract class ServarrStep<TState = any> extends ConfigurationStep<TState> {
  protected client!: ServarrManager

  override execute(context: StepContext): Promise<StepResult> {
    if (!context.servarrClient) {
      return Promise.resolve({
        success: true,
        changes: [],
        errors: [],
        warnings: [],
        skipped: true,
      })
    }
    this.client = context.servarrClient
    return super.execute(context)
  }
}

/**
 * Base class for steps that require a BazarrManager client.
 * Auto-skips when bazarrClient is not available.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous step collections require any
export abstract class BazarrStep<TState = any> extends ConfigurationStep<TState> {
  protected client!: BazarrManager

  override execute(context: StepContext): Promise<StepResult> {
    if (!context.bazarrClient) {
      return Promise.resolve({
        success: true,
        changes: [],
        errors: [],
        warnings: [],
        skipped: true,
      })
    }
    this.client = context.bazarrClient
    return super.execute(context)
  }
}
