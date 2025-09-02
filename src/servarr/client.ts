import type {
  DownloadClient,
  Indexer,
  PostgresConfig,
  RootFolder,
  ServarrConfig,
} from '@/config/schema'
import { logger } from '@/utils/logger'
import { SQL } from 'bun'
import { LidarrClient, ProwlarrClient, RadarrClient, ReadarrClient, SonarrClient } from 'tsarr'

type ServarrClientType = SonarrClient | RadarrClient | LidarrClient | ReadarrClient | ProwlarrClient

export class ServarrManager {
  private client: ServarrClientType | null = null
  private config: ServarrConfig
  private apiKey: string | null = null
  private isInitialized = false
  private configPath: string

  constructor(config: ServarrConfig, configPath?: string) {
    this.config = config
    this.configPath = configPath || process.env.SERVARR_CONFIG_PATH || '/config/config.xml'
  }

  private async detectServarrType(): Promise<string> {
    logger.info('Auto-detecting Servarr type...', { url: this.config.url })

    try {
      const clientConfig = {
        baseUrl: this.config.url,
        apiKey: this.config.apiKey,
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
        const response = await fetch(`${this.config.url}/api/v3/system/status`, {
          headers: { 'X-Api-Key': this.config.apiKey },
        })

        if (response.ok) {
          const status = (await response.json()) as { appName?: string; instanceName?: string }

          if (status.appName) {
            const detectedType = status.appName.toLowerCase()
            logger.info('Detected Servarr type from direct API', {
              detectedType,
              appName: status.appName,
            })
            return detectedType
          }
        }
      } catch (error) {
        logger.debug('Direct API detection failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      logger.debug('Direct API detection failed, trying URL fallback')
      const url = this.config.url.toLowerCase()

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

  private createDatabaseConnection(database?: string): SQL {
    const mainDbName = database || `${this.config.type}_main`
    const host = process.env.POSTGRES_HOST || 'postgres'
    const port = process.env.POSTGRES_PORT || '5432'
    const password = process.env.POSTGRES_PASSWORD || ''
    const connectionString = `postgres://${this.config.type}:${password}@${host}:${port}/${mainDbName}`

    logger.debug('Creating database connection', {
      type: this.config.type,
      database: mainDbName,
      connectionString: connectionString.replace(password, '***'),
    })

    return new SQL(connectionString)
  }

  private async readExistingApiKey(): Promise<string | null> {
    try {
      const configFile = Bun.file(this.configPath)
      if (await configFile.exists()) {
        const content = await configFile.text()
        const apiKeyMatch = content.match(/<ApiKey>([^<]+)<\/ApiKey>/)
        if (apiKeyMatch) {
          return apiKeyMatch[1]
        }
      }
    } catch (error) {
      logger.debug('Could not read existing config.xml', { error })
    }
    return null
  }

  private generateApiKey(): string {
    // Generate a 32-character hexadecimal API key
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  private createClient(apiKey: string): ServarrClientType {
    const { url, type } = this.config
    const clientConfig = {
      baseUrl: url,
      apiKey,
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
      case 'auto':
        throw new Error('Type must be detected before creating client')
      default:
        throw new Error(`Unsupported Servarr type: ${type}`)
    }
  }

  async detectType(): Promise<string> {
    if (this.config.type !== 'auto') {
      return this.config.type
    }

    await this.waitForStartup()
    return await this.detectServarrType()
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('ServarrManager already initialized')
      return
    }

    if (this.config.type === 'auto') {
      await this.waitForStartup()
      const detectedType = await this.detectServarrType()
      this.config = {
        ...this.config,
        type: detectedType as 'sonarr' | 'radarr' | 'lidarr' | 'readarr' | 'prowlarr',
      }
    }

    const configChanged = await this.writeConfigXml()

    await this.waitForStartup()

    if (configChanged) {
      await this.restartToApplyConfig()
      await this.waitForStartup()
    }

    try {
      if (!this.apiKey) {
        throw new Error('API key is required but not available')
      }
      this.client = this.createClient(this.apiKey)
      this.isInitialized = true
      logger.info('ServarrManager initialized successfully', { type: this.config.type })
    } catch (error) {
      logger.error('Failed to initialize ServarrManager', { error, type: this.config.type })
      throw error
    }
  }

  private async writeConfigXml(): Promise<boolean> {
    // First, try to read existing config.xml to get current API key
    const existingApiKey = await this.readExistingApiKey()

    // Use existing API key if available, otherwise generate or use provided one
    if (existingApiKey) {
      this.apiKey = existingApiKey
      logger.info('Using existing API key from Servarr config', {
        apiKey: `${this.apiKey.slice(0, 8)}...`,
      })
    } else if (this.config.apiKey) {
      this.apiKey = this.config.apiKey
      logger.info('Using provided API key', {
        apiKey: `${this.apiKey.slice(0, 8)}...`,
      })
    } else {
      this.apiKey = this.generateApiKey()
      logger.info('Generated new API key for Servarr', {
        apiKey: `${this.apiKey.slice(0, 8)}...`,
      })
    }

    logger.info('Writing Servarr config.xml...', {
      type: this.config.type,
      configPath: this.configPath,
      apiKey: `${this.apiKey.slice(0, 8)}...`,
    })

    const port =
      this.config.type === 'sonarr'
        ? 8989
        : this.config.type === 'radarr'
          ? 7878
          : this.config.type === 'lidarr'
            ? 8686
            : this.config.type === 'readarr'
              ? 8787
              : 9696

    const configXml = `<Config>
  <BindAddress>*</BindAddress>
  <Port>${port}</Port>
  <SslPort>${port + 1000}</SslPort>
  <EnableSsl>False</EnableSsl>
  <LaunchBrowser>False</LaunchBrowser>
  <ApiKey>${this.apiKey}</ApiKey>
  <AuthenticationMethod>Basic</AuthenticationMethod>
  <AuthenticationRequired>Enabled</AuthenticationRequired>
  <Branch>main</Branch>
  <LogLevel>info</LogLevel>
  <SslCertPath></SslCertPath>
  <SslCertPassword></SslCertPassword>
  <UrlBase></UrlBase>
  <InstanceName>${process.env.SERVARR_INSTANCE_NAME || this.config.type.charAt(0).toUpperCase() + this.config.type.slice(1)}</InstanceName>
  <UpdateMechanism>Docker</UpdateMechanism>
  <AnalyticsEnabled>False</AnalyticsEnabled>
  <PostgresUser>${this.config.type}</PostgresUser>
  <PostgresPassword>${process.env.POSTGRES_PASSWORD}</PostgresPassword>
  <PostgresPort>${process.env.POSTGRES_PORT || 5432}</PostgresPort>
  <PostgresHost>${process.env.POSTGRES_HOST || 'postgres'}</PostgresHost>
  <PostgresMainDb>${this.config.type}_main</PostgresMainDb>
  <PostgresLogDb>${this.config.type}_log</PostgresLogDb>
</Config>`

    try {
      const configFile = Bun.file(this.configPath)
      let configChanged = true

      if (await configFile.exists()) {
        const existingContent = await configFile.text()
        configChanged = existingContent !== configXml
      }

      if (configChanged) {
        await Bun.write(this.configPath, configXml)
        logger.info('Config.xml written successfully', {
          type: this.config.type,
          apiKey: `${this.apiKey.slice(0, 8)}...`,
          changed: configChanged,
        })
      } else {
        logger.debug('Config.xml unchanged, skipping write')
      }

      return configChanged
    } catch (error) {
      logger.error('Failed to write config.xml', { error, configPath: this.configPath })
      throw error
    }
  }

  private async waitForStartup(maxRetries = 30, retryDelay = 2000): Promise<void> {
    logger.info('Waiting for Servarr to start...', { type: this.config.type, url: this.config.url })

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.config.url}/api/v3/system/status`)
        if (response.ok || response.status === 401) {
          logger.info('Servarr is ready', { type: this.config.type, status: response.status })
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

  private async restartToApplyConfig(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key required for restart')
    }

    logger.info('Restarting Servarr to apply config changes...', {
      type: this.config.type,
    })

    try {
      const response = await fetch(`${this.config.url}/api/v3/system/restart`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (response.ok) {
        logger.info('Restart command sent successfully')
        await new Promise((resolve) => setTimeout(resolve, 5000))
      } else {
        logger.warn('Failed to restart via API, but continuing...', { status: response.status })
      }
    } catch (error) {
      logger.warn('Could not restart via API, but continuing...', { error })
    }
  }

  async verifyPostgreSQLConnection(): Promise<boolean> {
    logger.info('Verifying PostgreSQL connection...')

    try {
      const db = this.createDatabaseConnection()
      await db`SELECT 1 as test`
      db.close()

      logger.info('PostgreSQL connection successful', { database: `${this.config.type}_main` })
      return true
    } catch (error) {
      logger.warn('PostgreSQL connection not ready yet', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  async checkServarrTablesInitialized(): Promise<boolean> {
    logger.info('Checking if Servarr has initialized database tables...')

    try {
      const db = this.createDatabaseConnection()
      const tables = await db`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('Users', 'Config', 'RootFolders', 'Indexers')
      `
      db.close()

      const tableNames = tables.map((t: { table_name: string }) => t.table_name)
      const requiredTables = ['Users', 'Config']
      const hasRequiredTables = requiredTables.every((table) => tableNames.includes(table))

      logger.info('Database table check completed', {
        hasRequiredTables,
        foundTables: tableNames.length,
        requiredTables,
      })

      logger.debug('About to close database connection in checkServarrTablesInitialized')
      db.close()
      logger.debug('Database connection closed in checkServarrTablesInitialized')

      return hasRequiredTables
    } catch (error) {
      logger.error('Failed to check database tables', { error })
      return false
    }
  }

  async createInitialUser(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ServarrManager must be initialized before creating user')
    }

    logger.info('Creating initial admin user...', {
      username: this.config.adminUser,
    })

    try {
      const db = this.createDatabaseConnection()

      const existingUsers =
        await db`SELECT * FROM "Users" WHERE LOWER("Username") = LOWER(${this.config.adminUser})`

      if (existingUsers.length > 0) {
        logger.info('Admin user already exists', { username: this.config.adminUser })
        logger.debug('Closing database connection after user check')
        try {
          db.close()
          logger.debug('Database connection closed successfully')
        } catch (closeError) {
          logger.warn('Error closing database connection', { closeError })
        }
        logger.debug('Returning from createInitialUser')
        return
      }

      const userId = crypto.randomUUID()
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const saltBase64 = Buffer.from(salt).toString('base64')

      const encoder = new TextEncoder()
      const passwordBytes = encoder.encode(this.config.adminPassword)
      const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, [
        'deriveBits',
      ])
      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 10000,
          hash: 'SHA-512',
        },
        key,
        256,
      )

      const hashedPassword = Buffer.from(hashBuffer).toString('base64')

      await db`
        INSERT INTO "Users" ("Identifier", "Username", "Password", "Salt", "Iterations")
        VALUES (${userId}, ${this.config.adminUser.toLowerCase()}, ${hashedPassword}, ${saltBase64}, 10000)
      `

      db.close()

      logger.info('Initial admin user created successfully', {
        username: this.config.adminUser,
        userId,
      })
    } catch (error) {
      logger.error('Failed to create initial user', { error })
      throw error
    }
  }

  async configureDatabase(postgresConfig: PostgresConfig): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager must be initialized before configuring database')
    }

    logger.info('Configuring Servarr database connection...')

    const dbConfig = {
      databaseType: 'postgresql',
      host: postgresConfig.host,
      port: postgresConfig.port,
      database: `${this.config.type}_main`,
      user: this.config.type,
      password: postgresConfig.password,
      logDatabase: `${this.config.type}_log`,
    }

    try {
      const response = await fetch(`${this.config.url}/api/v3/config/database`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(dbConfig),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Database configuration failed: ${response.status} - ${errorText}`)
      }

      logger.info('Database configuration updated')

      await this.restartServarr()
    } catch (error) {
      logger.error('Failed to configure database', { error })
      throw error
    }
  }

