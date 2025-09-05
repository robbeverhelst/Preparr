import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class PostgresDatabasesStep extends ConfigurationStep {
  readonly name = 'postgres-databases'
  readonly description = 'Create PostgreSQL databases for Servarr'
  readonly dependencies: string[] = ['postgres-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'init'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in init mode
    return context.executionMode === 'init'
  }

  async readCurrentState(context: StepContext): Promise<{ databases: string[] }> {
    try {
      const mainDb = `${context.servarrType}_main`
      const logDb = `${context.servarrType}_log`

      const mainExists = await context.postgresClient.databaseExists(mainDb)
      const logExists = await context.postgresClient.databaseExists(logDb)

      const databases: string[] = []
      if (mainExists) databases.push(mainDb)
      if (logExists) databases.push(logDb)

      return { databases }
    } catch (error) {
      context.logger.debug('Failed to check existing databases', { error })
      return { databases: [] }
    }
  }

  protected getDesiredState(context: StepContext): { databases: string[] } {
    return {
      databases: [`${context.servarrType}_main`, `${context.servarrType}_log`],
    }
  }

  compareAndPlan(
    current: { databases: string[] },
    desired: { databases: string[] },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    for (const dbName of desired.databases) {
      if (!current.databases.includes(dbName)) {
        changes.push({
          type: 'create',
          resource: 'postgres-database',
          identifier: dbName,
          details: {
            database: dbName,
            servarrType: context.servarrType,
          },
        })
      }
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
          const dbName = change.identifier
          await context.postgresClient.createDatabase(dbName)

          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('PostgreSQL database created successfully', {
            database: dbName,
            servarrType: context.servarrType,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to create PostgreSQL database', {
          error: stepError.message,
          database: change.identifier,
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
      const mainDb = `${context.servarrType}_main`
      const logDb = `${context.servarrType}_log`

      const mainExists = await context.postgresClient.databaseExists(mainDb)
      const logExists = await context.postgresClient.databaseExists(logDb)

      return mainExists && logExists
    } catch (error) {
      context.logger.debug('PostgreSQL database verification failed', { error })
      return false
    }
  }
}
