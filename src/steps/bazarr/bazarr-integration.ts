import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

interface BazarrIntegrationState {
  sonarrConfigured: boolean
  radarrConfigured: boolean
}

interface BazarrIntegrationDesired {
  sonarr?: { url: string; apiKey: string }
  radarr?: { url: string; apiKey: string }
}

export class BazarrIntegrationStep extends BazarrStep {
  readonly name = 'bazarr-integration'
  readonly description = 'Configure Bazarr Sonarr/Radarr integration'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  private getIntegrationConfig(context: StepContext): BazarrIntegrationDesired {
    const bazarrConfig = context.config.app?.bazarr
    const desired: BazarrIntegrationDesired = {}

    if (bazarrConfig?.sonarr) {
      desired.sonarr = { ...bazarrConfig.sonarr }
    }

    if (bazarrConfig?.radarr) {
      desired.radarr = { ...bazarrConfig.radarr }
    }

    return desired
  }

  validatePrerequisites(context: StepContext): boolean {
    const desired = this.getIntegrationConfig(context)
    return !!desired.sonarr || !!desired.radarr
  }

  async readCurrentState(context: StepContext): Promise<BazarrIntegrationState> {
    try {
      const settings = await this.client.getSettings()
      // In Bazarr, the enabled flag is under general.use_sonarr / general.use_radarr
      const generalSettings = settings.general as Record<string, unknown> | undefined

      return {
        sonarrConfigured: generalSettings?.use_sonarr === true,
        radarrConfigured: generalSettings?.use_radarr === true,
      }
    } catch (error) {
      context.logger.debug('Failed to read Bazarr integration state', { error })
      return { sonarrConfigured: false, radarrConfigured: false }
    }
  }

  protected getDesiredState(context: StepContext): BazarrIntegrationDesired {
    return this.getIntegrationConfig(context)
  }

  compareAndPlan(
    current: BazarrIntegrationState,
    desired: BazarrIntegrationDesired,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (desired.sonarr && !current.sonarrConfigured) {
      changes.push({
        type: 'update',
        resource: 'bazarr-integration',
        identifier: 'sonarr',
        details: { url: desired.sonarr.url },
      })
    }

    if (desired.radarr && !current.radarrConfigured) {
      changes.push({
        type: 'update',
        resource: 'bazarr-integration',
        identifier: 'radarr',
        details: { url: desired.radarr.url },
      })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    if (changes.length === 0) {
      return { success: true, changes, errors, warnings }
    }

    const desired = this.getDesiredState(context)

    try {
      for (const change of changes) {
        if (change.identifier === 'sonarr' && desired.sonarr) {
          context.logger.info('Configuring Bazarr Sonarr integration...', {
            url: desired.sonarr.url,
          })
          await this.client.configureSonarrIntegration(desired.sonarr.url, desired.sonarr.apiKey)
        }

        if (change.identifier === 'radarr' && desired.radarr) {
          context.logger.info('Configuring Bazarr Radarr integration...', {
            url: desired.radarr.url,
          })
          await this.client.configureRadarrIntegration(desired.radarr.url, desired.radarr.apiKey)
        }
      }

      context.logger.info('Bazarr integrations configured successfully')

      return {
        success: true,
        changes,
        errors,
        warnings,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)
      context.logger.error('Failed to configure Bazarr integrations', { error: err.message })
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
      const settings = await this.client.getSettings()
      const desired = this.getDesiredState(context)

      // In Bazarr, the enabled flag is under general.use_sonarr / general.use_radarr
      const generalSettings = settings.general as Record<string, unknown> | undefined

      if (desired.sonarr) {
        if (!generalSettings?.use_sonarr) return false
      }

      if (desired.radarr) {
        if (!generalSettings?.use_radarr) return false
      }

      return true
    } catch {
      return false
    }
  }
}
