import type { Sonarr } from 'tsarr'
import type {
  Application,
  CustomFormat,
  DownloadClient,
  Indexer,
  MediaManagementConfig,
  NamingConfig,
  PostgresConfig,
  QualityDefinition,
  ReleaseProfile,
  RootFolder,
  ServarrConfig,
} from '@/config/schema'
import { logger } from '@/utils/logger'
import { withRetry } from '@/utils/retry'
import { ServarrApiClient } from './api-client'
import { ConfigXmlWriter } from './config-writer'
import type {
  ClientCapabilities,
  ClientWithApplications,
  ClientWithDownloadClients,
  ClientWithIndexers,
  ClientWithRootFolders,
  DownloadClientResource,
  IndexerResource,
  ServarrClientType,
} from './types'
import { ServarrUserManager } from './user-manager'

export class ServarrManager {
  private client: ServarrClientType | null = null
  private config: ServarrConfig
  private apiKey: string | null = null
  private isInitialized = false
  private configPath: string
  private capabilities: ClientCapabilities
  private logDatabaseEnabled: boolean

  // Delegate modules
  private configWriter: ConfigXmlWriter
  private apiClient: ServarrApiClient
  private userManager: ServarrUserManager

  constructor(
    config: ServarrConfig,
    options?: { configPath?: string; logDatabaseEnabled?: boolean },
  ) {
    this.config = config
    this.configPath = options?.configPath || process.env.SERVARR_CONFIG_PATH || '/config/config.xml'
    this.capabilities = this.getClientCapabilities()
    this.logDatabaseEnabled = options?.logDatabaseEnabled ?? true

    this.configWriter = new ConfigXmlWriter(config, this.configPath, this.logDatabaseEnabled)
    this.apiClient = new ServarrApiClient(config)
    this.userManager = new ServarrUserManager(config, this.logDatabaseEnabled)
  }

