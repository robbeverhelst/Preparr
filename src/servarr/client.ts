import type {
  Application,
  DownloadClient,
  Indexer,
  PostgresConfig,
  RootFolder,
  ServarrConfig,
} from '@/config/schema'
import { logger } from '@/utils/logger'
import { withRetry } from '@/utils/retry'
import { SQL, file, write } from 'bun'

interface DatabaseUser {
  Id: number
  Identifier: string
  Username: string
  Password: string
  Salt: string
  Iterations: number
}
import {
  LidarrClient,
  ProwlarrClient,
  RadarrClient,
  ReadarrClient,
  type Sonarr,
  SonarrClient,
} from 'tsarr'

type IndexerResource = Sonarr.IndexerResource
type DownloadClientResource = Sonarr.DownloadClientResource

type ServarrClientType = SonarrClient | RadarrClient | LidarrClient | ReadarrClient | ProwlarrClient

type ClientWithRootFolders = {
  getRootFolders(): Promise<{
    data?: Sonarr.RootFolderResource[]
    error?: unknown
    response: Response
  }>
  addRootFolder(
    path: string,
  ): Promise<{ data?: Sonarr.RootFolderResource; error?: unknown; response: Response }>
  deleteRootFolder(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

type ClientWithIndexers = {
  getIndexers(): Promise<{ data?: Sonarr.IndexerResource[]; error?: unknown; response: Response }>
  addIndexer(
    indexer: Partial<Sonarr.IndexerResource>,
  ): Promise<{ data?: Sonarr.IndexerResource; error?: unknown; response: Response }>
  deleteIndexer(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

type ClientWithDownloadClients = {
  getDownloadClients(): Promise<{
    data?: Sonarr.DownloadClientResource[]
    error?: unknown
    response: Response
  }>
  addDownloadClient(
    client: Partial<Sonarr.DownloadClientResource>,
  ): Promise<{ data?: Sonarr.DownloadClientResource; error?: unknown; response: Response }>
  deleteDownloadClient(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

type ClientWithHostConfig = {
  updateHostConfig(
    id: number,
    config: Record<string, unknown>,
  ): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

type ClientWithApplications = {
  getApplications(): Promise<{ data?: unknown[]; error?: unknown; response: Response }>
  addApplication(
    application: Record<string, unknown>,
  ): Promise<{ data?: unknown; error?: unknown; response: Response }>
  deleteApplication(id: number): Promise<{ data?: unknown; error?: unknown; response: Response }>
}

interface ClientCapabilities {
  hasRootFolders: boolean
  hasDownloadClients: boolean
  hasApplications: boolean
  hasQualityProfiles: boolean
}

export class ServarrManager {
  private client: ServarrClientType | null = null
  private config: ServarrConfig
  private apiKey: string | null = null
  private isInitialized = false
  private configPath: string
  private capabilities: ClientCapabilities

  constructor(config: ServarrConfig, configPath?: string) {
    this.config = config
    this.configPath = configPath || process.env.SERVARR_CONFIG_PATH || '/config/config.xml'
    this.capabilities = this.getClientCapabilities()
  }

  private getClientCapabilities(): ClientCapabilities {
    const type = this.config.type
    return {
      hasRootFolders: type !== 'prowlarr' && type !== 'qbittorrent',
      hasDownloadClients: type !== 'qbittorrent',
      hasApplications: type === 'prowlarr',
      hasQualityProfiles: type !== 'prowlarr' && type !== 'qbittorrent',
    }
  }

  private handleTsarrResponse<T>(result: { data?: T; error?: unknown; response: Response }): T {
    if (result.error) {
      const errorMessage =
        result.error instanceof Error
          ? result.error.message
          : typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error)
      throw new Error(`API error: ${errorMessage}`)
    }

    if (!result.data) {
      if (result.response.status >= 400) {
        throw new Error(`HTTP ${result.response.status}: ${result.response.statusText}`)
      }
      throw new Error('No data returned from API')
    }

    return result.data
  }

  private mapToTsarrIndexer(indexer: Indexer): Partial<IndexerResource> {
    const tsarrIndexer: Partial<IndexerResource> = {
      name: indexer.name,
      implementation: indexer.implementation,
      implementationName: indexer.implementationName,
      configContract: indexer.configContract,
      infoLink: indexer.infoLink ?? null,
      tags: indexer.tags,
      fields: indexer.fields?.map((field) => ({
        name: field.name,
        value: field.value as string | number | boolean | number[],
      })),
      enableRss: indexer.enable,
      enableAutomaticSearch: indexer.enable,
      enableInteractiveSearch: indexer.enable,
      priority: indexer.priority,
    }

    // Add properties that may not be part of IndexerResource type
    if (indexer.appProfileId) {
      // biome-ignore lint/suspicious/noExplicitAny: IndexerResource type may not include appProfileId
      ;(tsarrIndexer as any).appProfileId = indexer.appProfileId
    }
    // Add enable property (may not be part of IndexerResource type)
    // biome-ignore lint/suspicious/noExplicitAny: IndexerResource type may not include enable
    ;(tsarrIndexer as any).enable = indexer.enable !== false // Enable by default unless explicitly false

    return tsarrIndexer
  }

  private mapToTsarrDownloadClient(client: DownloadClient): Partial<DownloadClientResource> {
    // Normalize generic field names to Servarr-specific ones
    const mapFieldName = (name: string): string => {
      if (name === 'category') {
        if (this.config.type === 'sonarr') return 'tvCategory'
        if (this.config.type === 'radarr') return 'movieCategory'
      }
      return name
    }

    const ignoredFieldNames = new Set([
      'priority',
      'removeCompletedDownloads',
      'removeFailedDownloads',
      'protocol',
    ])

    return {
      name: client.name,
      implementation: client.implementation,
      implementationName: client.implementationName,
      configContract: client.configContract,
      fields: client.fields
        ?.filter((f) => !ignoredFieldNames.has(mapFieldName(f.name)))
        .map((field) => ({
          name: mapFieldName(field.name),
          value: field.value as string | number | boolean | number[],
        })),
      enable: client.enable,
      priority: client.priority,
    }
  }

  private mapToTsarrApplication(application: Application): Record<string, unknown> {
    const mapped = {
      name: application.name,
      implementation: application.implementation,
      implementationName: application.implementationName,
      configContract: application.configContract,
      fields: application.fields?.map((field) => ({
        name: field.name,
        value: field.value as string | number | boolean | number[],
      })),
      enable: application.enable,
      syncLevel: application.syncLevel,
      tags: application.tags,
    }

    logger.info('Mapping application for Prowlarr', {
      name: application.name,
    })

    return mapped
  }

  private hasRootFolders(
    client: ServarrClientType,
  ): client is ServarrClientType & ClientWithRootFolders {
    return 'getRootFolders' in client
  }

  private hasApplications(
    client: ServarrClientType,
  ): client is ServarrClientType & ClientWithApplications {
    return 'getApplications' in client
  }

  private hasIndexers(client: ServarrClientType): client is ServarrClientType & ClientWithIndexers {
    return 'getIndexers' in client
  }

  private hasDownloadClients(
    client: ServarrClientType,
  ): client is ServarrClientType & ClientWithDownloadClients {
    return 'getDownloadClients' in client
  }

  private hasHostConfig(
    client: ServarrClientType,
  ): client is ServarrClientType & ClientWithHostConfig {
    return 'updateHostConfig' in client
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
      const configFile = file(this.configPath)
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

  async writeConfigurationOnly(servarrConfigApiKey?: string): Promise<void> {
    logger.info('Writing Servarr configuration only (init mode)...')

    // In init mode, service is not running yet, so we can't detect type via API
    // The type should already be configured via SERVARR_TYPE environment variable
    if (this.config.type === 'auto') {
      throw new Error(
        'SERVARR_TYPE must be explicitly set in init mode, cannot auto-detect when service is not running',
      )
    }

    await this.writeConfigXml(servarrConfigApiKey)
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

    // Wait for Servarr service to be ready with retry
    await withRetry(() => this.waitForStartup(), {
      maxAttempts: 3,
      delayMs: 5000,
      operation: 'servarr-service-startup',
    })

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
      const validTypes = ['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr'] as const

      if (!validTypes.includes(detectedType as (typeof validTypes)[number])) {
        throw new Error(`Unsupported Servarr type detected: ${detectedType}`)
      }

      this.config = {
        ...this.config,
        type: detectedType as (typeof validTypes)[number],
      }
    }

    const configChanged = await this.writeConfigXml()

    // Skip connectivity checks in init mode
    const isInitMode = process.argv.includes('--init')
    if (!isInitMode) {
      await this.waitForStartup()

      if (configChanged) {
        await this.restartToApplyConfig()
        await this.waitForStartup()
      }
    }

    try {
      if (!this.apiKey) {
        throw new Error('API key is required but not available')
      }
      this.client = this.createClient(this.apiKey)

      // Debug: Check what methods are available on the client
      if (this.client) {
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this.client)).filter(
          (name) => {
            if (!this.client) return false
            const clientObj = this.client as unknown as Record<string, unknown>
            return name in this.client && typeof clientObj[name] === 'function'
          },
        )
        logger.debug('Available client methods', {
          type: this.config.type,
          methods: methods.slice(0, 20), // Just show first 20 methods
          hasAddDownloadClient: methods.includes('addDownloadClient'),
          hasGetDownloadClients: methods.includes('getDownloadClients'),
        })
      }

      this.isInitialized = true
      logger.info('ServarrManager initialized successfully', { type: this.config.type })
    } catch (error) {
      logger.error('Failed to initialize ServarrManager', { error, type: this.config.type })
      throw error
    }
  }

  private async writeConfigXml(servarrConfigApiKey?: string): Promise<boolean> {
    // Priority for API key:
    // 1. API key from loaded servarr configuration (JSON file)
    // 2. API key from servarr config (environment)
    let selectedApiKey: string

    if (servarrConfigApiKey) {
      selectedApiKey = servarrConfigApiKey
      logger.info('Using API key from loaded configuration file', {
        apiKey: `${selectedApiKey.slice(0, 8)}...`,
      })
    } else if (this.config.apiKey) {
      selectedApiKey = this.config.apiKey
      logger.info('Using API key from environment config', {
        apiKey: `${selectedApiKey.slice(0, 8)}...`,
      })
    } else {
      throw new Error(
        'API key is required. Please provide an API key in the configuration file or environment.',
      )
    }

    this.apiKey = selectedApiKey

    // Check if existing config.xml has the same API key
    const existingApiKey = await this.readExistingApiKey()
    const isApiKeyChanged = !existingApiKey || existingApiKey !== this.apiKey

    if (isApiKeyChanged) {
      logger.info('API key changed or missing in config.xml, will update', {
        hadExisting: !!existingApiKey,
        existingKey: existingApiKey ? `${existingApiKey.slice(0, 8)}...` : 'none',
        newKey: `${this.apiKey.slice(0, 8)}...`,
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
    const authenticationMethod = this.config.authenticationMethod === 'forms' ? 'Forms' : 'Basic'

    const configXml = `<Config>
  <BindAddress>*</BindAddress>
  <Port>${port}</Port>
  <SslPort>${port + 1000}</SslPort>
  <EnableSsl>False</EnableSsl>
  <LaunchBrowser>False</LaunchBrowser>
  <ApiKey>${this.apiKey}</ApiKey>
  <AuthenticationMethod>${authenticationMethod}</AuthenticationMethod>
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
      const configFile = file(this.configPath)
      let configChanged = true

      if (await configFile.exists()) {
        const existingContent = await configFile.text()
        configChanged = existingContent !== configXml
      }

      if (configChanged) {
        await write(this.configPath, configXml)
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

      try {
        // Get all users from database to check for duplicates
        let allUsers =
          (await db`SELECT "Id", "Identifier", "Username", "Password", "Salt", "Iterations" FROM "Users"`) as DatabaseUser[]
        const normalizedAdminUser = this.config.adminUser.toLowerCase()

        // Check if the desired admin user already exists
        let existingUser = allUsers.find(
          (user) => user.Username.toLowerCase() === normalizedAdminUser,
        )

        if (!existingUser && allUsers.length > 0) {
          const userToRename =
            allUsers.find((user) => user.Username.toLowerCase() === 'admin') ?? allUsers[0]

          if (!userToRename) {
            throw new Error('Unable to select user for renaming')
          }

          await db`
            UPDATE "Users"
            SET "Username" = ${normalizedAdminUser}
            WHERE "Id" = ${userToRename.Id}
          `

          logger.info('Renamed existing admin user to match desired username', {
            previousUsername: userToRename.Username,
            newUsername: this.config.adminUser,
          })

          const renamedUser: DatabaseUser = {
            ...userToRename,
            Username: normalizedAdminUser,
          }
          existingUser = renamedUser
          allUsers = allUsers.map((user) => (user.Id === userToRename.Id ? renamedUser : user))
        }

        if (!existingUser) {
          // Create new user
          const userId = crypto.randomUUID()
          const salt = crypto.getRandomValues(new Uint8Array(16))
          const saltBase64 = Buffer.from(salt).toString('base64')
          const hashedPassword = await this.hashPassword(this.config.adminPassword, salt)

          await db`
            INSERT INTO "Users" ("Identifier", "Username", "Password", "Salt", "Iterations")
            VALUES (${userId}, ${normalizedAdminUser}, ${hashedPassword}, ${saltBase64}, 10000)
          `

          logger.info('Initial admin user created successfully', {
            username: this.config.adminUser,
            userId,
          })
        } else {
          // User exists - check if password needs updating
          if (
            await this.checkPasswordChange(
              this.config.adminPassword,
              existingUser.Password,
              existingUser.Salt,
            )
          ) {
            await this.updateUserPassword(db, this.config.adminUser, this.config.adminPassword)
            logger.info('Admin user password updated successfully', {
              username: this.config.adminUser,
            })
          } else {
            logger.info('Admin user already exists', { username: this.config.adminUser })
          }
        }

        // Fix for "Sequence contains more than one element" error:
        // Ensure only one admin user exists to prevent Prowlarr authentication issues
        if (allUsers.length > 1) {
          for (const user of allUsers) {
            if (user.Username.toLowerCase() !== this.config.adminUser.toLowerCase()) {
              await db`DELETE FROM "Users" WHERE "Id" = ${user.Id}`
              logger.info('Duplicate admin user removed', {
                username: user.Username,
                reason: 'Preventing multiple user conflicts',
              })
            }
          }
        }
      } finally {
        db.close()
      }
    } catch (error) {
      logger.error('Failed to create initial user', { error })
      throw error
    }
  }

  private async hashPassword(password: string, saltArray: Uint8Array): Promise<string> {
    const encoder = new TextEncoder()
    const passwordBytes = encoder.encode(password)
    const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits'])
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltArray,
        iterations: 10000,
        hash: 'SHA-512',
      },
      key,
      256,
    )
    return Buffer.from(hashBuffer).toString('base64')
  }

  private async checkPasswordChange(
    newPassword: string,
    currentHash: string,
    currentSalt: string,
  ): Promise<boolean> {
    try {
      const saltBuffer = Buffer.from(currentSalt, 'base64')
      const newHash = await this.hashPassword(newPassword, saltBuffer)
      return newHash !== currentHash
    } catch (_error) {
      // If comparison fails, assume password needs updating for safety
      return true
    }
  }

  private async updateUserPassword(db: SQL, username: string, password: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saltBase64 = Buffer.from(salt).toString('base64')
    const hashedPassword = await this.hashPassword(password, salt)

    await db`
      UPDATE "Users" 
      SET "Password" = ${hashedPassword}, "Salt" = ${saltBase64}, "Iterations" = 10000
      WHERE LOWER("Username") = LOWER(${username})
    `
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

      if (!this.hasHostConfig(this.client)) {
        throw new Error('Host config not supported by this client')
      }

      const result = await this.client.updateHostConfig(1, dbConfig)
      this.handleTsarrResponse(result)

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

    if (!this.capabilities.hasRootFolders) {
      logger.debug('Root folders not supported for this Servarr type')
      return []
    }

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    try {
      if (!this.hasRootFolders(this.client)) {
        throw new Error('Root folders not supported by this client')
      }

      const result = await this.client.getRootFolders()
      const folders = this.handleTsarrResponse(result)

      if (!folders) return []

      return folders.map((folder) => ({
        path: folder.path || '',
        accessible: folder.accessible ?? false,
        freeSpace: folder.freeSpace ?? undefined,
        unmappedFolders:
          (folder.unmappedFolders?.map((uf) => uf.path).filter((p) => p != null) as string[]) ?? [],
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

    if (!this.capabilities.hasRootFolders) {
      logger.debug('Root folders not supported for this Servarr type')
      return
    }

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    logger.info('Adding root folder...', { path: rootFolder.path })

    try {
      const existingFolders = await this.getRootFolders()
      const exists = existingFolders.some((folder) => folder.path === rootFolder.path)

      if (exists) {
        logger.debug('Root folder already exists', { path: rootFolder.path })
        return
      }

      if (!this.hasRootFolders(this.client)) {
        throw new Error('Root folders not supported by this client')
      }

      const result = await this.client.addRootFolder(rootFolder.path)
      this.handleTsarrResponse(result) // This will throw if there's an error

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

    if (!this.capabilities.hasRootFolders) {
      logger.debug('Root folders not supported for this Servarr type')
      return
    }

    logger.info('Removing root folder...', { path })

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    try {
      if (!this.hasRootFolders(this.client)) {
        throw new Error('Root folders not supported by this client')
      }

      const result = await this.client.getRootFolders()
      const folders = this.handleTsarrResponse(result)

      if (!folders) {
        logger.debug('No root folders found', { path })
        return
      }

      const folder = folders.find((f) => f.path === path)

      if (!folder) {
        logger.debug('Root folder not found for removal', { path })
        return
      }

      if (!folder.id) {
        throw new Error('Root folder ID is required for deletion')
      }

      if (!this.hasRootFolders(this.client)) {
        throw new Error('Root folders not supported by this client')
      }

      const deleteResult = await this.client.deleteRootFolder(folder.id)
      this.handleTsarrResponse(deleteResult)

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

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    try {
      if (!this.hasIndexers(this.client)) {
        throw new Error('Indexers not supported by this client')
      }

      const result = await this.client.getIndexers()
      const indexers = this.handleTsarrResponse(result)

      if (!indexers) return []

      return indexers.map((indexer) => ({
        name: indexer.name || '',
        implementation: indexer.implementation || '',
        implementationName: indexer.implementationName || '',
        configContract: indexer.configContract || '',
        infoLink: indexer.infoLink ?? undefined,
        tags: indexer.tags ?? [],
        fields:
          indexer.fields?.map((field) => ({
            name: field.name || '',
            value: field.value as string | number | boolean | number[],
          })) ?? [],
        enable: indexer.enableRss ?? false,
        priority: indexer.priority ?? 0,
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

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    logger.info('Adding indexer...', { name: indexer.name, implementation: indexer.implementation })

    try {
      const existingIndexers = await this.getIndexers()
      const exists = existingIndexers.some((existing) => existing.name === indexer.name)

      if (exists) {
        logger.debug('Indexer already exists', { name: indexer.name })
        return
      }

      if (!this.hasIndexers(this.client)) {
        throw new Error('Indexers not supported by this client')
      }

      const tsarrIndexer = this.mapToTsarrIndexer(indexer)
      logger.info('About to add indexer to Prowlarr', {
        name: indexer.name,
        indexerData: JSON.stringify(tsarrIndexer, null, 2),
      })

      const result = await this.client.addIndexer(tsarrIndexer)
      this.handleTsarrResponse(result) // This will throw if there's an error

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
          const testResult = await this.client?.testIndexer(this.mapToTsarrIndexer(indexer))

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
      if (!this.client) {
        throw new Error('Client not initialized')
      }
      const result = await this.client.getIndexers()
      const indexers = this.handleTsarrResponse(result)

      if (!indexers) {
        logger.debug('No indexers found')
        return
      }

      const indexer = indexers.find((i) => i.name === name)

      if (!indexer) {
        logger.debug('Indexer not found for removal', { name })
        return
      }

      if (!indexer.id) {
        throw new Error('Indexer ID is required for deletion')
      }

      if (!this.client) {
        throw new Error('Client not initialized')
      }
      const deleteResult = await this.client.deleteIndexer(indexer.id)
      this.handleTsarrResponse(deleteResult)

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

    if (!this.capabilities.hasDownloadClients) {
      logger.debug('Download clients not supported for this Servarr type')
      return []
    }

    if (!this.client) {
      throw new Error('Client not initialized')
    }

    try {
      if (!this.hasDownloadClients(this.client)) {
        throw new Error('Download clients not supported by this client')
      }

      const result = await this.client.getDownloadClients()
      const clients = this.handleTsarrResponse(result) as Sonarr.DownloadClientResource[]

      return clients.map((client) => ({
        name: client.name || '',
        implementation: client.implementation || '',
        implementationName: client.implementationName || '',
        configContract: client.configContract || '',
        fields:
          client.fields?.map((field) => ({
            name: field.name || '',
            value: field.value as string | number | boolean | number[],
          })) ?? [],
        enable: client.enable ?? false,
        priority: client.priority ?? 0,
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

    if (!this.capabilities.hasDownloadClients) {
      logger.debug('Download clients not supported for this Servarr type')
      return
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

      const tsarrClient = this.mapToTsarrDownloadClient(client)
      if (!this.client) {
        throw new Error('Client not initialized')
      }
      const result = await this.client.addDownloadClient(tsarrClient)
      this.handleTsarrResponse(result)

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
          const testResult = await this.client.testDownloadClient(client)

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

    if (!this.capabilities.hasDownloadClients) {
      logger.debug('Download clients not supported for this Servarr type')
      return
    }

    logger.info('Removing download client...', { name })

    try {
      if (!this.client) {
        throw new Error('Client not initialized')
      }
      const result = await this.client.getDownloadClients()
      const clients = this.handleTsarrResponse(result)

      if (!clients) {
        logger.debug('No download clients found')
        return
      }

      const client = clients.find((c) => c.name === name)

      if (!client) {
        logger.debug('Download client not found for removal', { name })
        return
      }

      if (!client.id) {
        throw new Error('Download client ID is required for deletion')
      }

      if (!this.client) {
        throw new Error('Client not initialized')
      }
      const deleteResult = await this.client.deleteDownloadClient(client.id)
      this.handleTsarrResponse(deleteResult)

      logger.info('Download client removed successfully', { name })
    } catch (error) {
      logger.error('Failed to remove download client', { name, error })
      throw error
    }
  }

  async getApplications(): Promise<Application[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasApplications) {
      logger.debug('Applications not supported for this Servarr type')
      return []
    }

    try {
      if (!this.client) {
        throw new Error('Client not initialized')
      }

      if (!this.hasApplications(this.client)) {
        throw new Error('Applications not supported by this client')
      }

      const result = await this.client.getApplications()
      const applications = this.handleTsarrResponse(result)

      if (!applications) {
        return []
      }

      return (applications as unknown[]).map((appUnknown: unknown) => {
        const app = appUnknown as Record<string, unknown>
        return {
          id: app.id as number | undefined,
          name: (app.name as string) || '',
          implementation: (app.implementation as string) || '',
          implementationName: (app.implementationName as string) || '',
          configContract: (app.configContract as string) || '',
          fields:
            (app.fields as { name: string; value: unknown }[])?.map(
              (field: { name: string; value: unknown }) => ({
                name: field.name || '',
                value: field.value as string | number | boolean | number[],
              }),
            ) ?? [],
          enable: (app.enable as boolean) ?? true,
          priority: (app.priority as number) ?? 0,
          syncLevel: 'addOnly' as const,
          tags: (app.tags as number[]) ?? [],
        }
      })
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

      const mappedApp = this.mapToTsarrApplication(application)

      logger.info('Calling tsarr addApplication', {
        appName: mappedApp.name,
        implementation: mappedApp.implementation,
        configContract: mappedApp.configContract,
        fieldsCount: Array.isArray(mappedApp.fields) ? mappedApp.fields.length : 0,
        enable: mappedApp.enable,
        syncLevel: mappedApp.syncLevel,
        tags: mappedApp.tags,
        fullMappedApp: mappedApp,
      })

      const result = await this.client.addApplication(mappedApp)

      logger.info('Tsarr addApplication result', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasError: !!result?.error,
        error: result?.error,
        errorType: typeof result?.error,
        errorKeys:
          result?.error && typeof result?.error === 'object' ? Object.keys(result.error) : [],
        statusCode: result?.response?.status,
        statusText: result?.response?.statusText,
        responseBody: result?.data,
        fullResult: result,
      })

      if (!result) {
        throw new Error('No result from addApplication call')
      }

      if (result.error) {
        const errorMessage =
          result.error instanceof Error
            ? result.error.message
            : typeof result.error === 'string'
              ? result.error
              : JSON.stringify(result.error)
        throw new Error(`Failed to add application: ${errorMessage}`)
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
