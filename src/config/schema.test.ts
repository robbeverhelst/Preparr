import { describe, expect, test } from 'bun:test'
import { AppConfigSchema, ConfigSchema, ServarrConfigSchema } from './schema'

describe('Configuration Schema Validation', () => {
  test('validates valid servarr application config', () => {
    const validConfig = {
      apiKey: 'abcd1234567890abcd1234567890abcd',
      rootFolders: [{ path: '/tv', accessible: true, unmappedFolders: [] }],
      indexers: [],
      downloadClients: [
        {
          name: 'qBittorrent',
          implementation: 'QBittorrent',
          implementationName: 'qBittorrent',
          configContract: 'QBittorrentSettings',
          fields: [
            { name: 'host', value: 'qbittorrent' },
            { name: 'port', value: 8080 },
          ],
        },
      ],
      qualityProfiles: [],
      applications: [],
    }

    const result = AppConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  test('validates servarr config with different types', () => {
    const configs = [
      { type: 'sonarr', url: 'http://sonarr:8989', adminPassword: 'pass' },
      { type: 'radarr', url: 'http://radarr:7878', adminPassword: 'pass' },
      { type: 'prowlarr', url: 'http://prowlarr:9696', adminPassword: 'pass' },
      { type: 'qbittorrent', adminPassword: 'pass' }, // No URL required for qbittorrent
    ]

    for (const config of configs) {
      const result = ServarrConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
    }
  })

  test('rejects invalid servarr config', () => {
    const invalidConfigs = [
      { type: 'sonarr', adminPassword: 'pass' }, // Missing required URL
      { type: 'invalid', url: 'http://test', adminPassword: 'pass' }, // Invalid type
      { type: 'sonarr', url: 'not-a-url', adminPassword: 'pass' }, // Invalid URL
      { type: 'sonarr', url: 'http://sonarr:8989', apiKey: 'short' }, // Invalid API key
    ]

    for (const config of invalidConfigs) {
      const result = ServarrConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    }
  })

  test('validates complete environment config', () => {
    const validEnvConfig = {
      postgres: {
        host: 'postgres',
        port: 5432,
        username: 'postgres',
        password: 'secret',
        database: 'servarr',
      },
      servarr: {
        type: 'sonarr',
        url: 'http://sonarr:8989',
        adminPassword: 'password',
      },
      health: {
        port: 8080,
      },
      logLevel: 'info',
      configPath: '/config/servarr.yaml',
      configWatch: true,
      configReconcileInterval: 60,
    }

    const result = ConfigSchema.safeParse(validEnvConfig)
    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.health.port).toBe(8080)
      expect(result.data.logLevel).toBe('info')
      expect(result.data.configReconcileInterval).toBe(60)
    }
  })

  test('applies default values correctly', () => {
    const minimalConfig = {
      postgres: {
        password: 'secret',
      },
      servarr: {
        type: 'sonarr',
        url: 'http://sonarr:8989',
        adminPassword: 'password',
      },
    }

    const result = ConfigSchema.safeParse(minimalConfig)
    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data.postgres.host).toBe('localhost') // Default
      expect(result.data.postgres.port).toBe(5432) // Default
      expect(result.data.health.port).toBe(8080) // Default
      expect(result.data.logLevel).toBe('info') // Default
      expect(result.data.configWatch).toBe(true) // Default
      expect(result.data.servarr.authenticationMethod).toBe('forms') // Default
    }
  })
})