  private getClientCapabilities(): ClientCapabilities {
    const type = this.config.type
    return {
      hasRootFolders: type !== 'prowlarr' && type !== 'qbittorrent',
      hasDownloadClients: type !== 'qbittorrent',
      hasApplications: type === 'prowlarr',
      hasQualityProfiles: type !== 'prowlarr' && type !== 'qbittorrent',
      hasCustomFormats: type === 'sonarr' || type === 'radarr',
      hasReleaseProfiles: type === 'sonarr',
      hasNamingConfig: type !== 'prowlarr' && type !== 'qbittorrent',
      hasMediaManagement: type !== 'prowlarr' && type !== 'qbittorrent',
      hasQualityDefinitions: type !== 'prowlarr' && type !== 'qbittorrent',
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

  // Note: hasHostConfig is used by userManager.configureDatabase internally

  // --- Delegated methods ---

  async detectType(): Promise<string> {
    if (this.config.type !== 'auto') {
      return this.config.type
    }

    await this.apiClient.waitForStartup(this.apiKey || '')
    return await this.apiClient.detectServarrType()
  }

  async writeConfigurationOnly(servarrConfigApiKey?: string): Promise<void> {
    logger.info('Writing Servarr configuration only (init mode)...')

    if (this.config.type === 'auto') {
      throw new Error(
        'SERVARR_TYPE must be explicitly set in init mode, cannot auto-detect when service is not running',
      )
    }

    const apiKey = servarrConfigApiKey || this.config.apiKey || ''
    this.apiKey = apiKey
    await this.configWriter.writeConfigXml(apiKey, servarrConfigApiKey)
    logger.info('Configuration writing completed', { type: this.config.type })
  }

  async initializeSidecarMode(): Promise<void> {
    logger.info('Initializing ServarrManager for sidecar mode...', { type: this.config.type })

    const existingApiKey = await this.configWriter.readExistingApiKey()
    if (!existingApiKey) {
      throw new Error('No API key found in config.xml - init container may have failed')
    }

    this.apiKey = existingApiKey
    logger.info('Using API key from config', { apiKey: `${this.apiKey.slice(0, 8)}...` })

    await withRetry(() => this.apiClient.waitForStartup(this.apiKey || ''), {
      maxAttempts: 3,
      delayMs: 5000,
      operation: 'servarr-service-startup',
    })

    logger.info('Waiting for Servarr to initialize database tables...')
    let tablesReady = false
    for (let i = 0; i < 15; i++) {
      try {
        tablesReady = await this.userManager.checkServarrTablesInitialized()
        if (tablesReady) break
      } catch (error) {
        logger.debug('Table check failed', { attempt: i + 1, error })
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    if (!tablesReady) {
      throw new Error('Servarr failed to initialize database tables')
    }

    this.client = this.apiClient.createClient(this.apiKey)
    this.isInitialized = true

    if (this.config.adminPassword) {
      await this.userManager.createInitialUser()
    }

    logger.info('ServarrManager sidecar initialization completed', { type: this.config.type })
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('ServarrManager already initialized')
      return
    }

    if (this.config.type === 'auto') {
      await this.apiClient.waitForStartup(this.apiKey || '')
      const detectedType = await this.apiClient.detectServarrType()
      const validTypes = ['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr'] as const

      if (!validTypes.includes(detectedType as (typeof validTypes)[number])) {
        throw new Error(`Unsupported Servarr type detected: ${detectedType}`)
      }

      this.config = {
        ...this.config,
        type: detectedType as (typeof validTypes)[number],
      }
      this.apiClient.updateConfig(this.config)
    }

    // writeConfigXml needs apiKey set; derive it first
    const selectedApiKey = this.config.apiKey
    if (!selectedApiKey) {
      throw new Error(
        'API key is required. Please provide an API key in the configuration file or environment.',
      )
    }
    this.apiKey = selectedApiKey

    const configChanged = await this.configWriter.writeConfigXml(this.apiKey)

    const isInitMode = process.argv.includes('--init')
    if (!isInitMode) {
      await this.apiClient.waitForStartup(this.apiKey)

      if (configChanged) {
        await this.apiClient.restartToApplyConfig(this.client)
        await this.apiClient.waitForStartup(this.apiKey)
      }
    }

    try {
      if (!this.apiKey) {
        throw new Error('API key is required but not available')
      }
      this.client = this.apiClient.createClient(this.apiKey)

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
          methods: methods.slice(0, 20),
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

  // --- Delegated to userManager ---

  verifyPostgreSQLConnection(): Promise<boolean> {
    return this.userManager.verifyPostgreSQLConnection()
  }

  checkServarrTablesInitialized(): Promise<boolean> {
    return this.userManager.checkServarrTablesInitialized()
  }

  createInitialUser(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ServarrManager must be initialized before creating user')
    }
    return this.userManager.createInitialUser()
  }

  createInitialUserInInitMode(): Promise<void> {
    return this.userManager.createInitialUserInInitMode()
  }

  async configureDatabase(postgresConfig: PostgresConfig): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager must be initialized before configuring database')
    }

    await this.userManager.configureDatabase(postgresConfig, this.client, this.apiKey)
    // After restart, wait for startup
    await this.apiClient.waitForStartup(this.apiKey)
  }

  // --- Delegated to apiClient ---

  testConnection(): Promise<boolean> {
    return this.apiClient.testConnection(this.client, this.apiKey, this.isInitialized)
  }

  // --- Public accessors ---

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

  getCapabilities(): ClientCapabilities {
    return this.capabilities
  }

  // --- Resource CRUD methods (use internal client + handleTsarrResponse) ---

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
      this.handleTsarrResponse(result)

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
      this.handleTsarrResponse(result)

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

  // Helper method for direct API calls
  private async fetchApi<T>(
    endpoint: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('API key not available')
    }

    const url = `${this.config.url}/api/v3${endpoint}`
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    // Handle empty responses (e.g., DELETE requests)
    const text = await response.text()
    if (!text) {
      return undefined as T
    }

    return JSON.parse(text) as T
  }

  // ============================================
  // Custom Formats (Radarr/Sonarr v4+)
  // ============================================

  async getCustomFormats(): Promise<CustomFormat[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasCustomFormats) {
      logger.debug('Custom formats not supported for this Servarr type')
      return []
    }

    try {
      const formats = await this.fetchApi<CustomFormat[]>('/customformat')
      return formats || []
    } catch (error) {
      logger.error('Failed to get custom formats', { error })
      throw error
    }
  }

