import { describe, expect, test } from 'bun:test'
import {
  cleanConfig,
  createConfigurationSource,
  mergeConfigs,
  validateRequiredFields,
} from './merger'
import type { Config } from './schema'

describe('mergeConfigs', () => {
  test('merges empty configs', () => {
    const result = mergeConfigs({}, {}, {})
    expect(result).toEqual({})
  })

  test('merges single config', () => {
    const config = {
      postgres: {
        host: 'localhost',
        port: 5432,
      },
    }

    const result = mergeConfigs(config)
    expect(result).toEqual(config)
  })

  test('merges multiple configs with override priority', () => {
    const config1 = {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'db1',
      },
      logLevel: 'info',
    }

    const config2 = {
      postgres: {
        host: 'remotehost',
        port: 5433,
        // database is not overridden
      },
      servarr: {
        url: 'http://sonarr:8989',
      },
    }

    const result = mergeConfigs(config1, config2)

    expect(result.postgres?.host).toBe('remotehost') // Overridden
    expect(result.postgres?.port).toBe(5433) // Overridden
    expect(result.postgres?.database).toBe('db1') // Not overridden
    expect(result.logLevel).toBe('info') // From first config
    expect(result.servarr?.url).toBe('http://sonarr:8989') // From second config
  })

  test('handles nested object merging', () => {
    const config1 = {
      services: {
        qbittorrent: {
          url: 'http://qbt:8080',
          username: 'admin',
        },
        prowlarr: {
          url: 'http://prowlarr:9696',
        },
      },
    }

    const config2 = {
      services: {
        qbittorrent: {
          username: 'newuser',
          password: 'newpass',
          // url is not overridden
        },
        // prowlarr is not touched
      },
    }

    const result = mergeConfigs(config1, config2)

    expect(result.services?.qbittorrent?.url).toBe('http://qbt:8080') // Not overridden
    expect(result.services?.qbittorrent?.username).toBe('newuser') // Overridden
    expect(result.services?.qbittorrent?.password).toBe('newpass') // Added
    expect(result.services?.prowlarr?.url).toBe('http://prowlarr:9696') // Preserved
  })

  test('handles array replacement (not merging)', () => {
    const config1 = {
      someArray: ['a', 'b', 'c'],
    }

    const config2 = {
      someArray: ['x', 'y'],
    }

    const result = mergeConfigs(config1, config2)

    expect(result.someArray).toEqual(['x', 'y']) // Completely replaced
  })

  test('ignores null and undefined values', () => {
    const config1 = {
      postgres: {
        host: 'localhost',
        port: 5432,
      },
    }

    const config2 = {
      postgres: {
        host: null,
        database: undefined,
        username: 'user',
      },
    }

    const result = mergeConfigs(config1, config2)

    expect(result.postgres?.host).toBe('localhost') // null ignored
    expect(result.postgres?.port).toBe(5432) // Preserved
    expect(result.postgres?.database).toBeUndefined() // undefined ignored
    expect(result.postgres?.username).toBe('user') // Added
  })

  test('handles null/undefined config objects', () => {
    const config1 = {
      postgres: {
        host: 'localhost',
      },
    }

    const result = mergeConfigs(config1, null, undefined, {
      postgres: {
        port: 5432,
      },
    })

    expect(result.postgres?.host).toBe('localhost')
    expect(result.postgres?.port).toBe(5432)
  })

  test('merges complex nested structures', () => {
    const defaults = {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'servarr',
        ssl: false,
      },
      servarr: {
        type: 'sonarr',
        adminUser: 'admin',
      },
      config: {
        watch: true,
        reconcileInterval: 60,
      },
    }

    const fileConfig = {
      postgres: {
        host: 'db.example.com',
        database: 'production_servarr',
      },
      servarr: {
        url: 'http://sonarr:8989',
        adminPassword: 'filepassword',
      },
      logLevel: 'info',
      logFormat: 'json',
    }

    const envConfig = {
      postgres: {
        password: 'env-secret',
      },
      servarr: {
        adminPassword: 'env-password',
      },
      logLevel: 'debug',
    }

    const cliConfig = {
      logLevel: 'error',
      config: {
        watch: false,
      },
    }

    const result = mergeConfigs(defaults, fileConfig, envConfig, cliConfig)

    // Verify final merge result follows priority: CLI > ENV > FILE > DEFAULTS
    expect(result.postgres?.host).toBe('db.example.com') // From file
    expect(result.postgres?.port).toBe(5432) // From defaults
    expect(result.postgres?.database).toBe('production_servarr') // From file
    expect(result.postgres?.password).toBe('env-secret') // From env
    expect(result.postgres?.ssl).toBe(false) // From defaults

    expect(result.servarr?.type).toBe('sonarr') // From defaults
    expect(result.servarr?.url).toBe('http://sonarr:8989') // From file
    expect(result.servarr?.adminUser).toBe('admin') // From defaults
    expect(result.servarr?.adminPassword).toBe('env-password') // From env (overrides file)

    expect(result.logLevel).toBe('error') // From CLI (highest priority)
    expect(result.logFormat).toBe('json') // From file

    expect(result.config?.watch).toBe(false) // From CLI (overrides defaults)
    expect(result.config?.reconcileInterval).toBe(60) // From defaults
  })
})

