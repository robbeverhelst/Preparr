import type {
  BazarrLanguage,
  BazarrLanguageProfile,
  BazarrProvider,
  BazarrSubtitleDefaults,
} from '@/config/schema'
import { logger } from '@/utils/logger'
import { withRetry } from '@/utils/retry'

interface BazarrLanguageProfileApi {
  profileId: number
  name: string
  cutoff: number | null
  items: Array<{
    id: number
    language: string
    forced: string
    hi: string
    audio_exclude: string
  }>
  mustContain: string
  mustNotContain: string
  originalFormat: number | null
  tag: string | null
}

export class BazarrManager {
  private config: { url: string; apiKey?: string }
  private isInitialized = false

  constructor(config: { url: string; apiKey?: string }) {
    this.config = config
  }

  /**
   * Build the API URL with apikey as query parameter.
   * Bazarr requires apikey as a query param for POST requests and supports
   * it for GET requests as well (more reliable than headers).
   */
  private buildUrl(path: string): string {
    const base = `${this.config.url}/api${path}`
    if (this.config.apiKey) {
      const separator = base.includes('?') ? '&' : '?'
      return `${base}${separator}apikey=${this.config.apiKey}`
    }
    return base
  }

  private async apiGet(path: string): Promise<Response> {
    return await fetch(this.buildUrl(path), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * Post form data to the Bazarr settings API.
   * Bazarr's POST /api/system/settings expects form-encoded data with
   * hyphen-separated keys like "settings-sonarr-ip" that map to nested
   * config sections. Booleans must be lowercase 'true'/'false'.
   */
  private async postSettingsForm(data: Record<string, string | string[]>): Promise<Response> {
    const url = this.buildUrl('/system/settings')
    const formData = new URLSearchParams()

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          formData.append(key, v)
        }
      } else {
        formData.append(key, value)
      }
    }

