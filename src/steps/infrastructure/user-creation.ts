import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class UserCreationStep extends ConfigurationStep {
  readonly name = 'user-creation'
  readonly description = 'Create initial admin user for Servarr'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    if (!context.servarrClient) return false
    // Only run in sidecar mode when Servarr is ready
    return context.executionMode === 'sidecar' && context.servarrClient!.isReady()
  }

  readCurrentState(context: StepContext): Promise<{ userExists: boolean; username?: string }> {
    try {
      // Check if user already exists by trying to create one
      // This is a simplified check - in reality we'd query the database
      const username = context.config.servarr.adminUser
      return Promise.resolve({ userExists: false, username }) // Simplified for now
    } catch (error) {
      context.logger.debug('Failed to check user existence', { error })
      return Promise.resolve({ userExists: false })
    }
  }

  protected getDesiredState(context: StepContext): { userExists: boolean; username: string } {
    return {
      userExists: true,
      username: context.config.servarr.adminUser,
    }
  }

  compareAndPlan(
    current: { userExists: boolean; username?: string },
    desired: { userExists: boolean; username: string },
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.userExists && desired.userExists) {
      changes.push({
        type: 'create',
        resource: 'admin-user',
        identifier: desired.username,
        details: {
          username: desired.username,
          action: 'create-user',
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
        if (change.type === 'create' && change.details?.action === 'create-user') {
          const username = change.details.username as string

          // Create the initial user
          await context.servarrClient!.createInitialUser()

          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('Initial admin user created successfully', {
            username,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to create initial user', {
          error: stepError.message,
          username: change.details?.username,
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
      // Test connection to verify user was created successfully
      return await context.servarrClient!.testConnection()
    } catch (error) {
      context.logger.debug('User creation verification failed', { error })
      return false
    }
  }
}
