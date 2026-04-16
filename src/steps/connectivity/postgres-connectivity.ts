import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export class PostgresConnectivityStep extends ConfigurationStep {
  readonly name = 'postgres-connectivity'
  readonly description = 'Validate PostgreSQL connectivity and permissions'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'both'

  validatePrerequisites(context: StepContext): boolean {
    return context.servarrType !== 'qbittorrent'
  }

  async readCurrentState(context: StepContext): Promise<{ connected: boolean; version?: string }> {
    try {
      const connected = await context.postgresClient.testConnection()
      return { connected }
    } catch (error) {
      logger.debug('PostgreSQL connection test failed', { error })
      return { connected: false }
    }
  }

  protected getDesiredState(_context: StepContext): { connected: boolean } {
    return { connected: true }
  }

  compareAndPlan(
    current: { connected: boolean; version?: string },
    desired: { connected: boolean },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.connected && desired.connected) {
      changes.push({
        type: 'create',
        resource: 'postgres-connection',
        identifier: 'postgres',
        details: {
          host: context.config.postgres.host,
          port: context.config.postgres.port,
          database: context.config.postgres.database,
        },
      })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create') {
          const connected = await context.postgresClient.testConnection()
          if (connected) {
            results.push({
              ...change,
              type: 'create',
            })
            logger.info('PostgreSQL connection established successfully')
          } else {
            errors.push(new Error('Failed to establish PostgreSQL connection'))
          }
        }
      } catch (error) {
        const stepError = toError(error)
        errors.push(stepError)
        logger.error('PostgreSQL connection failed', {
          error: stepError.message,
          details: change.details,
        })
      }
    }

    return {
      success: errors.length === 0,
      changes: results,
      errors,
      warnings,
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      return await context.postgresClient.testConnection()
    } catch (error) {
      logger.debug('PostgreSQL verification failed', { error })
      return false
    }
  }
}
