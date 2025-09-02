import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import type { QBittorrentConfig, ServiceIntegrationConfig } from '@/config/schema'
import { logger } from '@/utils/logger'

export class QBittorrentManager {
  private config: ServiceIntegrationConfig['qbittorrent']
  private configPath: string
  private isInitialized = false
  private sessionCookie: string | null = null

  constructor(config: ServiceIntegrationConfig['qbittorrent'], configPath?: string) {
    this.config = config
    this.configPath = configPath || '/config/qBittorrent/qBittorrent.conf'
  }

  async writeInitialConfig(): Promise<void> {
    if (!this.config) {
      return
    }

    logger.info('Writing initial qBittorrent config...', {
      username: this.config.username,
      configPath: this.configPath,
    })

    const passwordHash = this.generatePBKDF2Hash(this.config.password)

    const configContent = `[AutoRun]
enabled=false
program=

[BitTorrent]
Session\\AddTorrentStopped=false
Session\\DefaultSavePath=/downloads/
Session\\Port=6881
Session\\QueueingSystemEnabled=true
Session\\SSL\\Port=53540
Session\\ShareLimitAction=Stop
Session\\TempPath=/downloads/incomplete/

[LegalNotice]
Accepted=true

[Meta]
MigrationVersion=8

[Network]
PortForwardingEnabled=false
Proxy\\HostnameLookupEnabled=false
Proxy\\Profiles\\BitTorrent=true
Proxy\\Profiles\\Misc=true
Proxy\\Profiles\\RSS=true

[Preferences]
Connection\\PortRangeMin=6881
Connection\\UPnP=false
Downloads\\SavePath=/downloads/
Downloads\\TempPath=/downloads/incomplete/
WebUI\\Address=*
WebUI\\ServerDomains=*
WebUI\\Username=${this.config.username}
WebUI\\Password_PBKDF2="${passwordHash}"
`

    await Bun.write(this.configPath, configContent)
    logger.info('qBittorrent config written successfully')
  }

  private generatePBKDF2Hash(password: string): string {
    const salt = randomBytes(16)
    const iterations = 100000
    const keyLength = 64

    const hash = pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')

    const encodedSalt = salt.toString('base64')
    const encodedHash = hash.toString('base64')

    return `@ByteArray(${encodedSalt}:${encodedHash})`
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      logger.warn('qBittorrent configuration not provided')
      return false
    }

    try {
      const response = await fetch(`${this.config.url}/api/v2/app/version`)
      return response.status === 403 || response.status === 401 || response.status === 200
    } catch (error) {
      logger.debug('qBittorrent connection test failed', { error })
      return false
    }
  }

  async login(): Promise<boolean> {
    if (!this.config) {
      throw new Error('qBittorrent configuration not provided')
    }

    try {
      const formData = new URLSearchParams()
      formData.append('username', this.config.username)
      formData.append('password', this.config.password)

      const response = await fetch(`${this.config.url}/api/v2/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      })

      const result = await response.text()

      if (result === 'Ok.') {
        const cookies = response.headers.get('set-cookie')
        logger.debug('qBittorrent login successful', { cookies })
        if (cookies) {
          const sidMatch = cookies.match(/SID=([^;]+)/)
          if (sidMatch) {
            this.sessionCookie = `SID=${sidMatch[1]}`
            logger.debug('Session cookie obtained for qBittorrent', { cookie: this.sessionCookie })
          }
        }
        return true
      }

      logger.error('qBittorrent login failed', { result, status: response.status })

      return false
    } catch (error) {
      logger.error('qBittorrent login failed', { error })
      return false
    }
  }

  async applyConfiguration(config: QBittorrentConfig): Promise<void> {
    if (!config) {
      logger.debug('No qBittorrent configuration provided')
      return
    }

    logger.info('Applying qBittorrent configuration...')

    if (config.downloads?.categories) {
      await this.addCategories(config.downloads.categories)
    }

    if (config.downloads?.defaultPath) {
      await this.setDefaultPath(config.downloads.defaultPath)
    }

    logger.info('qBittorrent configuration applied successfully')
  }

  private async addCategories(categories: string[]): Promise<void> {
    for (const category of categories) {
      try {
        const formData = new URLSearchParams()
        formData.append('category', category)
        formData.append('savePath', `/downloads/${category}`)

        const response = await fetch(`${this.config?.url}/api/v2/torrents/createCategory`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: this.sessionCookie || '',
          },
          body: formData,
        })

        if (response.ok) {
          logger.info('Category added successfully', { category })
        } else {
          logger.warn('Failed to add category', { category, status: response.status })
        }
      } catch (error) {
        logger.error('Error adding category', { category, error })
      }
    }
  }

  private async setDefaultPath(path: string): Promise<void> {
    try {
      const formData = new URLSearchParams()
      formData.append('json', JSON.stringify({ save_path: path }))

      const response = await fetch(`${this.config?.url}/api/v2/app/setPreferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: this.sessionCookie || '',
        },
        body: formData,
      })

      if (response.ok) {
        logger.info('Default download path set successfully', { path })
      } else {
        logger.warn('Failed to set default download path', { path, status: response.status })
      }
    } catch (error) {
      logger.error('Error setting default download path', { path, error })
      throw error
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('QBittorrentManager already initialized')
      return
    }

    if (!this.config) {
      logger.info('qBittorrent configuration not provided, skipping initialization')
      return
    }

    logger.info('Initializing qBittorrent...', { url: this.config.url })

    // Write initial config with credentials
    await this.writeInitialConfig()

    await this.waitForStartup()

    const canLogin = await this.login()
    if (!canLogin) {
      logger.warn('Cannot login to qBittorrent with provided credentials', {
        username: this.config.username,
      })
      throw new Error('qBittorrent authentication failed')
    }

    this.isInitialized = true
    logger.info('qBittorrent initialization completed successfully')
  }

  private async waitForStartup(): Promise<void> {
    const maxRetries = 30
    const retryDelay = 2000

    for (let i = 0; i < maxRetries; i++) {
      const isReady = await this.testConnection()
      if (isReady) {
        logger.info('qBittorrent is ready')
        return
      }

      logger.debug('qBittorrent not ready yet', { attempt: i + 1, maxRetries })
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
    }

    throw new Error('qBittorrent failed to start after maximum retries')
  }

  isReady(): boolean {
    return this.isInitialized
  }

  getConfig(): ServiceIntegrationConfig['qbittorrent'] {
    return this.config
  }
}
