import { LidarrClient, ProwlarrClient, RadarrClient, ReadarrClient, SonarrClient } from 'tsarr'
import type { ServarrConfig } from '@/config/schema'
import { logger } from '@/utils/logger'
import type { ServarrClientType } from './types'

export class ServarrApiClient {
  private config: ServarrConfig

  constructor(config: ServarrConfig) {
    this.config = config
  }

  updateConfig(config: ServarrConfig): void {
    this.config = config
  }

  createClient(apiKey: string): ServarrClientType {
    const { url, type } = this.config
    const clientConfig = {
      baseUrl: url as string,
      apiKey,
    }

    logger.debug('Creating Tsarr client', {
      type,
      url,
      baseUrl: clientConfig.baseUrl,
      apiKey: `${apiKey?.substring(0, 8)}...`,
    })

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
      case 'auto':
        throw new Error('Type must be detected before creating client')
      default:
        throw new Error(`Unsupported Servarr type: ${type}`)
    }
  }

  async detectServarrType(): Promise<string> {
    logger.info('Auto-detecting Servarr type...', { url: this.config.url })

    try {
      const clientConfig = {
        baseUrl: this.config.url as string,
        apiKey: this.config.apiKey || '',
      }

      const servarrTypes = ['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr']

      for (const type of servarrTypes) {
        try {
          let client: ServarrClientType

          switch (type) {
            case 'sonarr':
              client = new SonarrClient(clientConfig)
              break
            case 'radarr':
              client = new RadarrClient(clientConfig)
              break
            case 'lidarr':
              client = new LidarrClient(clientConfig)
              break
            case 'readarr':
              client = new ReadarrClient(clientConfig)
              break
            case 'prowlarr':
              client = new ProwlarrClient(clientConfig)
              break
            default:
              continue
          }

          const status = await client.getSystemStatus()
          if (
            status?.data &&
            typeof status.data === 'object' &&
            'appName' in status.data &&
            typeof status.data.appName === 'string'
          ) {
            const detectedType = status.data.appName.toLowerCase()
            logger.info('Detected Servarr type from API', {
              detectedType,
              appName: status.data.appName,
            })
            return detectedType
          }
        } catch (error) {
          logger.debug('Type detection failed for', {
            type,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      logger.debug('TsArr API detection failed, trying direct API call')
      try {
        const tempClient = new SonarrClient({
          baseUrl: this.config.url as string,
          apiKey: this.config.apiKey || '',
        })
        const result = await tempClient.getSystemStatus()

        if (result.data) {
          const status = result.data as { appName?: string; instanceName?: string }
          if (status.appName) {
            const detectedType = status.appName.toLowerCase()
            logger.info('Detected Servarr type from Tsarr API', {
              detectedType,
              appName: status.appName,
            })
            return detectedType
          }
        }
      } catch (error) {
        logger.debug('Tsarr API detection failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      logger.debug('Direct API detection failed, trying URL fallback')
      const url = (this.config.url || '').toLowerCase()

      for (const type of servarrTypes) {
        if (url.includes(type)) {
          logger.info('Detected Servarr type from URL', { detectedType: type })
          return type
        }
      }

      throw new Error('Could not determine application type from TsArr, API, or URL')
    } catch (error) {
      logger.error('Failed to auto-detect Servarr type', { error })
      throw new Error(
        `Auto-detection failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async detectType(): Promise<string> {
    if (this.config.type !== 'auto') {
      return this.config.type
    }

    return await this.detectServarrType()
  }

  async waitForStartup(apiKey: string, maxRetries = 30, retryDelay = 2000): Promise<void> {
    logger.info('Waiting for Servarr to start...', { type: this.config.type, url: this.config.url })

    for (let i = 0; i < maxRetries; i++) {
      try {
        const tempClient = this.createClient(apiKey)
        const result = await tempClient.getSystemStatus()

        if (result.data || result.response.status === 401) {
          logger.info('Servarr is ready', {
            type: this.config.type,
            status: result.response.status,
          })
          return
        }

        logger.debug('Servarr not ready yet', {
          attempt: i + 1,
          maxRetries,
          status: result.response?.status,
        })
      } catch (_error) {
        logger.debug('Servarr not ready yet', { attempt: i + 1, maxRetries, error: String(_error) })
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    throw new Error(`Servarr failed to start after ${maxRetries} attempts`)
  }

  async restartToApplyConfig(client: ServarrClientType | null): Promise<void> {
    logger.info('Restarting Servarr to apply config changes...', {
      type: this.config.type,
    })

    try {
      const result = await client?.restartSystem()

      if (result?.data) {
        logger.info('Restart command sent successfully')
        await new Promise((resolve) => setTimeout(resolve, 5000))
      } else {
        logger.warn('Failed to restart via API, but continuing...', { error: result?.error })
      }
    } catch (error) {
      logger.warn('Could not restart via API, but continuing...', { error })
    }
  }

  async testConnection(
    client: ServarrClientType | null,
    apiKey: string | null,
    isInitialized: boolean,
  ): Promise<boolean> {
    if (!isInitialized || !apiKey) {
      logger.debug('testConnection failed: not initialized or no API key')
      return false
    }

    try {
      const result = await client?.getSystemStatus()

      if (!result) {
        logger.warn('No result from system status call')
        return false
      }

      logger.debug('testConnection result', {
        success: !!result.data,
        hasError: !!result.error,
        apiKey: `${apiKey.slice(0, 8)}...`,
      })

      if (result.error) {
        logger.warn('API connection test failed', {
          error: result.error,
        })
      }

      return !!result.data
    } catch (error) {
      logger.error('testConnection exception', { error })
      return false
    }
  }
}