  private async restartServarr(): Promise<void> {
    logger.info('Restarting Servarr to apply database configuration...')

    if (!this.apiKey) {
      throw new Error('API key not available for restart')
    }

    try {
      await fetch(`${this.config.url}/api/v3/system/restart`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 5000))

      await this.waitForStartup()

      logger.info('Servarr restarted successfully')
    } catch (error) {
      logger.error('Failed to restart Servarr', { error })
      throw error
    }
  }

  getClient(): ServarrClientType {
    if (!this.client) {
      throw new Error('ServarrManager not initialized. Call initialize() first.')
    }
    return this.client
  }

  getApiKey(): string {
    if (!this.apiKey) {
      throw new Error('API key not available. Initialize ServarrManager first.')
    }
    return this.apiKey
  }

  getType(): string {
    return this.config.type
  }

  isReady(): boolean {
    return this.isInitialized && this.client !== null && this.apiKey !== null
  }

  async testConnection(): Promise<boolean> {
    if (!this.isInitialized || !this.apiKey) {
      logger.debug('testConnection failed: not initialized or no API key')
      return false
    }

    try {
      const response = await fetch(`${this.config.url}/api/v3/system/status`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      logger.debug('testConnection result', {
        status: response.status,
        ok: response.ok,
        apiKey: `${this.apiKey.slice(0, 8)}...`,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.warn('API connection test failed', {
          status: response.status,
          error: errorText,
        })
      }

      return response.ok
    } catch (error) {
      logger.error('testConnection exception', { error })
      return false
    }
  }

  async getRootFolders(): Promise<RootFolder[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    try {
      const response = await fetch(`${this.config.url}/api/v3/rootfolder`, {
        headers: { 'X-Api-Key': this.apiKey },
      })

      if (!response.ok) {
        throw new Error(`Failed to get root folders: ${response.statusText}`)
      }

      const rootFolders = (await response.json()) as Array<{
        path: string
        accessible: boolean
        freeSpace: number
        unmappedFolders?: Array<{ path: string }>
      }>

      return rootFolders.map((folder) => ({
        path: folder.path,
        accessible: folder.accessible,
        freeSpace: folder.freeSpace,
        unmappedFolders: folder.unmappedFolders?.map((f) => f.path) || [],
      }))
    } catch (error) {
      logger.error('Failed to get root folders', { error })
      throw error
    }
  }

  async addRootFolder(rootFolder: RootFolder): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Adding root folder...', { path: rootFolder.path })

    try {
      const existingFolders = await this.getRootFolders()
      const exists = existingFolders.some((folder) => folder.path === rootFolder.path)

      if (exists) {
        logger.debug('Root folder already exists', { path: rootFolder.path })
        return
      }

      const response = await fetch(`${this.config.url}/api/v3/rootfolder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ path: rootFolder.path }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to add root folder: ${response.status} - ${errorText}`)
      }

      logger.info('Root folder added successfully', { path: rootFolder.path })
    } catch (error) {
      logger.error('Failed to add root folder', { path: rootFolder.path, error })
      throw error
    }
  }

  async configureRootFolders(rootFolders: RootFolder[]): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Configuring root folders...', { count: rootFolders.length })

    try {
      for (const rootFolder of rootFolders) {
        await this.addRootFolder(rootFolder)
      }

      const currentFolders = await this.getRootFolders()
      const configuredPaths = rootFolders.map((f) => f.path)
      const currentPaths = currentFolders.map((f) => f.path)

      const missing = configuredPaths.filter((path) => !currentPaths.includes(path))
      if (missing.length > 0) {
        logger.warn('Some root folders were not added successfully', { missing })
      }

      logger.info('Root folder configuration completed', {
        configured: configuredPaths.length,
        total: currentPaths.length,
      })
    } catch (error) {
      logger.error('Failed to configure root folders', { error })
      throw error
    }
  }

  async removeRootFolder(path: string): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Removing root folder...', { path })

    try {
      const rootFolders = await this.getRootFolders()
      const targetFolder = rootFolders.find((folder) => folder.path === path)

      if (!targetFolder) {
        logger.debug('Root folder does not exist', { path })
        return
      }

      const response = await fetch(`${this.config.url}/api/v3/rootfolder`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get root folder details: ${response.statusText}`)
      }

      const folders = (await response.json()) as Array<{ id: number; path: string }>
      const folder = folders.find((f) => f.path === path)

      if (!folder) {
        logger.debug('Root folder not found for removal', { path })
        return
      }

      const deleteResponse = await fetch(`${this.config.url}/api/v3/rootfolder/${folder.id}`, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        throw new Error(`Failed to remove root folder: ${deleteResponse.status} - ${errorText}`)
      }

      logger.info('Root folder removed successfully', { path })
    } catch (error) {
      logger.error('Failed to remove root folder', { path, error })
      throw error
    }
  }

  async getIndexers(): Promise<Indexer[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    try {
      const response = await fetch(`${this.config.url}/api/v3/indexer`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get indexers: ${response.statusText}`)
      }

      const indexers = (await response.json()) as Array<{
        id: number
        name: string
        implementation: string
        implementationName: string
        configContract: string
        infoLink?: string
        tags: number[]
        fields: Array<{ name: string; value: string | number | boolean }>
        enable: boolean
        priority: number
      }>

      return indexers.map((indexer) => ({
        name: indexer.name,
        implementation: indexer.implementation,
        implementationName: indexer.implementationName,
        configContract: indexer.configContract,
        infoLink: indexer.infoLink,
        tags: indexer.tags,
        fields: indexer.fields,
        enable: indexer.enable,
        priority: indexer.priority,
      }))
    } catch (error) {
      logger.error('Failed to get indexers', { error })
      throw error
    }
  }

  async addIndexer(indexer: Indexer): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Adding indexer...', { name: indexer.name, implementation: indexer.implementation })

    try {
      const existingIndexers = await this.getIndexers()
      const exists = existingIndexers.some((existing) => existing.name === indexer.name)

      if (exists) {
        logger.debug('Indexer already exists', { name: indexer.name })
        return
      }

      const response = await fetch(`${this.config.url}/api/v3/indexer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(indexer),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to add indexer: ${response.status} - ${errorText}`)
      }

      logger.info('Indexer added successfully', { name: indexer.name })
    } catch (error) {
      logger.error('Failed to add indexer', { name: indexer.name, error })
      throw error
    }
  }

  async configureIndexers(indexers: Indexer[]): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Configuring indexers...', { count: indexers.length })

    try {
      for (const indexer of indexers) {
        await this.addIndexer(indexer)
      }

      await this.testIndexers()

      logger.info('Indexer configuration completed', { count: indexers.length })
    } catch (error) {
      logger.error('Failed to configure indexers', { error })
      throw error
    }
  }

  async testIndexers(): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Testing all indexers...')

    try {
      const indexers = await this.getIndexers()

      for (const indexer of indexers) {
        try {
          const testResponse = await fetch(`${this.config.url}/api/v3/indexer/test`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': this.apiKey,
            },
            body: JSON.stringify({
              name: indexer.name,
              implementation: indexer.implementation,
              implementationName: indexer.implementationName,
              configContract: indexer.configContract,
              fields: indexer.fields,
            }),
          })

          if (testResponse.ok) {
            logger.info('Indexer test successful', { name: indexer.name })
          } else {
            logger.warn('Indexer test failed', {
              name: indexer.name,
              status: testResponse.status,
            })
          }
        } catch (error) {
          logger.warn('Failed to test indexer', { name: indexer.name, error })
        }
      }

      logger.info('Indexer testing completed')
    } catch (error) {
      logger.error('Failed to test indexers', { error })
      throw error
    }
  }

  async removeIndexer(name: string): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Removing indexer...', { name })

    try {
      const response = await fetch(`${this.config.url}/api/v3/indexer`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get indexers: ${response.statusText}`)
      }

      const indexers = (await response.json()) as Array<{ id: number; name: string }>
      const indexer = indexers.find((i) => i.name === name)

      if (!indexer) {
        logger.debug('Indexer not found for removal', { name })
        return
      }

      const deleteResponse = await fetch(`${this.config.url}/api/v3/indexer/${indexer.id}`, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        throw new Error(`Failed to remove indexer: ${deleteResponse.status} - ${errorText}`)
      }

      logger.info('Indexer removed successfully', { name })
    } catch (error) {
      logger.error('Failed to remove indexer', { name, error })
      throw error
    }
  }

  async getDownloadClients(): Promise<DownloadClient[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    try {
      const response = await fetch(`${this.config.url}/api/v3/downloadclient`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get download clients: ${response.statusText}`)
      }

      const clients = (await response.json()) as Array<{
        id: number
        name: string
        implementation: string
        implementationName: string
        configContract: string
        fields: Array<{ name: string; value: string | number | boolean }>
        enable: boolean
        priority: number
      }>

      return clients.map((client) => ({
        name: client.name,
        implementation: client.implementation,
        implementationName: client.implementationName,
        configContract: client.configContract,
        fields: client.fields,
        enable: client.enable,
        priority: client.priority,
      }))
    } catch (error) {
      logger.error('Failed to get download clients', { error })
      throw error
    }
  }

  async addDownloadClient(client: DownloadClient): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Adding download client...', {
      name: client.name,
      implementation: client.implementation,
    })

    try {
      const existingClients = await this.getDownloadClients()
      const exists = existingClients.some((existing) => existing.name === client.name)

      if (exists) {
        logger.debug('Download client already exists', { name: client.name })
        return
      }

      const response = await fetch(`${this.config.url}/api/v3/downloadclient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(client),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to add download client: ${response.status} - ${errorText}`)
      }

      logger.info('Download client added successfully', { name: client.name })
    } catch (error) {
      logger.error('Failed to add download client', { name: client.name, error })
      throw error
    }
  }

  async configureDownloadClients(clients: DownloadClient[]): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Configuring download clients...', { count: clients.length })

    try {
      for (const client of clients) {
        await this.addDownloadClient(client)
      }

      await this.testDownloadClients()

      logger.info('Download client configuration completed', { count: clients.length })
    } catch (error) {
      logger.error('Failed to configure download clients', { error })
      throw error
    }
  }

  async testDownloadClients(): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Testing all download clients...')

    try {
      const clients = await this.getDownloadClients()

      for (const client of clients) {
        try {
          const testResponse = await fetch(`${this.config.url}/api/v3/downloadclient/test`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': this.apiKey,
            },
            body: JSON.stringify({
              name: client.name,
              implementation: client.implementation,
              implementationName: client.implementationName,
              configContract: client.configContract,
              fields: client.fields,
            }),
          })

          if (testResponse.ok) {
            logger.info('Download client test successful', { name: client.name })
          } else {
            logger.warn('Download client test failed', {
              name: client.name,
              status: testResponse.status,
            })
          }
        } catch (error) {
          logger.warn('Failed to test download client', { name: client.name, error })
        }
      }

      logger.info('Download client testing completed')
    } catch (error) {
      logger.error('Failed to test download clients', { error })
      throw error
    }
  }

  async removeDownloadClient(name: string): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Removing download client...', { name })

    try {
      const response = await fetch(`${this.config.url}/api/v3/downloadclient`, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get download clients: ${response.statusText}`)
      }

      const clients = (await response.json()) as Array<{ id: number; name: string }>
      const client = clients.find((c) => c.name === name)

      if (!client) {
        logger.debug('Download client not found for removal', { name })
        return
      }

      const deleteResponse = await fetch(`${this.config.url}/api/v3/downloadclient/${client.id}`, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': this.apiKey,
        },
      })

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        throw new Error(`Failed to remove download client: ${deleteResponse.status} - ${errorText}`)
      }

      logger.info('Download client removed successfully', { name })
    } catch (error) {
      logger.error('Failed to remove download client', { name, error })
      throw error
    }
  }
}
