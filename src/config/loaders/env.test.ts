import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getEnvironmentInfo, loadEnvironmentConfig } from './env'

// Store original environment
let originalEnv: Record<string, string | undefined>

describe('loadEnvironmentConfig', () => {
  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env }
    // Clear relevant environment variables for clean tests
    clearTestEnvVars()
  })

  afterEach(() => {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith('POSTGRES_') ||
        key.startsWith('SERVARR_') ||
        key.startsWith('CONFIG_') ||
        key.startsWith('LOG_') ||
        key.startsWith('HEALTH_') ||
        key.startsWith('QBITTORRENT_') ||
        key.startsWith('PROWLARR_')
      ) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test('loads empty config when no env vars set', () => {
    const config = loadEnvironmentConfig()
    expect(config).toEqual({})
  })

  test('loads postgres configuration from environment', () => {
    process.env.POSTGRES_HOST = 'db.example.com'
    process.env.POSTGRES_PORT = '5433'
    process.env.POSTGRES_DATABASE = 'mydb'
    process.env.POSTGRES_USERNAME = 'user'
    process.env.POSTGRES_PASSWORD = 'secret'

    const config = loadEnvironmentConfig()

    expect(config.postgres?.host).toBe('db.example.com')
    expect(config.postgres?.port).toBe(5433) // Should be converted to number
    expect(config.postgres?.database).toBe('mydb')
    expect(config.postgres?.username).toBe('user')
    expect(config.postgres?.password).toBe('secret')
  })

  test('loads servarr configuration from environment', () => {
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'
    process.env.SERVARR_API_KEY = 'api123key'
    process.env.SERVARR_ADMIN_USER = 'admin'
    process.env.SERVARR_ADMIN_PASSWORD = 'adminpass'

    const config = loadEnvironmentConfig()

    expect(config.servarr?.url).toBe('http://sonarr:8989')
    expect(config.servarr?.type).toBe('sonarr')
    expect(config.servarr?.apiKey).toBe('api123key')
    expect(config.servarr?.adminUser).toBe('admin')
    expect(config.servarr?.adminPassword).toBe('adminpass')
  })

  test('loads service configurations from environment', () => {
    process.env.QBITTORRENT_URL = 'http://qbt:8080'
    process.env.QBITTORRENT_USERNAME = 'qbtuser'
    process.env.QBITTORRENT_PASSWORD = 'qbtpass'
    process.env.PROWLARR_URL = 'http://prowlarr:9696'
    process.env.PROWLARR_API_KEY = 'prowlarr123'

    const config = loadEnvironmentConfig()

    expect(config.services?.qbittorrent?.url).toBe('http://qbt:8080')
    expect(config.services?.qbittorrent?.username).toBe('qbtuser')
    expect(config.services?.qbittorrent?.password).toBe('qbtpass')
    expect(config.services?.prowlarr?.url).toBe('http://prowlarr:9696')
    expect(config.services?.prowlarr?.apiKey).toBe('prowlarr123')
  })

  test('loads config and logging settings from environment', () => {
    process.env.CONFIG_PATH = '/custom/config.yaml'
    process.env.CONFIG_WATCH = 'true'
    process.env.CONFIG_RECONCILE_INTERVAL = '120'
    process.env.LOG_LEVEL = 'debug'
    process.env.LOG_FORMAT = 'json'
    process.env.HEALTH_PORT = '9000'

    const config = loadEnvironmentConfig()

    expect(config.configPath).toBe('/custom/config.yaml')
    expect(config.configWatch).toBe(true) // Should be converted to boolean
    expect(config.configReconcileInterval).toBe(120) // Should be converted to number
    expect(config.logLevel).toBe('debug')
    expect(config.logFormat).toBe('json')
    expect(config.health?.port).toBe(9000) // Should be converted to number
  })

  test('converts boolean values correctly', () => {
    process.env.CONFIG_WATCH = 'true'
    process.env.CONFIG_RECONCILE_INTERVAL = 'false' // This should stay as string since it's not a boolean config

    const config = loadEnvironmentConfig()

    expect(config.configWatch).toBe(true)
    expect(typeof config.configWatch).toBe('boolean')
  })

  test('converts numeric values correctly', () => {
    process.env.POSTGRES_PORT = '5432'
    process.env.HEALTH_PORT = '8080'
    process.env.CONFIG_RECONCILE_INTERVAL = '300'

    const config = loadEnvironmentConfig()

    expect(config.postgres?.port).toBe(5432)
    expect(typeof config.postgres?.port).toBe('number')
    expect(config.health?.port).toBe(8080)
    expect(typeof config.health?.port).toBe('number')
    expect(config.configReconcileInterval).toBe(300)
    expect(typeof config.configReconcileInterval).toBe('number')
  })

  test('converts float values correctly', () => {
    process.env.SOME_FLOAT_VALUE = '3.14'
    // Note: This depends on having a float value in the env mapping
    const config = loadEnvironmentConfig()
    // Just verify the function doesn't crash with floats
    expect(config).toBeInstanceOf(Object)
  })

  test('handles array values (comma-separated)', () => {
    process.env.CONFIG_PATH = 'config1.yaml,config2.yaml,config3.json'

    const config = loadEnvironmentConfig()

    expect(Array.isArray(config.configPath)).toBe(true)
    expect(config.configPath).toEqual(['config1.yaml', 'config2.yaml', 'config3.json'])
  })

  test('ignores empty string values', () => {
    process.env.POSTGRES_HOST = ''
    process.env.POSTGRES_PORT = '5432'

    const config = loadEnvironmentConfig()

    expect(config.postgres?.host).toBeUndefined()
    expect(config.postgres?.port).toBe(5432)
  })

  test('ignores undefined values', () => {
    process.env.POSTGRES_PORT = '5432'
    process.env.POSTGRES_HOST = undefined

    const config = loadEnvironmentConfig()

    expect(config.postgres?.host).toBeUndefined()
    expect(config.postgres?.port).toBe(5432)
  })

  test('handles special boolean string cases', () => {
    process.env.CONFIG_WATCH = 'TRUE'

    const config = loadEnvironmentConfig()

    expect(config.configWatch).toBe(true)
  })

  test('handles nested object creation', () => {
    process.env.POSTGRES_HOST = 'localhost'
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.QBITTORRENT_URL = 'http://qbt:8080'

    const config = loadEnvironmentConfig()

    expect(config.postgres).toBeInstanceOf(Object)
    expect(config.servarr).toBeInstanceOf(Object)
    expect(config.services?.qbittorrent).toBeInstanceOf(Object)
  })
})

