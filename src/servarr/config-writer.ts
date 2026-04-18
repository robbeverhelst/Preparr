import { file, write } from 'bun'
import type { ServarrConfig } from '@/config/schema'
import { logger } from '@/utils/logger'

export class ConfigXmlWriter {
  private config: ServarrConfig
  private configPath: string
  private logDatabaseEnabled: boolean

  constructor(config: ServarrConfig, configPath: string, logDatabaseEnabled: boolean) {
    this.config = config
    this.configPath = configPath
    this.logDatabaseEnabled = logDatabaseEnabled
  }

  getDatabaseNames(): { main: string; log?: string } {
    return {
      main: `${this.config.type}_main`,
      ...(this.logDatabaseEnabled ? { log: `${this.config.type}_log` } : {}),
    }
  }

  async readExistingApiKey(): Promise<string | null> {
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
      logger.debug('Could not read existing config.xml', { error, path: this.configPath })
    }
    return null
  }

  async writeConfigXml(apiKey: string, servarrConfigApiKey?: string): Promise<boolean> {
    // Priority for API key:
    // 1. API key from loaded servarr configuration (JSON file)
    // 2. API key from servarr config (environment)
    let selectedApiKey: string

    if (servarrConfigApiKey) {
      selectedApiKey = servarrConfigApiKey
      logger.info('Using API key from loaded configuration file', {
        apiKey: `${selectedApiKey.slice(0, 8)}...`,
      })
    } else if (apiKey) {
      selectedApiKey = apiKey
      logger.info('Using API key from environment config', {
        apiKey: `${selectedApiKey.slice(0, 8)}...`,
      })
    } else {
      throw new Error(
        'API key is required. Please provide an API key in the configuration file or environment.',
      )
    }

    // Check if existing config.xml has the same API key
    const existingApiKey = await this.readExistingApiKey()
    const isApiKeyChanged = !existingApiKey || existingApiKey !== selectedApiKey

    if (isApiKeyChanged) {
      logger.info('API key changed or missing in config.xml, will update', {
        hadExisting: !!existingApiKey,
        existingKey: existingApiKey ? `${existingApiKey.slice(0, 8)}...` : 'none',
        newKey: `${selectedApiKey.slice(0, 8)}...`,
      })
    }

    logger.info('Writing Servarr config.xml...', {
      type: this.config.type,
      configPath: this.configPath,
      apiKey: `${selectedApiKey.slice(0, 8)}...`,
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
    const databases = this.getDatabaseNames()
    const postgresLogDb = this.logDatabaseEnabled
      ? `
  <PostgresLogDb>${databases.log}</PostgresLogDb>`
      : ''
    const logDbEnabled = this.logDatabaseEnabled ? 'True' : 'False'

    const configXml = `<Config>
  <BindAddress>*</BindAddress>
  <Port>${port}</Port>
  <SslPort>${port + 1000}</SslPort>
  <EnableSsl>False</EnableSsl>
  <LaunchBrowser>False</LaunchBrowser>
  <ApiKey>${selectedApiKey}</ApiKey>
  <AuthenticationMethod>${authenticationMethod}</AuthenticationMethod>
  <AuthenticationRequired>Enabled</AuthenticationRequired>
  <Branch>main</Branch>
  <LogLevel>info</LogLevel>
  <LogDbEnabled>${logDbEnabled}</LogDbEnabled>
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
  <PostgresMainDb>${databases.main}</PostgresMainDb>${postgresLogDb}
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
          apiKey: `${selectedApiKey.slice(0, 8)}...`,
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
}
