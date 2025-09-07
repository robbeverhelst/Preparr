import type { EnvironmentConfig } from './schema'

/**
 * Default configuration values
 * These serve as the base layer for configuration merging
 */
export const defaultConfig: Partial<EnvironmentConfig> = {
  postgres: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '', // Will be required via validation
    database: 'servarr',
  },
  servarr: {
    url: '', // Will be required via validation
    type: 'auto',
    apiKey: undefined,
    adminUser: 'admin',
    adminPassword: '', // Will be required via validation
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

/**
 * Environment variable mapping
 * Maps flat env var names to nested config paths
 */
export const envMapping = {
  // Postgres
  POSTGRES_HOST: 'postgres.host',
  POSTGRES_PORT: 'postgres.port',
  POSTGRES_USER: 'postgres.username',
  POSTGRES_USERNAME: 'postgres.username', // Alternative name
  POSTGRES_PASSWORD: 'postgres.password',
  POSTGRES_DB: 'postgres.database',
  POSTGRES_DATABASE: 'postgres.database', // Alternative name

  // Servarr
  SERVARR_URL: 'servarr.url',
  SERVARR_TYPE: 'servarr.type',
  SERVARR_API_KEY: 'servarr.apiKey',
  SERVARR_ADMIN_USER: 'servarr.adminUser',
  SERVARR_ADMIN_PASSWORD: 'servarr.adminPassword',

  // Services - qBittorrent
  QBITTORRENT_URL: 'services.qbittorrent.url',
  QBITTORRENT_USER: 'services.qbittorrent.username',
  QBITTORRENT_USERNAME: 'services.qbittorrent.username', // Alternative name
  QBITTORRENT_PASSWORD: 'services.qbittorrent.password',

  // Services - Prowlarr
  PROWLARR_URL: 'services.prowlarr.url',
  PROWLARR_API_KEY: 'services.prowlarr.apiKey',

  // Application
  HEALTH_PORT: 'health.port',
  LOG_LEVEL: 'logLevel',
  LOG_FORMAT: 'logFormat',
  CONFIG_PATH: 'configPath',
  CONFIG_WATCH: 'configWatch',
  CONFIG_RECONCILE_INTERVAL: 'configReconcileInterval',
} as const

/**
 * CLI argument mapping
 * Maps CLI flags to nested config paths
 */
export const cliMapping = {
  // Postgres
  'postgres-host': 'postgres.host',
  'postgres-port': 'postgres.port',
  'postgres-user': 'postgres.username',
  'postgres-username': 'postgres.username',
  'postgres-password': 'postgres.password',
  'postgres-db': 'postgres.database',
  'postgres-database': 'postgres.database',

  // Servarr
  'servarr-url': 'servarr.url',
  'servarr-type': 'servarr.type',
  'servarr-api-key': 'servarr.apiKey',
  'servarr-admin-user': 'servarr.adminUser',
  'servarr-admin-password': 'servarr.adminPassword',

  // Services - qBittorrent
  'qbittorrent-url': 'services.qbittorrent.url',
  'qbittorrent-user': 'services.qbittorrent.username',
  'qbittorrent-username': 'services.qbittorrent.username',
  'qbittorrent-password': 'services.qbittorrent.password',

  // Services - Prowlarr
  'prowlarr-url': 'services.prowlarr.url',
  'prowlarr-api-key': 'services.prowlarr.apiKey',

  // Application
  'health-port': 'health.port',
  'log-level': 'logLevel',
  'log-format': 'logFormat',
  'config-path': 'configPath',
  'config-watch': 'configWatch',
  'config-reconcile-interval': 'configReconcileInterval',
} as const

export type EnvKey = keyof typeof envMapping
export type CliKey = keyof typeof cliMapping
