import {
  type ChangeRecord,
  ConfigurationStep,
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

export class BazarrIntegrationStep extends ConfigurationStep {
  readonly name = 'bazarr-integration'
  readonly description = 'Configure Bazarr Sonarr/Radarr integration'
  readonly dependencies: string[] = ['bazarr-connectivity']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  validatePrerequisites(context: StepContext): boolean {
    // Only run if Bazarr is configured and has integration config
    if (!context.bazarrClient) return false
    const bazarrConfig = context.config.app?.bazarr
    return !!bazarrConfig?.sonarr || !!bazarrConfig?.radarr
  }

  async readCurrentState(context: StepContext): Promise<BazarrIntegrationState> {
    try {
      if (!context.bazarrClient) {
        return { sonarrConfigured: false, radarrConfigured: false }
      }

      const settings = await context.bazarrClient.getSettings()
      const sonarrSettings = settings.sonarr as Record<string, unknown> | undefined
      const radarrSettings = settings.radarr as Record<string, unknown> | undefined

      return {
        sonarrConfigured: sonarrSettings?.enabled === true,
        radarrConfigured: radarrSettings?.enabled === true,
      }
    } catch (error) {
      context.logger.debug('Failed to read Bazarr integration state', { error })
      return { sonarrConfigured: false, radarrConfigured: false }
    }
  }

  protected getDesiredState(context: StepContext): BazarrIntegrationDesired {
    const bazarrConfig = context.config.app?.bazarr

    return {
      sonarr: bazarrConfig?.sonarr ? { ...bazarrConfig.sonarr } : undefined,
      radarr: bazarrConfig?.radarr ? { ...bazarrConfig.radarr } : undefined,
    }
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

    if (!context.bazarrClient) {
      return {
        success: false,
        changes: [],
        errors: [new Error('Bazarr client not available')],
        warnings: [],
      }
    }

    const desired = this.getDesiredState(context)

    try {
      if (desired.sonarr) {
        context.logger.info('Configuring Bazarr Sonarr integration...', {
          url: desired.sonarr.url,
        })
        await context.bazarrClient.configureSonarrIntegration(
          desired.sonarr.url,
          desired.sonarr.apiKey,
        )
      }

      if (desired.radarr) {
        context.logger.info('Configuring Bazarr Radarr integration...', {
          url: desired.radarr.url,
        })
        await context.bazarrClient.configureRadarrIntegration(
          desired.radarr.url,
          desired.radarr.apiKey,
        )
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
      if (!context.bazarrClient) return false
      const settings = await context.bazarrClient.getSettings()
      const desired = this.getDesiredState(context)

      if (desired.sonarr) {
        const sonarrSettings = settings.sonarr as Record<string, unknown> | undefined
        if (!sonarrSettings?.enabled) return false
      }

      if (desired.radarr) {
        const radarrSettings = settings.radarr as Record<string, unknown> | undefined
        if (!radarrSettings?.enabled) return false
      }

      return true
    } catch {
      return false
    }
  }
}
