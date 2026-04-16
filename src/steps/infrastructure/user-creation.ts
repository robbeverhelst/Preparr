import {
  type ChangeRecord,
  ServarrStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export class UserCreationStep extends ServarrStep {
  readonly name = 'user-creation'
  readonly description = 'Create initial admin user for Servarr'
  readonly dependencies: string[] = ['servarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in sidecar mode when Servarr is ready
    return context.executionMode === 'sidecar' && this.client.isReady()
  }

  readCurrentState(context: StepContext): Promise<{ userExists: boolean; username?: string }> {
    try {
      // Check if user already exists by trying to create one
      // This is a simplified check - in reality we'd query the database
      const username = context.config.servarr.adminUser
      return Promise.resolve({ userExists: false, username }) // Simplified for now
    } catch (error) {
      logger.debug('Failed to check user existence', { error })
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

  async executeChanges(changes: ChangeRecord[], _context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create' && change.details?.action === 'create-user') {
          const username = change.details.username as string

          // Create the initial user
          await this.client.createInitialUser()

          results.push({
            ...change,
            type: 'create',
          })

          logger.info('Initial admin user created successfully', {
            username,
          })
        }
      } catch (error) {
        const stepError = toError(error)
        errors.push(stepError)
        logger.error('Failed to create initial user', {
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

  async verifySuccess(_context: StepContext): Promise<boolean> {
    try {
      // Test connection to verify user was created successfully
      return await this.client.testConnection()
    } catch (error) {
      logger.debug('User creation verification failed', { error })
      return false
    }
  }
}
