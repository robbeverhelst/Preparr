import { env } from 'bun'
import { type Config, ConfigSchema } from './schema'

export function loadEnvironmentConfig(): Config {
  const config = {
    postgres: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT ? Number.parseInt(env.POSTGRES_PORT, 10) : undefined,
      username: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD || '',
      database: env.POSTGRES_DB,
    },
    servarr: {
      url: env.SERVARR_URL || '',
      type: env.SERVARR_TYPE || 'auto',
      apiKey: env.SERVARR_API_KEY || undefined,
      adminUser: env.SERVARR_ADMIN_USER,
      adminPassword: env.SERVARR_ADMIN_PASSWORD || '',
    },
    services: {
      qbittorrent: env.QBITTORRENT_URL
        ? {
            url: env.QBITTORRENT_URL,
            username: env.QBITTORRENT_USER || '',
            password: env.QBITTORRENT_PASSWORD || '',
          }
        : undefined,
      prowlarr: env.PROWLARR_URL
        ? {
            url: env.PROWLARR_URL,
            apiKey: env.PROWLARR_API_KEY,
          }
        : undefined,
    },
    health: {
      port: env.HEALTH_PORT ? Number.parseInt(env.HEALTH_PORT, 10) : undefined,
    },
    logLevel: (env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    logFormat: (env.LOG_FORMAT as 'json' | 'pretty') || 'json',
    configPath: env.CONFIG_PATH,
    configWatch: env.CONFIG_WATCH === 'false' ? false : undefined,
    configReconcileInterval: env.CONFIG_RECONCILE_INTERVAL
      ? Number.parseInt(env.CONFIG_RECONCILE_INTERVAL, 10)
      : undefined,
  }

  return ConfigSchema.parse(config)
}