    logger.debug('Posting settings form data to Bazarr', {
      path: '/system/settings',
      keys: Object.keys(data),
    })

    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiGet('/system/status')
      return response.ok || response.status === 401
    } catch (error) {
      logger.debug('Bazarr connection test failed', { error })
      return false
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.apiGet('/system/status')
      if (!response.ok) return false
      const body = (await response.json()) as { data?: { bazarr_version?: string } }
      return body.data?.bazarr_version !== undefined
    } catch (error) {
      logger.debug('Bazarr ping failed', { error })
      return false
    }
  }

  async getSystemStatus(): Promise<unknown> {
    try {
      const response = await this.apiGet('/system/status')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      logger.error('Failed to get Bazarr system status', { error })
      throw error
    }
  }

  async getSettings(): Promise<Record<string, unknown>> {
    try {
      const response = await this.apiGet('/system/settings')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      const settings = (await response.json()) as Record<string, unknown>
      logger.debug('Retrieved Bazarr settings', {
        sections: Object.keys(settings),
      })
      return settings
    } catch (error) {
      logger.error('Failed to get Bazarr settings', { error })
      throw error
    }
  }

  /**
   * Parse a service URL into host, port, base_url, and ssl components
   * that match Bazarr's settings structure.
   */
  private parseServiceUrl(serviceUrl: string): {
    host: string
    port: string
    basePath: string
    ssl: boolean
  } {
    try {
      const parsed = new URL(serviceUrl)
      return {
        host: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
        basePath: parsed.pathname === '/' ? '/' : parsed.pathname,
        ssl: parsed.protocol === 'https:',
      }
    } catch {
      // If URL parsing fails, treat the whole string as a hostname
      return { host: serviceUrl, port: '8989', basePath: '/', ssl: false }
    }
  }

  async configureSonarrIntegration(url: string, apiKey: string): Promise<void> {
    logger.info('Configuring Bazarr Sonarr integration...', { url })

    try {
      const { host, port, basePath, ssl } = this.parseServiceUrl(url)

      const response = await this.postSettingsForm({
        'settings-general-use_sonarr': 'true',
        'settings-sonarr-ip': host,
        'settings-sonarr-port': port,
        'settings-sonarr-base_url': basePath,
        'settings-sonarr-ssl': ssl ? 'true' : 'false',
        'settings-sonarr-apikey': apiKey,
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr Sonarr integration configured successfully', { host, port })
    } catch (error) {
      logger.error('Failed to configure Bazarr Sonarr integration', { error })
      throw error
    }
  }

  async configureRadarrIntegration(url: string, apiKey: string): Promise<void> {
    logger.info('Configuring Bazarr Radarr integration...', { url })

    try {
      const { host, port, basePath, ssl } = this.parseServiceUrl(url)

      const response = await this.postSettingsForm({
        'settings-general-use_radarr': 'true',
        'settings-radarr-ip': host,
        'settings-radarr-port': port,
        'settings-radarr-base_url': basePath,
        'settings-radarr-ssl': ssl ? 'true' : 'false',
        'settings-radarr-apikey': apiKey,
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr Radarr integration configured successfully', { host, port })
    } catch (error) {
      logger.error('Failed to configure Bazarr Radarr integration', { error })
      throw error
    }
  }

  async getLanguages(): Promise<BazarrLanguage[]> {
    try {
      const response = await this.apiGet('/system/languages')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const raw = (await response.json()) as Array<Record<string, unknown>>

      // Bazarr returns a flat array: [{name, code2, code3, enabled}, ...]
      if (!Array.isArray(raw)) return []

      return raw.map((lang) => ({
        code: (lang.code2 as string) || '',
        name: (lang.name as string) || '',
        enabled: lang.enabled === true,
      }))
    } catch (error) {
      logger.error('Failed to get Bazarr languages', { error })
      return []
    }
  }

  async configureLanguages(languages: BazarrLanguage[]): Promise<void> {
    logger.info('Configuring Bazarr languages...', { count: languages.length })

    try {
      // Bazarr uses "languages-enabled" form field as a list of language codes
      const languageCodes = languages.map((lang) => lang.code)

      const response = await this.postSettingsForm({
        'languages-enabled': languageCodes,
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr languages configured successfully', {
        languages: languageCodes.join(', '),
      })
    } catch (error) {
      logger.error('Failed to configure Bazarr languages', { error })
      throw error
    }
  }

  async getProviders(): Promise<BazarrProvider[]> {
    try {
      // Read enabled providers from settings, not /api/providers
      // (which returns provider throttle/runtime status, not configured providers)
      const settings = await this.getSettings()
      const general = settings.general as Record<string, unknown> | undefined
      const enabledProviders = general?.enabled_providers

      if (!Array.isArray(enabledProviders)) return []

      return enabledProviders.map((name: unknown) => ({
        name: String(name),
        enabled: true,
        settings: {},
      }))
    } catch (error) {
      logger.error('Failed to get Bazarr providers', { error })
      return []
    }
  }

  async configureProviders(providers: BazarrProvider[]): Promise<void> {
    logger.info('Configuring Bazarr subtitle providers...', { count: providers.length })

    try {
      // Bazarr uses "settings-general-enabled_providers" for the provider list
      const enabledProviders = providers.filter((p) => p.enabled).map((p) => p.name)

      const response = await this.postSettingsForm({
        'settings-general-enabled_providers': enabledProviders,
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr subtitle providers configured successfully', {
        providers: enabledProviders.join(', '),
      })
    } catch (error) {
      logger.error('Failed to configure Bazarr subtitle providers', { error })
      throw error
    }
  }

  async configureSubtitleDefaults(defaults: BazarrSubtitleDefaults): Promise<void> {
    logger.info('Configuring Bazarr subtitle defaults...')

    try {
      const response = await this.postSettingsForm({
        'settings-subtitles-hearing_impaired': defaults.seriesType || 'false',
        'settings-subtitles-upgrade_subs': defaults.searchOnUpgrade ? 'true' : 'false',
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr subtitle defaults configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr subtitle defaults', { error })
      throw error
    }
  }

  async getLanguageProfiles(): Promise<BazarrLanguageProfileApi[]> {
    try {
      const response = await this.apiGet('/system/languages/profiles')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      if (!Array.isArray(data)) return []
      return data as BazarrLanguageProfileApi[]
    } catch (error) {
      logger.error('Failed to get Bazarr language profiles', { error })
      return []
    }
  }

  async configureLanguageProfiles(profiles: BazarrLanguageProfile[]): Promise<void> {
    logger.info('Configuring Bazarr language profiles...', { count: profiles.length })

    try {
      // Get existing profiles to preserve IDs for updates
      const existing = await this.getLanguageProfiles()
      const existingByName = new Map(existing.map((p) => [p.name, p]))

      // Find max profile ID to assign new IDs
      const maxProfileId = existing.reduce((max, p) => Math.max(max, p.profileId), 0)

      // Build the profiles array for the API
      let nextProfileId = maxProfileId + 1
      const profilesData = profiles.map((profile) => {
        const existingProfile = existingByName.get(profile.name)
        const profileId = existingProfile?.profileId ?? nextProfileId++

        return {
          profileId,
          name: profile.name,
          cutoff: profile.cutoff ?? null,
          items: profile.items.map((item, itemIndex) => ({
            id: itemIndex + 1,
            language: item.language,
            forced: item.forced ? 'True' : 'False',
            hi: item.hi ? 'True' : 'False',
            audio_exclude: item.audio_exclude ? 'True' : 'False',
          })),
          mustContain: profile.mustContain ?? '',
          mustNotContain: profile.mustNotContain ?? '',
          originalFormat: profile.originalFormat ? 1 : null,
          tag: profile.tag ?? null,
        }
      })

      const response = await this.postSettingsForm({
        'languages-profiles': JSON.stringify(profilesData),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr language profiles configured successfully', {
        profiles: profiles.map((p) => p.name).join(', '),
      })
    } catch (error) {
      logger.error('Failed to configure Bazarr language profiles', { error })
      throw error
    }
  }

  async configureDefaultProfiles(
    seriesProfileName?: string,
    moviesProfileName?: string,
  ): Promise<void> {
    logger.info('Configuring Bazarr default profiles...')

    try {
      // Get profiles to resolve names to IDs
      const profiles = await this.getLanguageProfiles()
      const profilesByName = new Map(profiles.map((p) => [p.name, p.profileId]))

      const formData: Record<string, string> = {}

      if (seriesProfileName) {
        const profileId = profilesByName.get(seriesProfileName)
        if (profileId !== undefined) {
          formData['settings-general-serie_default_profile'] = String(profileId)
        } else {
          logger.warn('Default series profile not found', { name: seriesProfileName })
        }
      }

      if (moviesProfileName) {
        const profileId = profilesByName.get(moviesProfileName)
        if (profileId !== undefined) {
          formData['settings-general-movie_default_profile'] = String(profileId)
        } else {
          logger.warn('Default movies profile not found', { name: moviesProfileName })
        }
      }

      if (Object.keys(formData).length === 0) {
        logger.debug('No default profiles to configure')
        return
      }

      const response = await this.postSettingsForm(formData)

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body}`)
      }

      logger.info('Bazarr default profiles configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr default profiles', { error })
      throw error
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('BazarrManager already initialized')
      return
    }

    logger.info('Initializing BazarrManager...', { url: this.config.url })

    try {
      await this.waitForStartup()
      this.isInitialized = true
      logger.info('BazarrManager initialization completed successfully')
    } catch (error) {
      logger.error('BazarrManager initialization failed', { error })
      throw error
    }
  }

  async waitForStartup(maxRetries = 30, retryDelay = 2000): Promise<void> {
    logger.info('Waiting for Bazarr to start...', { url: this.config.url })

    await withRetry(
      async () => {
        const connected = await this.testConnection()
        if (!connected) {
          throw new Error('Bazarr is not responding')
        }
      },
      {
        maxAttempts: maxRetries,
        delayMs: retryDelay,
        operation: 'bazarr-startup',
      },
    )

    logger.info('Bazarr is ready')
  }

  isReady(): boolean {
    return this.isInitialized
  }

  getConfig(): { url: string; apiKey?: string } {
    return this.config
  }
}
