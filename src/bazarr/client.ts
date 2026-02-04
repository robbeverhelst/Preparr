import type { BazarrConfig, BazarrLanguage, BazarrProvider, BazarrSubtitleDefaults } from '@/config/schema'
import { logger } from '@/utils/logger'
import { withRetry } from '@/utils/retry'

export class BazarrManager {
  private config: { url: string; apiKey?: string }
  private isInitialized = false

  constructor(config: { url: string; apiKey?: string }) {
    this.config = config
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.apiKey) {
      headers['X-API-KEY'] = this.config.apiKey
    }
    return headers
  }

  private async apiCall(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.config.url}/api${path}`
    return await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiCall('GET', '/system/status')
      return response.ok || response.status === 401
    } catch (error) {
      logger.debug('Bazarr connection test failed', { error })
      return false
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.apiCall('GET', '/system/status')
      if (!response.ok) return false
      const data = (await response.json()) as { status?: string }
      return data.status !== undefined
    } catch (error) {
      logger.debug('Bazarr ping failed', { error })
      return false
    }
  }

  async getSystemStatus(): Promise<unknown> {
    try {
      const response = await this.apiCall('GET', '/system/status')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      logger.error('Failed to get Bazarr system status', { error })
      throw error
    }
  }

  async getSettings(): Promise<Record<string, unknown>> {
    try {
      const response = await this.apiCall('GET', '/system/settings')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return (await response.json()) as Record<string, unknown>
    } catch (error) {
      logger.error('Failed to get Bazarr settings', { error })
      throw error
    }
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      const response = await this.apiCall('POST', '/system/settings', settings)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      logger.info('Bazarr settings updated successfully')
    } catch (error) {
      logger.error('Failed to update Bazarr settings', { error })
      throw error
    }
  }

  async configureSonarrIntegration(url: string, apiKey: string): Promise<void> {
    logger.info('Configuring Bazarr Sonarr integration...', { url })

    try {
      const settings = await this.getSettings()

      // Bazarr stores Sonarr settings under settings.sonarr
      const sonarrSettings = {
        ...(settings.sonarr as Record<string, unknown>),
        ip: url,
        apikey: apiKey,
        enabled: true,
      }

      await this.updateSettings({ ...settings, sonarr: sonarrSettings })
      logger.info('Bazarr Sonarr integration configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr Sonarr integration', { error })
      throw error
    }
  }

  async configureRadarrIntegration(url: string, apiKey: string): Promise<void> {
    logger.info('Configuring Bazarr Radarr integration...', { url })

    try {
      const settings = await this.getSettings()

      // Bazarr stores Radarr settings under settings.radarr
      const radarrSettings = {
        ...(settings.radarr as Record<string, unknown>),
        ip: url,
        apikey: apiKey,
        enabled: true,
      }

      await this.updateSettings({ ...settings, radarr: radarrSettings })
      logger.info('Bazarr Radarr integration configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr Radarr integration', { error })
      throw error
    }
  }

  async getLanguages(): Promise<BazarrLanguage[]> {
    try {
      const response = await this.apiCall('GET', '/languages')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { language?: Array<{ code: string; name: string }> }
      if (!data.language) return []
      return data.language.map((lang) => ({
        code: lang.code,
        name: lang.name,
        enabled: true,
      }))
    } catch (error) {
      logger.error('Failed to get Bazarr languages', { error })
      return []
    }
  }

  async configureLanguages(languages: BazarrLanguage[]): Promise<void> {
    logger.info('Configuring Bazarr languages...', { count: languages.length })

    try {
      const settings = await this.getSettings()

      // Convert BazarrLanguage[] to language setting format
      const languageSetting = languages.map((lang) => lang.code)

      await this.updateSettings({ ...settings, language: languageSetting })
      logger.info('Bazarr languages configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr languages', { error })
      throw error
    }
  }

  async getProviders(): Promise<BazarrProvider[]> {
    try {
      const response = await this.apiCall('GET', '/providers')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { provider?: Array<{ name: string }> }
      if (!data.provider) return []
      return data.provider.map((prov) => ({
        name: prov.name,
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
      const settings = await this.getSettings()

      // Update providers in settings
      // Bazarr stores provider settings under settings.providers.{provider_name}
      const providersSettings = { ...((settings.providers as Record<string, unknown>) || {}) }

      for (const provider of providers) {
        providersSettings[provider.name] = {
          enabled: provider.enabled,
          ...provider.settings,
        }
      }

      await this.updateSettings({ ...settings, providers: providersSettings })
      logger.info('Bazarr subtitle providers configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr subtitle providers', { error })
      throw error
    }
  }

  async configureSubtitleDefaults(defaults: BazarrSubtitleDefaults): Promise<void> {
    logger.info('Configuring Bazarr subtitle defaults...')

    try {
      const settings = await this.getSettings()

      // Subtitle defaults are stored in various settings fields
      const updatedSettings = {
        ...settings,
        search_on_download: defaults.searchOnDownload,
        search_on_upgrade: defaults.searchOnUpgrade,
        // Type preferences (these may need adjustment based on actual Bazarr API)
        subtitle_default_series: defaults.seriesType,
        subtitle_default_movie: defaults.movieType,
      }

      await this.updateSettings(updatedSettings)
      logger.info('Bazarr subtitle defaults configured successfully')
    } catch (error) {
      logger.error('Failed to configure Bazarr subtitle defaults', { error })
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

    await withRetry(() => this.testConnection(), {
      maxAttempts: maxRetries,
      delayMs: retryDelay,
      operation: 'bazarr-startup',
    })

    logger.info('Bazarr is ready')
  }

  isReady(): boolean {
    return this.isInitialized
  }

  getConfig(): { url: string; apiKey?: string } {
    return this.config
  }
}
