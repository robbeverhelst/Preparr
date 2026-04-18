import type { BazarrSubtitleDefaults } from '@/config/schema'
import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

interface BazarrSubtitleDefaultsState {
  hearingImpaired: string
  searchOnUpgrade: boolean
}

export class BazarrSubtitleDefaultsStep extends BazarrStep {
  readonly name = 'bazarr-subtitle-defaults'
  readonly description = 'Configure Bazarr subtitle defaults'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  private getDefaultsConfig(context: StepContext): BazarrSubtitleDefaults | undefined {
    return context.config.app?.bazarr?.subtitleDefaults
  }

  private expectedHearingImpaired(desired: BazarrSubtitleDefaults): string {
    return desired.seriesType || 'false'
  }

  validatePrerequisites(context: StepContext): boolean {
    return !!this.getDefaultsConfig(context)
  }

  async readCurrentState(_context: StepContext): Promise<BazarrSubtitleDefaultsState | null> {
    try {
      const settings = await this.client.getSettings()
      const subtitles = settings.subtitles as Record<string, unknown> | undefined
      return {
        hearingImpaired: String(subtitles?.hearing_impaired ?? ''),
        searchOnUpgrade: subtitles?.upgrade_subs === true,
      }
    } catch (error) {
      logger.debug('Failed to read Bazarr subtitle defaults state', { error })
      return null
    }
  }

  protected getDesiredState(context: StepContext): BazarrSubtitleDefaults | undefined {
    return this.getDefaultsConfig(context)
  }

  compareAndPlan(
    current: BazarrSubtitleDefaultsState | null,
    desired: BazarrSubtitleDefaults | undefined,
  ): ChangeRecord[] {
    if (!desired) return []

    if (
      !current ||
      current.hearingImpaired !== this.expectedHearingImpaired(desired) ||
      current.searchOnUpgrade !== desired.searchOnUpgrade
    ) {
      return [
        {
          type: 'update',
          resource: 'bazarr-subtitle-defaults',
          identifier: 'defaults',
          details: {
            seriesType: desired.seriesType,
            searchOnUpgrade: desired.searchOnUpgrade,
          },
        },
      ]
    }

    return []
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    if (changes.length === 0) {
      return { success: true, changes, errors, warnings }
    }

    const desired = this.getDesiredState(context)
    if (!desired) {
      return { success: true, changes: [], errors, warnings }
    }

    try {
      await this.client.configureSubtitleDefaults(desired)
      return { success: true, changes, errors, warnings }
    } catch (error) {
      const err = toError(error)
      errors.push(err)
      logger.error('Failed to configure Bazarr subtitle defaults', { error: err.message })
      return { success: false, changes, errors, warnings }
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      const desired = this.getDesiredState(context)
      if (!desired) return true

      const current = await this.readCurrentState(context)
      if (!current) return false

      return (
        current.hearingImpaired === this.expectedHearingImpaired(desired) &&
        current.searchOnUpgrade === desired.searchOnUpgrade
      )
    } catch {
      return false
    }
  }
}