  async addCustomFormat(customFormat: CustomFormat): Promise<CustomFormat> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasCustomFormats) {
      throw new Error('Custom formats not supported for this Servarr type')
    }

    logger.info('Adding custom format...', { name: customFormat.name })

    try {
      const result = await this.fetchApi<CustomFormat>('/customformat', {
        method: 'POST',
        body: customFormat,
      })

      logger.info('Custom format added successfully', { name: customFormat.name, id: result.id })
      return result
    } catch (error) {
      logger.error('Failed to add custom format', { name: customFormat.name, error })
      throw error
    }
  }

  async updateCustomFormat(id: number, customFormat: CustomFormat): Promise<CustomFormat> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasCustomFormats) {
      throw new Error('Custom formats not supported for this Servarr type')
    }

    logger.info('Updating custom format...', { id, name: customFormat.name })

    try {
      const result = await this.fetchApi<CustomFormat>(`/customformat/${id}`, {
        method: 'PUT',
        body: { ...customFormat, id },
      })

      logger.info('Custom format updated successfully', { name: customFormat.name, id })
      return result
    } catch (error) {
      logger.error('Failed to update custom format', { id, name: customFormat.name, error })
      throw error
    }
  }

  async deleteCustomFormat(id: number): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasCustomFormats) {
      throw new Error('Custom formats not supported for this Servarr type')
    }

    logger.info('Deleting custom format...', { id })

    try {
      await this.fetchApi(`/customformat/${id}`, { method: 'DELETE' })
      logger.info('Custom format deleted successfully', { id })
    } catch (error) {
      logger.error('Failed to delete custom format', { id, error })
      throw error
    }
  }

  // ============================================
  // Release Profiles (Sonarr only)
  // ============================================

  async getReleaseProfiles(): Promise<ReleaseProfile[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasReleaseProfiles) {
      logger.debug('Release profiles not supported for this Servarr type')
      return []
    }

    try {
      const profiles = await this.fetchApi<ReleaseProfile[]>('/releaseprofile')
      return profiles || []
    } catch (error) {
      logger.error('Failed to get release profiles', { error })
      throw error
    }
  }

  async addReleaseProfile(releaseProfile: ReleaseProfile): Promise<ReleaseProfile> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasReleaseProfiles) {
      throw new Error('Release profiles not supported for this Servarr type')
    }

    logger.info('Adding release profile...', { name: releaseProfile.name })

    try {
      const result = await this.fetchApi<ReleaseProfile>('/releaseprofile', {
        method: 'POST',
        body: releaseProfile,
      })

      logger.info('Release profile added successfully', {
        name: releaseProfile.name,
        id: result.id,
      })
      return result
    } catch (error) {
      logger.error('Failed to add release profile', { name: releaseProfile.name, error })
      throw error
    }
  }

  async updateReleaseProfile(id: number, releaseProfile: ReleaseProfile): Promise<ReleaseProfile> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasReleaseProfiles) {
      throw new Error('Release profiles not supported for this Servarr type')
    }

    logger.info('Updating release profile...', { id, name: releaseProfile.name })

    try {
      const result = await this.fetchApi<ReleaseProfile>(`/releaseprofile/${id}`, {
        method: 'PUT',
        body: { ...releaseProfile, id },
      })

      logger.info('Release profile updated successfully', { name: releaseProfile.name, id })
      return result
    } catch (error) {
      logger.error('Failed to update release profile', { id, name: releaseProfile.name, error })
      throw error
    }
  }

  async deleteReleaseProfile(id: number): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasReleaseProfiles) {
      throw new Error('Release profiles not supported for this Servarr type')
    }

    logger.info('Deleting release profile...', { id })

    try {
      await this.fetchApi(`/releaseprofile/${id}`, { method: 'DELETE' })
      logger.info('Release profile deleted successfully', { id })
    } catch (error) {
      logger.error('Failed to delete release profile', { id, error })
      throw error
    }
  }

  // ============================================
  // Naming Configuration
  // ============================================

  async getNamingConfig(): Promise<NamingConfig | null> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasNamingConfig) {
      logger.debug('Naming config not supported for this Servarr type')
      return null
    }

    try {
      const config = await this.fetchApi<NamingConfig>('/config/naming')
      return config
    } catch (error) {
      logger.error('Failed to get naming config', { error })
      throw error
    }
  }

  async updateNamingConfig(namingConfig: Partial<NamingConfig>): Promise<NamingConfig> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasNamingConfig) {
      throw new Error('Naming config not supported for this Servarr type')
    }

    logger.info('Updating naming config...')

    try {
      const current = await this.getNamingConfig()
      const merged = { ...current, ...namingConfig, id: 1 }

      const result = await this.fetchApi<NamingConfig>('/config/naming/1', {
        method: 'PUT',
        body: merged,
      })

      logger.info('Naming config updated successfully')
      return result
    } catch (error) {
      logger.error('Failed to update naming config', { error })
      throw error
    }
  }

  // ============================================
  // Media Management Configuration
  // ============================================

  async getMediaManagementConfig(): Promise<MediaManagementConfig | null> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasMediaManagement) {
      logger.debug('Media management config not supported for this Servarr type')
      return null
    }

    try {
      const config = await this.fetchApi<MediaManagementConfig>('/config/mediamanagement')
      return config
    } catch (error) {
      logger.error('Failed to get media management config', { error })
      throw error
    }
  }

  async updateMediaManagementConfig(
    mediaConfig: Partial<MediaManagementConfig>,
  ): Promise<MediaManagementConfig> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasMediaManagement) {
      throw new Error('Media management config not supported for this Servarr type')
    }

    logger.info('Updating media management config...')

    try {
      const current = await this.getMediaManagementConfig()
      const merged = { ...current, ...mediaConfig, id: 1 }

      const result = await this.fetchApi<MediaManagementConfig>('/config/mediamanagement/1', {
        method: 'PUT',
        body: merged,
      })

      logger.info('Media management config updated successfully')
      return result
    } catch (error) {
      logger.error('Failed to update media management config', { error })
      throw error
    }
  }

  // ============================================
  // Quality Definitions
  // ============================================

  async getQualityDefinitions(): Promise<QualityDefinition[]> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasQualityDefinitions) {
      logger.debug('Quality definitions not supported for this Servarr type')
      return []
    }

    try {
      interface ApiQualityDefinition {
        id: number
        quality: { id: number; name: string }
        title: string
        minSize: number
        maxSize: number
        preferredSize: number
      }

      const definitions = await this.fetchApi<ApiQualityDefinition[]>('/qualitydefinition')

      return (definitions || []).map((def) => ({
        quality: def.quality?.name || '',
        title: def.title,
        minSize: def.minSize,
        maxSize: def.maxSize,
        preferredSize: def.preferredSize,
      }))
    } catch (error) {
      logger.error('Failed to get quality definitions', { error })
      throw error
    }
  }

  async updateQualityDefinition(
    qualityName: string,
    updates: Partial<QualityDefinition>,
  ): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasQualityDefinitions) {
      throw new Error('Quality definitions not supported for this Servarr type')
    }

    logger.info('Updating quality definition...', { qualityName })

    try {
      interface ApiQualityDefinition {
        id: number
        quality: { id: number; name: string }
        title: string
        minSize: number
        maxSize: number
        preferredSize: number
      }

      const definitions = await this.fetchApi<ApiQualityDefinition[]>('/qualitydefinition')
      const definition = definitions?.find(
        (def) => def.quality?.name?.toLowerCase() === qualityName.toLowerCase(),
      )

      if (!definition) {
        throw new Error(`Quality definition not found: ${qualityName}`)
      }

      const updated = {
        ...definition,
        minSize: updates.minSize ?? definition.minSize,
        maxSize: updates.maxSize ?? definition.maxSize,
        preferredSize: updates.preferredSize ?? definition.preferredSize,
      }

      await this.fetchApi(`/qualitydefinition/${definition.id}`, {
        method: 'PUT',
        body: updated,
      })

      logger.info('Quality definition updated successfully', { qualityName })
    } catch (error) {
      logger.error('Failed to update quality definition', { qualityName, error })
      throw error
    }
  }

  async updateQualityDefinitions(definitions: QualityDefinition[]): Promise<void> {
    if (!this.isInitialized || !this.apiKey) {
      throw new Error('ServarrManager not initialized')
    }

    if (!this.capabilities.hasQualityDefinitions) {
      throw new Error('Quality definitions not supported for this Servarr type')
    }

    logger.info('Updating quality definitions...', { count: definitions.length })

    for (const def of definitions) {
      await this.updateQualityDefinition(def.quality, def)
    }

    logger.info('Quality definitions updated successfully', { count: definitions.length })
  }
}
