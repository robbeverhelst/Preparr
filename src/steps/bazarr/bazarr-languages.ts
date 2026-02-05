import type { BazarrLanguage } from '@/config/schema'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

export class BazarrLanguagesStep extends ConfigurationStep {
  readonly name = 'bazarr-languages'
  readonly description = 'Configure Bazarr subtitle languages'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  private getLanguagesConfig(context: StepContext): BazarrLanguage[] {
    return context.config.app?.bazarr?.languages ?? []
  }

  validatePrerequisites(context: StepContext): boolean {
    if (!context.bazarrClient) return false
    return this.getLanguagesConfig(context).length > 0
  }

  async readCurrentState(context: StepContext): Promise<BazarrLanguage[]> {
    try {
      if (!context.bazarrClient) {
        return []
      }

      return await context.bazarrClient.getLanguages()
    } catch (error) {
      context.logger.debug('Failed to read Bazarr languages state', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): BazarrLanguage[] {
    return this.getLanguagesConfig(context)
  }

  compareAndPlan(current: BazarrLanguage[], desired: BazarrLanguage[]): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    const currentCodes = new Set(current.map((l) => l.code))
    const desiredCodes = new Set(desired.map((l) => l.code))

    // Check for new languages to add
    for (const lang of desired) {
      if (!currentCodes.has(lang.code)) {
        changes.push({
          type: 'create',
          resource: 'bazarr-language',
          identifier: lang.code,
          details: { name: lang.name },
        })
      }
    }

    // Check for languages to remove
    for (const code of currentCodes) {
      if (!desiredCodes.has(code)) {
        changes.push({
          type: 'delete',
          resource: 'bazarr-language',
          identifier: code,
        })
      }
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    if (!context.bazarrClient) {
      return {
        success: false,
        changes: [],
        errors: [new Error('Bazarr client not available')],
        warnings: [],
      }
    }

    try {
      if (changes.length > 0) {
        const desired = this.getDesiredState(context)
        context.logger.info('Configuring Bazarr languages...', {
          languageCount: desired.length,
        })

        await context.bazarrClient.configureLanguages(desired)

        context.logger.info('Bazarr languages configured successfully', {
          languages: desired.map((l) => l.code).join(', '),
        })
      }

      return {
        success: true,
        changes,
        errors,
        warnings,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)
      context.logger.error('Failed to configure Bazarr languages', { error: err.message })
      return {
        success: false,
        changes,
        errors,
        warnings,
      }
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      if (!context.bazarrClient) return false
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)

      if (desired.length === 0) return true

      const currentCodes = new Set(current.map((l) => l.code))
      return desired.every((lang) => currentCodes.has(lang.code))
    } catch {
      return false
    }
  }
}