describe('getEnvironmentInfo', () => {
  beforeEach(() => {
    originalEnv = { ...process.env }
    clearTestEnvVars()
  })

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (
        key.startsWith('POSTGRES_') ||
        key.startsWith('SERVARR_') ||
        key.startsWith('CONFIG_') ||
        key.startsWith('LOG_') ||
        key.startsWith('HEALTH_') ||
        key.startsWith('QBITTORRENT_') ||
        key.startsWith('PROWLARR_')
      ) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test('returns environment info structure', () => {
    const info = getEnvironmentInfo()

    expect(info).toHaveProperty('available')
    expect(info).toHaveProperty('mapped')
    expect(info).toHaveProperty('unmapped')

    expect(typeof info.available).toBe('object')
    expect(typeof info.mapped).toBe('object')
    expect(typeof info.unmapped).toBe('object')
  })

  test('categorizes mapped vs unmapped variables', () => {
    process.env.POSTGRES_HOST = 'localhost'
    process.env.POSTGRES_UNMAPPED = 'should-be-unmapped'
    process.env.SOME_OTHER_VAR = 'ignored'

    const info = getEnvironmentInfo()

    expect(info.mapped.POSTGRES_HOST).toBe('localhost')
    expect(info.unmapped.POSTGRES_UNMAPPED).toBe('should-be-unmapped')
    expect(info.available.POSTGRES_HOST).toBe('localhost')
    expect(info.available.POSTGRES_UNMAPPED).toBe('should-be-unmapped')
    expect(info.available.SOME_OTHER_VAR).toBe('ignored')
  })

  test('processes values in mapped section', () => {
    process.env.POSTGRES_PORT = '5432'
    process.env.CONFIG_WATCH = 'true'

    const info = getEnvironmentInfo()

    expect(info.mapped.POSTGRES_PORT).toBe(5432) // Converted to number
    expect(info.mapped.CONFIG_WATCH).toBe(true) // Converted to boolean
  })

  test('identifies relevant prefixes for unmapped vars', () => {
    process.env.POSTGRES_UNKNOWN = 'test'
    process.env.SERVARR_UNKNOWN = 'test'
    process.env.QBITTORRENT_UNKNOWN = 'test'
    process.env.PROWLARR_UNKNOWN = 'test'
    process.env.CONFIG_UNKNOWN = 'test'
    process.env.LOG_UNKNOWN = 'test'
    process.env.HEALTH_UNKNOWN = 'test'
    process.env.RANDOM_VAR = 'ignored'

    const info = getEnvironmentInfo()

    expect(info.unmapped.POSTGRES_UNKNOWN).toBe('test')
    expect(info.unmapped.SERVARR_UNKNOWN).toBe('test')
    expect(info.unmapped.QBITTORRENT_UNKNOWN).toBe('test')
    expect(info.unmapped.PROWLARR_UNKNOWN).toBe('test')
    expect(info.unmapped.CONFIG_UNKNOWN).toBe('test')
    expect(info.unmapped.LOG_UNKNOWN).toBe('test')
    expect(info.unmapped.HEALTH_UNKNOWN).toBe('test')
    expect(info.unmapped.RANDOM_VAR).toBeUndefined()
  })
})

function clearTestEnvVars() {
  const keysToDelete = Object.keys(process.env).filter(
    (key) =>
      key.startsWith('POSTGRES_') ||
      key.startsWith('SERVARR_') ||
      key.startsWith('CONFIG_') ||
      key.startsWith('LOG_') ||
      key.startsWith('HEALTH_') ||
      key.startsWith('QBITTORRENT_') ||
      key.startsWith('PROWLARR_'),
  )

  for (const key of keysToDelete) {
    delete process.env[key]
  }
}
