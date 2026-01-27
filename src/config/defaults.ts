import type { Config } from './schema'
export const defaultConfig: Partial<Config> = {
  postgres: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '', // Will be required via validation
    database: 'servarr',
    skipProvisioning: false,
  },
  servarr: {
    url: '', // Will be required via validation
    type: 'auto',
    apiKey: undefined,
    adminUser: 'admin',
    adminPassword: '', // Will be required via validation
    authenticationMethod: 'forms',
  },
  services: {
    qbittorrent: undefined,
    prowlarr: undefined,
  },
  health: {
    port: 8080,
  },
  logLevel: 'info',
  logFormat: 'json',
  configPath: '/config/servarr.yaml',
  configWatch: true,
  configReconcileInterval: 60,
}

export const envMapping = {
  POSTGRES_HOST: 'postgres.host',
  POSTGRES_PORT: 'postgres.port',
  POSTGRES_USER: 'postgres.username',
  POSTGRES_USERNAME: 'postgres.username', // Alternative name
  POSTGRES_PASSWORD: 'postgres.password',
  POSTGRES_DB: 'postgres.database',
  POSTGRES_DATABASE: 'postgres.database', // Alternative name
  POSTGRES_SKIP_PROVISIONING: 'postgres.skipProvisioning',

  SERVARR_URL: 'servarr.url',
  SERVARR_TYPE: 'servarr.type',
  SERVARR_API_KEY: 'servarr.apiKey',
  SERVARR_ADMIN_USER: 'servarr.adminUser',
  SERVARR_ADMIN_PASSWORD: 'servarr.adminPassword',
  SERVARR_AUTHENTICATION_METHOD: 'servarr.authenticationMethod',

  QBITTORRENT_URL: 'services.qbittorrent.url',
  QBITTORRENT_USER: 'services.qbittorrent.username',
  QBITTORRENT_USERNAME: 'services.qbittorrent.username', // Alternative name
  QBITTORRENT_PASSWORD: 'services.qbittorrent.password',

  PROWLARR_URL: 'services.prowlarr.url',
  PROWLARR_API_KEY: 'services.prowlarr.apiKey',

  APP_API_KEY: 'app.apiKey',
  APP_PROWLARR_SYNC: 'app.prowlarrSync',
  APP_ROOT_FOLDERS: 'app.rootFolders',
  APP_INDEXERS: 'app.indexers',
  APP_DOWNLOAD_CLIENTS: 'app.downloadClients',
  APP_QUALITY_PROFILES: 'app.qualityProfiles',
  APP_APPLICATIONS: 'app.applications',
  APP_QBITTORRENT: 'app.qbittorrent',

  HEALTH_PORT: 'health.port',
  LOG_LEVEL: 'logLevel',
  LOG_FORMAT: 'logFormat',
  CONFIG_PATH: 'configPath',
  CONFIG_WATCH: 'configWatch',
  CONFIG_RECONCILE_INTERVAL: 'configReconcileInterval',
} as const

export const cliMapping = {
  'postgres-host': 'postgres.host',
  'postgres-port': 'postgres.port',
  'postgres-user': 'postgres.username',
  'postgres-username': 'postgres.username',
  'postgres-password': 'postgres.password',
  'postgres-db': 'postgres.database',
  'postgres-database': 'postgres.database',

  'servarr-url': 'servarr.url',
  'servarr-type': 'servarr.type',
  'servarr-api-key': 'servarr.apiKey',
  'servarr-admin-user': 'servarr.adminUser',
  'servarr-admin-password': 'servarr.adminPassword',

  'qbittorrent-url': 'services.qbittorrent.url',
  'qbittorrent-user': 'services.qbittorrent.username',
  'qbittorrent-username': 'services.qbittorrent.username',
  'qbittorrent-password': 'services.qbittorrent.password',

  'prowlarr-url': 'services.prowlarr.url',
  'prowlarr-api-key': 'services.prowlarr.apiKey',

  'app-api-key': 'app.apiKey',
  'app-prowlarr-sync': 'app.prowlarrSync',
  'app-root-folders': 'app.rootFolders',
  'app-indexers': 'app.indexers',
  'app-download-clients': 'app.downloadClients',
  'app-quality-profiles': 'app.qualityProfiles',
  'app-applications': 'app.applications',
  'app-qbittorrent': 'app.qbittorrent',

  'health-port': 'health.port',
  'log-level': 'logLevel',
  'log-format': 'logFormat',
  'config-path': 'configPath',
  'config-watch': 'configWatch',
  'config-reconcile-interval': 'configReconcileInterval',
} as const

export type EnvKey = keyof typeof envMapping
export type CliKey = keyof typeof cliMapping
