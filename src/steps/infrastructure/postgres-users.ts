import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class PostgresUsersStep extends ConfigurationStep {
  readonly name = 'postgres-users'
  readonly description = 'Create PostgreSQL users and grant permissions for Servarr'
  readonly dependencies: string[] = ['postgres-databases']
  readonly mode: 'init' | 'sidecar' | 'both' = 'init'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in init mode
    return context.executionMode === 'init'
  }

  async readCurrentState(context: StepContext): Promise<{ users: string[] }> {
    try {
      const userExists = await context.postgresClient.userExists(context.servarrType)
      return { users: userExists ? [context.servarrType] : [] }
    } catch (error) {
      context.logger.debug('Failed to check existing users', { error })
      return { users: [] }
    }
  }

  protected getDesiredState(context: StepContext): { users: string[] } {
    return {
      users: [context.servarrType],
    }
  }

  compareAndPlan(
    current: { users: string[] },
    desired: { users: string[] },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    for (const username of desired.users) {
      if (!current.users.includes(username)) {
        changes.push({
          type: 'create',
          resource: 'postgres-user',
          identifier: username,
          details: {
            username,
            servarrType: context.servarrType,
          },
        })
      }
    }

    // Always plan to grant permissions (in case they were revoked)
    for (const username of desired.users) {
      changes.push({
        type: 'update',
        resource: 'postgres-permissions',
        identifier: `${username}-permissions`,
        details: {
          username,
          databases: [`${context.servarrType}_main`, `${context.servarrType}_log`],
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
          const username = change.identifier
          await context.postgresClient.createUser(username, context.config.postgres.password)

          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('PostgreSQL user created successfully', {
            username,
            servarrType: context.servarrType,
          })
        } else if (change.type === 'update' && change.resource === 'postgres-permissions') {
          const username = change.details?.username as string
          const databases = change.details?.databases as string[]

          for (const database of databases) {
            await context.postgresClient.grantPermissions(username, database)
          }

          results.push({
            ...change,
            type: 'update',
          })

          context.logger.info('PostgreSQL permissions granted successfully', {
            username,
            databases,
            servarrType: context.servarrType,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to manage PostgreSQL user/permissions', {
          error: stepError.message,
          change: change.identifier,
          identifier: change.identifier,
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
      const userExists = await context.postgresClient.userExists(context.servarrType)
      return userExists
    } catch (error) {
      context.logger.debug('PostgreSQL user verification failed', { error })
      return false
    }
  }
}
