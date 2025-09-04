import type {
  Application,
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

// Define types for API responses
interface ApiFolder {
  id?: number
  path: string
  accessible?: boolean
  freeSpace?: number
  unmappedFolders?: Array<{ path: string }>
}

interface ApiIndexer {
  id?: number
  name: string
  implementation: string
  implementationName?: string
  configContract?: string
  infoLink?: string
  tags?: string[]
  fields?: Array<{ name: string; value?: unknown }>
  enable?: boolean
  priority?: number
}

interface ApiDownloadClient {
  id?: number
  name: string
  implementation: string
  implementationName?: string
  configContract?: string
  fields?: Array<{ name: string; value?: unknown }>
  enable?: boolean
  priority?: number
}

interface ApiApplication {
  id?: number
  name: string
  implementation: string
  implementationName?: string
  configContract?: string
  fields?: Array<{ name: string; value?: unknown }>
  enable?: boolean
  priority?: number
  syncLevel?: string
}

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
        if (apiKeyMatch?.[1]) {
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

  async detectType(): Promise<string> {
    if (this.config.type !== 'auto') {
      return this.config.type
    }

    await this.waitForStartup()
    return await this.detectServarrType()
  }

  async writeConfigurationOnly(): Promise<void> {
    logger.info('Writing Servarr configuration only (init mode)...')

    // In init mode, service is not running yet, so we can't detect type via API
    // The type should already be configured via SERVARR_TYPE environment variable
    if (this.config.type === 'auto') {
      throw new Error(
        'SERVARR_TYPE must be explicitly set in init mode, cannot auto-detect when service is not running',
      )
    }

    await this.writeConfigXml()
    logger.info('Configuration writing completed', { type: this.config.type })
  }

  async initializeSidecarMode(): Promise<void> {
    logger.info('Initializing ServarrManager for sidecar mode...', { type: this.config.type })

    // Read API key from existing config.xml (written by init container)
    const existingApiKey = await this.readExistingApiKey()
    if (!existingApiKey) {
      throw new Error('No API key found in config.xml - init container may have failed')
    }

    this.apiKey = existingApiKey
    logger.info('Using API key from config', { apiKey: `${this.apiKey.slice(0, 8)}...` })

    // Wait for Servarr service to be ready
    await this.waitForStartup()

    // Wait for database tables to be initialized by Servarr
    logger.info('Waiting for Servarr to initialize database tables...')
    let tablesReady = false
    for (let i = 0; i < 15; i++) {
      try {
        tablesReady = await this.checkServarrTablesInitialized()
        if (tablesReady) break
      } catch (error) {
        logger.debug('Table check failed', { attempt: i + 1, error })
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    if (!tablesReady) {
      throw new Error('Servarr failed to initialize database tables')
    }

    // Initialize client for API operations
    this.client = this.createClient(this.apiKey)
    this.isInitialized = true

    // Create web login user after tables are initialized
    await this.createInitialUser()

    logger.info('ServarrManager sidecar initialization completed', { type: this.config.type })
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
    } else if (process.env.SERVARR_API_KEY) {
      this.apiKey = process.env.SERVARR_API_KEY
      logger.info('Using API key from SERVARR_API_KEY environment variable', {
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
        const tempClient = this.createClient(this.apiKey || '')
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

  private async restartToApplyConfig(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key required for restart')
    }

    logger.info('Restarting Servarr to apply config changes...', {
      type: this.config.type,
    })

    try {
      const result = await this.client?.restartSystem()

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

  async createInitialUserInInitMode(): Promise<void> {
    logger.info('Creating initial admin user in init mode...', {
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
        logger.debug('Returning from createInitialUserInInitMode')
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

      logger.info('Initial admin user created successfully in init mode', {
        username: this.config.adminUser,
        userId,
      })
    } catch (error) {
      logger.error('Failed to create initial user in init mode', { error })
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
      // Use Tsarr updateHostConfig method for database configuration
      if (!this.client || !('updateHostConfig' in this.client)) {
        logger.debug('updateHostConfig not supported for this Servarr type')
        throw new Error('Database configuration not supported for this Servarr type')
      }

      const result = await (
        this.client as { updateHostConfig: (id: number, config: unknown) => Promise<unknown> }
      ).updateHostConfig(1, dbConfig)

      if (!result) {
        throw new Error('No result from updateHostConfig call')
      }

      if (result.error) {
        throw new Error(`Database configuration failed: ${result.error}`)
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
      await this.client?.restartSystem()

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
      const result = await this.client?.getSystemStatus()

      if (!result) {
        logger.warn('No result from system status call')
        return false
      }

      logger.debug('testConnection result', {
        success: !!result.data,
        hasError: !!result.error,
        apiKey: `${this.apiKey.slice(0, 8)}...`,
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

  async getRootFolders(): Promise<RootFolder[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    try {
      if (!this.client || !('getRootFolders' in this.client)) {
        logger.debug('getRootFolders not supported for this Servarr type')
        return []
      }

      const result = await this.client.getRootFolders()

      if (!result) {
        throw new Error('No result from getRootFolders call')
      }

      if (result.error) {
        throw new Error(`Failed to get root folders: ${result.error}`)
      }

      if (!result.data) {
        return []
      }

      return result.data.map((folder: ApiFolder) => ({
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

      if (!this.client || !('addRootFolder' in this.client)) {
        logger.debug('addRootFolder not supported for this Servarr type')
        return
      }

      logger.debug('Calling Tsarr addRootFolder...', {
        path: rootFolder.path,
        clientType: this.client?.constructor.name,
        apiKey: `${this.apiKey?.substring(0, 8)}...`,
      })

      const result = await this.client.addRootFolder(rootFolder.path as string)

      logger.debug('Tsarr addRootFolder result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        error: result?.error,
        statusCode: result?.response?.status,
        statusText: result?.response?.statusText,
        responseBody: result?.data,
      })

      if (!result) {
        throw new Error('No result from addRootFolder call')
      }

      // Check HTTP status codes
      if (result.response?.status && result.response.status >= 400) {
        const errorDetails = {
          status: result.response.status,
          statusText: result.response.statusText,
          error: result.error,
          data: result.data,
        }
        throw new Error(
          `HTTP ${result.response.status}: ${JSON.stringify(result.error)} - ${JSON.stringify(errorDetails)}`,
        )
      }

      if (result.error) {
        throw new Error(`Failed to add root folder: ${JSON.stringify(result.error)}`)
      }

      logger.info('Root folder added successfully', { path: rootFolder.path })
    } catch (error) {
      logger.error('Failed to add root folder', { path: rootFolder.path, error: {} })
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
      if (!this.client || !('getRootFolders' in this.client)) {
        logger.debug('getRootFolders not supported for this Servarr type')
        return
      }

      const result = await this.client.getRootFolders()

      if (!result) {
        throw new Error('No result from getRootFolders call')
      }

      if (result.error) {
        throw new Error(`Failed to get root folders: ${result.error}`)
      }

      if (!result.data) {
        logger.debug('No root folders found', { path })
        return
      }

      const folder = result.data.find((f: ApiFolder) => f.path === path)

      if (!folder) {
        logger.debug('Root folder not found for removal', { path })
        return
      }

      if (!folder.id) {
        throw new Error('Root folder ID is required for deletion')
      }

      if (!this.client || !('deleteRootFolder' in this.client)) {
        logger.debug('deleteRootFolder not supported for this Servarr type')
        return
      }

      const deleteResult = await this.client.deleteRootFolder(folder.id)

      if (!deleteResult) {
        throw new Error('No result from deleteRootFolder call')
      }

      if (deleteResult.error) {
        throw new Error(`Failed to remove root folder: ${deleteResult.error}`)
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
      logger.debug('Calling Tsarr getIndexers...', {
        clientType: this.client?.constructor.name,
        apiKey: `${this.apiKey?.substring(0, 8)}...`,
      })

      const result = await this.client?.getIndexers()

      logger.debug('Tsarr getIndexers result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        error: result?.error,
        dataLength: result?.data?.length,
      })

      if (!result) {
        throw new Error('No result from getIndexers call')
      }

      if (result.error) {
        logger.error('Tsarr getIndexers returned error', { error: result.error })
        throw new Error(`Failed to get indexers: ${result.error}`)
      }

      if (!result.data) {
        logger.debug('No indexers data returned, returning empty array')
        return []
      }

      logger.debug('Mapping indexers data', { count: result.data.length })
      return result.data.map((indexer: ApiIndexer) => ({
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

      logger.debug('Calling Tsarr addIndexer...', {
        name: indexer.name,
        implementation: indexer.implementation,
        clientType: this.client?.constructor.name,
        apiKey: `${this.apiKey?.substring(0, 8)}...`,
        indexerFields: indexer.fields?.map((f) => ({ name: f.name, hasValue: !!f.value })),
      })

      const result = await this.client?.addIndexer(indexer as unknown)

      logger.debug('Tsarr addIndexer result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        error: result?.error,
        statusCode: result?.response?.status,
        statusText: result?.response?.statusText,
        responseBody: result?.data,
      })

      if (!result) {
        throw new Error('No result from addIndexer call')
      }

      // Check HTTP status codes
      if (result.response?.status && result.response.status >= 400) {
        const errorDetails = {
          status: result.response.status,
          statusText: result.response.statusText,
          error: result.error,
          data: result.data,
        }
        throw new Error(
          `HTTP ${result.response.status}: ${result.error || result.response.statusText || 'Unknown error'} - ${JSON.stringify(errorDetails)}`,
        )
      }

      if (result.error) {
        throw new Error(`Failed to add indexer: ${result.error}`)
      }

      // Verify success by checking for data or acceptable status
      if (!result.data && result.response?.status !== 201 && result.response?.status !== 200) {
        throw new Error(
          `Indexer addition failed - no data returned and status: ${result.response?.status}`,
        )
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
          const testResult = await this.client?.testIndexer({
            name: indexer.name,
            implementation: indexer.implementation,
            implementationName: indexer.implementationName,
            configContract: indexer.configContract,
            fields: indexer.fields,
          } as unknown)

          if (testResult?.data) {
            logger.info('Indexer test successful', { name: indexer.name })
          } else {
            logger.warn('Indexer test failed', {
              name: indexer.name,
              error: testResult?.error,
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
      const result = await this.client?.getIndexers()

      if (!result) {
        throw new Error('No result from getIndexers call')
      }

      if (result.error) {
        throw new Error(`Failed to get indexers: ${result.error}`)
      }

      if (!result.data) {
        logger.debug('No indexers found', { name })
        return
      }

      const indexer = result.data.find((i: ApiIndexer) => i.name === name)

      if (!indexer) {
        logger.debug('Indexer not found for removal', { name })
        return
      }

      if (!indexer.id) {
        throw new Error('Indexer ID is required for deletion')
      }

      const deleteResult = await this.client?.deleteIndexer(indexer.id)

      if (!deleteResult) {
        throw new Error('No result from deleteIndexer call')
      }

      if (deleteResult.error) {
        throw new Error(`Failed to remove indexer: ${deleteResult.error}`)
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
      if (!this.client || !('getDownloadClients' in this.client)) {
        logger.debug('Download client operations not supported for this Servarr type')
        return []
      }

      const result = await this.client.getDownloadClients()

      if (result.error) {
        throw new Error(`Failed to get download clients: ${result.error}`)
      }

      if (!result.data) {
        return []
      }

      return result.data.map((client: ApiDownloadClient) => ({
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
      if (!this.client || !('addDownloadClient' in this.client)) {
        logger.debug('Download client operations not supported for this Servarr type')
        return
      }

      const existingClients = await this.getDownloadClients()
      const exists = existingClients.some((existing) => existing.name === client.name)

      if (exists) {
        logger.debug('Download client already exists', { name: client.name })
        return
      }

      const result = await this.client.addDownloadClient(client as unknown)

      if (!result) {
        throw new Error('No result from addDownloadClient call')
      }

      if (result.error) {
        throw new Error(`Failed to add download client: ${result.error}`)
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
      if (!this.client || !('testDownloadClient' in this.client)) {
        logger.debug('Download client operations not supported for this Servarr type')
        return
      }

      const clients = await this.getDownloadClients()

      for (const client of clients) {
        try {
          const testResult = await this.client.testDownloadClient({
            name: client.name,
            implementation: client.implementation,
            implementationName: client.implementationName,
            configContract: client.configContract,
            fields: client.fields,
          } as unknown)

          if (testResult?.data) {
            logger.info('Download client test successful', { name: client.name })
          } else {
            logger.warn('Download client test failed', {
              name: client.name,
              error: testResult?.error,
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
      if (
        !this.client ||
        !('getDownloadClients' in this.client) ||
        !('deleteDownloadClient' in this.client)
      ) {
        logger.debug('Download client operations not supported for this Servarr type')
        return
      }

      const result = await this.client.getDownloadClients()

      if (!result) {
        throw new Error('No result from getDownloadClients call')
      }

      if (result.error) {
        throw new Error(`Failed to get download clients: ${result.error}`)
      }

      if (!result.data) {
        logger.debug('No download clients found', { name })
        return
      }

      const client = result.data.find((c: ApiDownloadClient) => c.name === name)

      if (!client) {
        logger.debug('Download client not found for removal', { name })
        return
      }

      if (!client.id) {
        throw new Error('Download client ID is required for deletion')
      }

      const deleteResult = await this.client.deleteDownloadClient(client.id)

      if (!deleteResult) {
        throw new Error('No result from deleteDownloadClient call')
      }

      if (deleteResult.error) {
        throw new Error(`Failed to remove download client: ${deleteResult.error}`)
      }

      logger.info('Download client removed successfully', { name })
    } catch (error) {
      logger.error('Failed to remove download client', { name, error })
      throw error
    }
  }

  async getApplications(): Promise<ApiApplication[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    try {
      if (!this.client || !('getApplications' in this.client)) {
        logger.debug('Applications not supported for this Servarr type')
        return []
      }

      const result = await this.client.getApplications()
      logger.debug('Tsarr getApplications result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        dataLength: Array.isArray(result?.data) ? result.data.length : 0,
      })

      if (result?.error) {
        throw new Error(`Failed to get applications: ${result.error}`)
      }

      return result?.data || []
    } catch (error) {
      logger.error('Failed to get applications', { error })
      throw error
    }
  }

  async addApplication(application: Application): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Adding application...', {
      name: application.name,
      implementation: application.implementation,
    })

    try {
      if (!this.client || !('addApplication' in this.client)) {
        logger.debug('Applications not supported for this Servarr type')
        return
      }

      const existingApplications = await this.getApplications()
      const exists = existingApplications.some((existing) => existing.name === application.name)

      if (exists) {
        logger.debug('Application already exists', { name: application.name })
        return
      }

      logger.debug('About to call Tsarr addApplication', {
        applicationData: JSON.stringify(application, null, 2),
        clientType: typeof this.client,
        hasAddApplicationMethod: 'addApplication' in this.client,
      })

      const result = await this.client.addApplication(application as unknown)

      logger.debug('Tsarr addApplication result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        error: result?.error,
        statusCode: result?.response?.status,
        statusText: result?.response?.statusText,
        responseBody: result?.data,
      })

      if (!result) {
        throw new Error('No result from addApplication call')
      }

      if (result.error) {
        throw new Error(`Failed to add application: ${result.error}`)
      }

      logger.info('Application added successfully', { name: application.name })
    } catch (error) {
      logger.error('Failed to add application', {
        name: application.name,
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: typeof error,
        errorKeys: error && typeof error === 'object' ? Object.keys(error) : [],
        applicationData: {
          name: application.name,
          implementation: application.implementation,
          configContract: application.configContract,
          fieldCount: application.fields?.length || 0,
          fields: application.fields?.map((f) => ({
            name: f.name,
            hasValue: !!f.value,
            valueType: typeof f.value,
          })),
        },
      })
      throw error
    }
  }

  async deleteApplication(applicationId: number): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    logger.info('Deleting application...', { applicationId })

    try {
      if (!this.client || !('deleteApplication' in this.client)) {
        logger.debug('Applications not supported for this Servarr type')
        return
      }

      const result = await this.client.deleteApplication(applicationId)

      if (!result) {
        throw new Error('No result from deleteApplication call')
      }

      if (result.error) {
        throw new Error(`Failed to delete application: ${result.error}`)
      }

      logger.info('Application deleted successfully', { applicationId })
    } catch (error) {
      logger.error('Failed to delete application', { applicationId, error })
      throw error
    }
  }

  async configureApplications(applications: Application[]): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!applications || applications.length === 0) {
      logger.debug('No applications to configure')
      return
    }

    logger.info('Configuring applications...', { count: applications.length })

    try {
      for (const application of applications) {
        await this.addApplication(application)
      }

      logger.info('Application configuration completed', { count: applications.length })
    } catch (error) {
      logger.error('Failed to configure applications', { error })
      throw error
    }
  }
}
