import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { loadEnvironmentConfig } from './env'

describe('Environment Configuration', () => {
  const originalEnv = { ...Bun.env }

  beforeEach(() => {
    // Clear environment variables
    for (const key in Bun.env) {
      delete Bun.env[key]
    }
    // Set required URL for tests
    Bun.env.SERVARR_URL = 'http://localhost:8989'
  })

  afterEach(() => {
    // Restore original environment
    for (const key in Bun.env) {
      delete Bun.env[key]
    }
    Object.assign(Bun.env, originalEnv)
  })

  test('loads default configuration', () => {
    // Set minimum required values
    Bun.env.POSTGRES_PASSWORD = 'postgres'
    Bun.env.SERVARR_ADMIN_PASSWORD = 'admin'

    const config = loadEnvironmentConfig()

    expect(config.postgres.host).toBe('localhost')
    expect(config.postgres.port).toBe(5432)
    expect(config.postgres.username).toBe('postgres')
    expect(config.postgres.password).toBe('postgres')
    expect(config.postgres.database).toBe('servarr')

    expect(config.servarr.url).toBe('http://localhost:8989')
    expect(config.servarr.type).toBe('sonarr')
    expect(config.servarr.adminUser).toBe('admin')
    expect(config.servarr.adminPassword).toBe('admin')

    expect(config.health.port).toBe(8080)
    expect(config.configPath).toBe('/config/servarr.yaml')
    expect(config.configWatch).toBe(true)
    expect(config.configReconcileInterval).toBe(60)
    expect(config.logLevel).toBe('info')
    expect(config.logFormat).toBe('json')
  })

  test('loads custom PostgreSQL configuration', () => {
    Bun.env.POSTGRES_HOST = 'db.example.com'
    Bun.env.POSTGRES_PORT = '5433'
    Bun.env.POSTGRES_USER = 'custom_user'
    Bun.env.POSTGRES_PASSWORD = 'secret_password'
    Bun.env.POSTGRES_DB = 'custom_db'

    const config = loadEnvironmentConfig()

    expect(config.postgres.host).toBe('db.example.com')
    expect(config.postgres.port).toBe(5433)
    expect(config.postgres.username).toBe('custom_user')
    expect(config.postgres.password).toBe('secret_password')
    expect(config.postgres.database).toBe('custom_db')
  })

  test('loads custom Servarr configuration', () => {
    Bun.env.SERVARR_URL = 'http://radarr:7878'
    Bun.env.SERVARR_TYPE = 'radarr'
    Bun.env.SERVARR_ADMIN_USER = 'superadmin'
    Bun.env.SERVARR_ADMIN_PASSWORD = 'superpassword'

    const config = loadEnvironmentConfig()

    expect(config.servarr.url).toBe('http://radarr:7878')
    expect(config.servarr.type).toBe('radarr')
    expect(config.servarr.adminUser).toBe('superadmin')
    expect(config.servarr.adminPassword).toBe('superpassword')
  })

  test('validates Servarr type', () => {
    Bun.env.SERVARR_TYPE = 'invalid'

    expect(() => loadEnvironmentConfig()).toThrow()
  })

  test('handles boolean environment variables', () => {
    Bun.env.CONFIG_WATCH = 'false'

    const config = loadEnvironmentConfig()
    expect(config.configWatch).toBe(false)

    Bun.env.CONFIG_WATCH = 'true'
    const config2 = loadEnvironmentConfig()
    expect(config2.configWatch).toBe(true)
  })

  test('handles numeric environment variables', () => {
    Bun.env.HEALTH_PORT = '9090'
    Bun.env.CONFIG_RECONCILE_INTERVAL = '120'
    Bun.env.POSTGRES_PASSWORD = 'test' // Required field
    Bun.env.SERVARR_ADMIN_PASSWORD = 'admin' // Required field

    const config = loadEnvironmentConfig()

    expect(config.health.port).toBe(9090)
    expect(config.configReconcileInterval).toBe(120)
  })

  test('validates log level', () => {
    Bun.env.LOG_LEVEL = 'debug'
    const config = loadEnvironmentConfig()
    expect(config.logLevel).toBe('debug')

    Bun.env.LOG_LEVEL = 'invalid'
    expect(() => loadEnvironmentConfig()).toThrow()
  })

  test('validates log format', () => {
    Bun.env.LOG_FORMAT = 'pretty'
    const config = loadEnvironmentConfig()
    expect(config.logFormat).toBe('pretty')

    Bun.env.LOG_FORMAT = 'invalid'
    expect(() => loadEnvironmentConfig()).toThrow()
  })
})
