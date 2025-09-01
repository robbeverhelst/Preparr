import type { PostgresConfig, ServarrConfig } from '@/config/schema'
import { logger } from '@/utils/logger'
import { LidarrClient, ProwlarrClient, RadarrClient, ReadarrClient, SonarrClient } from 'tsarr'

type ServarrClientType = SonarrClient | RadarrClient | LidarrClient | ReadarrClient | ProwlarrClient

export class ServarrManager {
  private client: ServarrClientType
  private config: ServarrConfig

  constructor(config: ServarrConfig) {
    this.config = config
    this.client = this.createClient()
  }

  private createClient(): ServarrClientType {
    const { url, type } = this.config
    const clientConfig = {
      baseUrl: url,
      apiKey: '',
    }

    switch (type) {
      case 'sonarr':
        return new SonarrClient(clientConfig)
      case 'radarr':
        return new RadarrClient(clientConfig)
      case 'lidarr':
        return new LidarrClient(clientConfig)
      case 'readarr':
        return new ReadarrClient(clientConfig)
      case 'prowlarr':
        return new ProwlarrClient(clientConfig)
      default:
        throw new Error(`Unsupported Servarr type: ${type}`)
    }
  }

  async waitForStartup(maxRetries = 30, retryDelay = 2000): Promise<void> {
    logger.info('Waiting for Servarr to start...', { type: this.config.type, url: this.config.url })

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.config.url}/api/v3/system/status`)
        if (response.ok) {
          logger.info('Servarr is ready', { type: this.config.type })
          return
        }
      } catch (_error) {
        logger.debug('Servarr not ready yet', { attempt: i + 1, maxRetries })
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    throw new Error(`Servarr failed to start after ${maxRetries} attempts`)
  }

  async setupInitialUser(): Promise<string> {
    logger.info('Setting up initial admin user...')

    try {
      const authResponse = await fetch(`${this.config.url}/api/v3/authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.config.adminUser,
          password: this.config.adminPassword,
        }),
      })

      if (!authResponse.ok) {
        throw new Error(`Failed to create admin user: ${authResponse.statusText}`)
      }

      const apiKeyResponse = await fetch(`${this.config.url}/api/v3/config/host`, {
        headers: {
          Authorization: `Basic ${btoa(`${this.config.adminUser}:${this.config.adminPassword}`)}`,
        },
      })

      if (!apiKeyResponse.ok) {
        throw new Error(`Failed to get API key: ${apiKeyResponse.statusText}`)
      }

      const hostConfig = (await apiKeyResponse.json()) as { apiKey: string }
      const apiKey = hostConfig.apiKey

      logger.info('Initial admin user and API key configured')
      return apiKey
    } catch (error) {
      logger.error('Failed to setup initial user', { error })
      throw error
    }
  }

  async configureDatabase(postgresConfig: PostgresConfig): Promise<void> {
    logger.info('Configuring Servarr database connection...')

    const dbConfig = {
      type: 'postgres',
      connectionString: `Host=${postgresConfig.host};Port=${postgresConfig.port};Database=${postgresConfig.database};Username=servarr;Password=${postgresConfig.password}`,
    }

    try {
      await fetch(`${this.config.url}/api/v3/config/database`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': await this.getApiKey(),
        },
        body: JSON.stringify(dbConfig),
      })

      logger.info('Database configuration updated')
    } catch (error) {
      logger.error('Failed to configure database', { error })
      throw error
    }
  }

  private async getApiKey(): Promise<string> {
    const response = await fetch(`${this.config.url}/api/v3/config/host`)
    const config = (await response.json()) as { apiKey: string }
    return config.apiKey
  }

  getClient(): ServarrClientType {
    return this.client
  }
}