describe('cleanConfig', () => {
  test('removes undefined values', () => {
    const config = {
      postgres: {
        host: 'localhost',
        port: undefined,
        database: 'servarr',
      },
      servarr: undefined,
      logLevel: 'info',
    }

    const result = cleanConfig(config)

    expect(result.postgres?.host).toBe('localhost')
    expect(result.postgres?.database).toBe('servarr')
    expect(result.postgres?.port).toBeNull()
    expect(result.servarr).toBeNull()
    expect(result.logLevel).toBe('info')
  })

  test('preserves null values as null', () => {
    const config = {
      postgres: {
        host: null,
        port: 5432,
      },
    }

    const result = cleanConfig(config)

    expect(result.postgres?.host).toBeNull()
    expect(result.postgres?.port).toBe(5432)
  })

  test('handles nested undefined values', () => {
    const config = {
      services: {
        qbittorrent: {
          url: 'http://qbt:8080',
          username: undefined,
          password: 'secret',
        },
        prowlarr: undefined,
      },
    }

    const result = cleanConfig(config)

    expect(result.services?.qbittorrent?.url).toBe('http://qbt:8080')
    expect(result.services?.qbittorrent?.password).toBe('secret')
    expect(result.services?.qbittorrent?.username).toBeNull()
    expect(result.services?.prowlarr).toBeNull()
  })
})

describe('validateRequiredFields', () => {
  test('validates all required fields present', () => {
    const config: Partial<Config> = {
      postgres: {
        password: 'secret',
      },
      servarr: {
        adminPassword: 'admin-secret',
        url: 'http://sonarr:8989',
        type: 'sonarr',
      },
    }

    const errors = validateRequiredFields(config)
    expect(errors).toHaveLength(0)
  })

  test('detects missing postgres password', () => {
    const config: Partial<Config> = {
      servarr: {
        adminPassword: 'admin-secret',
        url: 'http://sonarr:8989',
      },
    }

    const errors = validateRequiredFields(config)
    expect(errors).toContain('postgres.password is required')
  })

  test('detects missing servarr admin password', () => {
    const config: Partial<Config> = {
      postgres: {
        password: 'secret',
      },
      servarr: {
        url: 'http://sonarr:8989',
      },
    }

    const errors = validateRequiredFields(config)
    expect(errors).toContain('servarr.adminPassword is required')
  })

  test('validates servarr URL required when type is not qbittorrent', () => {
    const config: Partial<Config> = {
      postgres: {
        password: 'secret',
      },
      servarr: {
        adminPassword: 'admin-secret',
        type: 'sonarr',
        // url is missing
      },
    }

    const errors = validateRequiredFields(config)
    expect(errors).toContain('servarr.url is required when type is not qbittorrent')
  })

  test('allows missing servarr URL when type is qbittorrent', () => {
    const config: Partial<Config> = {
      postgres: {
        password: 'secret',
      },
      servarr: {
        adminPassword: 'admin-secret',
        type: 'qbittorrent',
        // url is missing but that's OK for qbittorrent
      },
    }

    const errors = validateRequiredFields(config)
    expect(errors).not.toContain('servarr.url is required when type is not qbittorrent')
  })

  test('detects multiple missing fields', () => {
    const config: Partial<Config> = {
      servarr: {
        type: 'sonarr',
        // missing adminPassword and url
      },
      // missing postgres entirely
    }

    const errors = validateRequiredFields(config)
    expect(errors).toContain('postgres.password is required')
    expect(errors).toContain('servarr.adminPassword is required')
    expect(errors).toContain('servarr.url is required when type is not qbittorrent')
    expect(errors.length).toBe(3)
  })

  test('handles missing nested objects', () => {
    const config: Partial<Config> = {}

    const errors = validateRequiredFields(config)
    expect(errors).toContain('postgres.password is required')
    expect(errors).toContain('servarr.adminPassword is required')
  })
})

describe('createConfigurationSource', () => {
  test('creates configuration source structure', () => {
    const defaults = {
      postgres: {
        host: 'localhost',
        port: 5432,
      },
    }

    const fileConfig = {
      postgres: {
        host: 'filehost',
      },
    }

    const envConfig = {
      postgres: {
        password: 'secret',
      },
    }

    const cliConfig = {
      logLevel: 'debug',
    }

    const source = createConfigurationSource(defaults, fileConfig, envConfig, cliConfig)

    expect(source.defaults).toEqual(defaults)
    expect(source.file).toEqual(fileConfig)
    expect(source.environment).toEqual(envConfig)
    expect(source.cli).toEqual(cliConfig)

    // Check merged result
    expect(source.merged.postgres?.host).toBe('filehost')
    expect(source.merged.postgres?.port).toBe(5432)
    expect(source.merged.postgres?.password).toBe('secret')
    expect(source.merged.logLevel).toBe('debug')
  })

  test('handles null file config', () => {
    const defaults = { postgres: { host: 'localhost' } }
    const envConfig = { postgres: { password: 'secret' } }
    const cliConfig = { logLevel: 'debug' }

    const source = createConfigurationSource(defaults, null, envConfig, cliConfig)

    expect(source.defaults).toEqual(defaults)
    expect(source.file).toBeNull()
    expect(source.environment).toEqual(envConfig)
    expect(source.cli).toEqual(cliConfig)
    expect(source.merged.postgres?.host).toBe('localhost')
    expect(source.merged.postgres?.password).toBe('secret')
  })

  test('preserves original objects (no mutation)', () => {
    const defaults = {
      postgres: {
        host: 'localhost',
      },
    }

    const fileConfig = {
      postgres: {
        host: 'filehost',
      },
    }

    const source = createConfigurationSource(defaults, fileConfig, {}, {})

    // Original objects should not be mutated
    expect(defaults.postgres.host).toBe('localhost')
    expect(fileConfig.postgres.host).toBe('filehost')
    expect(source.merged.postgres?.host).toBe('filehost')
  })
})
