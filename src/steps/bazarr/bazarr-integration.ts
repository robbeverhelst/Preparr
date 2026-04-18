import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'
import { toError } from '@/utils/errors'
import { logger } from '@/utils/logger'

interface BazarrServiceState {
  enabled: boolean
  host: string
  port: string
  basePath: string
  ssl: boolean
  apiKey: string
}

interface BazarrIntegrationState {
  sonarr: BazarrServiceState
  radarr: BazarrServiceState
}

interface BazarrIntegrationDesired {
  sonarr?: { url: string; apiKey: string }
  radarr?: { url: string; apiKey: string }
}

const EMPTY_SERVICE_STATE: BazarrServiceState = {
  enabled: false,
  host: '',
  port: '',
  basePath: '',
  ssl: false,
  apiKey: '',
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

  async readCurrentState(_context: StepContext): Promise<BazarrIntegrationState> {
    try {
      const settings = await this.client.getSettings()
      const general = settings.general as Record<string, unknown> | undefined
      const sonarr = settings.sonarr as Record<string, unknown> | undefined
      const radarr = settings.radarr as Record<string, unknown> | undefined

      return {
        sonarr: this.toServiceState(general?.use_sonarr === true, sonarr),
        radarr: this.toServiceState(general?.use_radarr === true, radarr),
      }
    } catch (error) {
      logger.debug('Failed to read Bazarr integration state', { error })
      return { sonarr: EMPTY_SERVICE_STATE, radarr: EMPTY_SERVICE_STATE }
    }
  }

  private toServiceState(
    enabled: boolean,
    settings: Record<string, unknown> | undefined,
  ): BazarrServiceState {
    return {
      enabled,
      host: String(settings?.ip ?? ''),
      port: String(settings?.port ?? ''),
      basePath: String(settings?.base_url ?? '/'),
      ssl: settings?.ssl === true,
      apiKey: String(settings?.apikey ?? ''),
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

    if (desired.sonarr && this.serviceDiffers(current.sonarr, desired.sonarr)) {
      changes.push({
        type: 'update',
        resource: 'bazarr-integration',
        identifier: 'sonarr',
        details: { url: desired.sonarr.url },
      })
    }

    if (desired.radarr && this.serviceDiffers(current.radarr, desired.radarr)) {
      changes.push({
        type: 'update',
        resource: 'bazarr-integration',
        identifier: 'radarr',
        details: { url: desired.radarr.url },
      })
    }

    return changes
  }

  private serviceDiffers(
    current: BazarrServiceState,
    desired: { url: string; apiKey: string },
  ): boolean {
    if (!current.enabled) return true

    const expected = this.client.parseServiceUrl(desired.url)
    return (
      current.host !== expected.host ||
      current.port !== expected.port ||
      current.basePath !== expected.basePath ||
      current.ssl !== expected.ssl ||
      current.apiKey !== desired.apiKey
    )
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
          logger.info('Configuring Bazarr Sonarr integration...', {
            url: desired.sonarr.url,
          })
          await this.client.configureSonarrIntegration(desired.sonarr.url, desired.sonarr.apiKey)
        }

        if (change.identifier === 'radarr' && desired.radarr) {
          logger.info('Configuring Bazarr Radarr integration...', {
            url: desired.radarr.url,
          })
          await this.client.configureRadarrIntegration(desired.radarr.url, desired.radarr.apiKey)
        }
      }

      logger.info('Bazarr integrations configured successfully')

      return {
        success: true,
        changes,
        errors,
        warnings,
      }
    } catch (error) {
      const err = toError(error)
      errors.push(err)
      logger.error('Failed to configure Bazarr integrations', { error: err.message })
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
      const desired = this.getDesiredState(context)
      const current = await this.readCurrentState(context)

      if (desired.sonarr && this.serviceDiffers(current.sonarr, desired.sonarr)) {
        return false
      }

      if (desired.radarr && this.serviceDiffers(current.radarr, desired.radarr)) {
        return false
      }

      return true
    } catch {
      return false
    }
  }
}
