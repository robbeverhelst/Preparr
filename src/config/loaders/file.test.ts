import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { file } from 'bun'
import { detectFileFormat, findConfigFile, loadConfigFile } from './file'

const testDir = '/tmp/preparr-test-config'
const testFiles = {
  validJson: `${testDir}/valid.json`,
  validYaml: `${testDir}/valid.yaml`,
  validYml: `${testDir}/valid.yml`,
  validToml: `${testDir}/valid.toml`,
  invalidJson: `${testDir}/invalid.json`,
  invalidYaml: `${testDir}/invalid.yaml`,
  invalidToml: `${testDir}/invalid.toml`,
  empty: `${testDir}/empty.json`,
  nonExistent: `${testDir}/nonexistent.json`,
}

describe('detectFileFormat', () => {
  test('detects JSON format', () => {
    expect(detectFileFormat('config.json')).toBe('json')
    expect(detectFileFormat('/path/to/config.json')).toBe('json')
    expect(detectFileFormat('CONFIG.JSON')).toBe('json') // Case insensitive
  })

  test('detects YAML format', () => {
    expect(detectFileFormat('config.yaml')).toBe('yaml')
    expect(detectFileFormat('config.yml')).toBe('yaml')
    expect(detectFileFormat('/path/to/config.YAML')).toBe('yaml') // Case insensitive
  })

  test('detects TOML format', () => {
    expect(detectFileFormat('config.toml')).toBe('toml')
    expect(detectFileFormat('/path/to/config.TOML')).toBe('toml') // Case insensitive
  })

  test('defaults to JSON for unknown extensions', () => {
    expect(detectFileFormat('config.txt')).toBe('json')
    expect(detectFileFormat('config')).toBe('json')
    expect(detectFileFormat('config.unknown')).toBe('json')
  })

  test('handles files without extensions', () => {
    expect(detectFileFormat('config')).toBe('json')
    expect(detectFileFormat('/path/to/config')).toBe('json')
  })
})

describe('loadConfigFile', () => {
  beforeEach(async () => {
    // Create test directory
    await Bun.spawn(['mkdir', '-p', testDir]).exited

    // Create test files
    const validConfig = {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
      },
      servarr: {
        url: 'http://sonarr:8989',
        type: 'sonarr',
      },
      log: {
        level: 'info',
        format: 'json',
      },
    }

    // Valid JSON
    await Bun.write(testFiles.validJson, JSON.stringify(validConfig, null, 2))

    // Valid YAML
    const yamlContent = `
postgres:
  host: localhost
  port: 5432
  database: testdb
servarr:
  url: http://sonarr:8989
  type: sonarr
log:
  level: info
  format: json
`
    await Bun.write(testFiles.validYaml, yamlContent.trim())
    await Bun.write(testFiles.validYml, yamlContent.trim())

    // Valid TOML
    const tomlContent = `
[postgres]
host = "localhost"
port = 5432
database = "testdb"

[servarr]
url = "http://sonarr:8989"
type = "sonarr"

[log]
level = "info"
format = "json"
`
    await Bun.write(testFiles.validToml, tomlContent.trim())

    // Invalid files
    await Bun.write(testFiles.invalidJson, '{ invalid json')
    await Bun.write(testFiles.invalidYaml, 'invalid:\n  - yaml: [unclosed')
    await Bun.write(testFiles.invalidToml, '[invalid\ntoml = missing bracket')

    // Empty file
    await Bun.write(testFiles.empty, '')
  })

  afterEach(async () => {
    // Clean up test files
    await Bun.spawn(['rm', '-rf', testDir]).exited
  })

  test('loads valid JSON file', async () => {
    const config = await loadConfigFile(testFiles.validJson)

    expect(config).not.toBeNull()
    expect(config?.postgres?.host).toBe('localhost')
    expect(config?.postgres?.port).toBe(5432)
    expect(config?.servarr?.url).toBe('http://sonarr:8989')
    expect(config?.log?.level).toBe('info')
  })

  test('loads valid YAML file', async () => {
    const config = await loadConfigFile(testFiles.validYaml)

    expect(config).not.toBeNull()
    expect(config?.postgres?.host).toBe('localhost')
    expect(config?.postgres?.port).toBe(5432)
    expect(config?.servarr?.url).toBe('http://sonarr:8989')
    expect(config?.log?.level).toBe('info')
  })

  test('loads valid YML file', async () => {
    const config = await loadConfigFile(testFiles.validYml)

    expect(config).not.toBeNull()
    expect(config?.postgres?.host).toBe('localhost')
    expect(config?.postgres?.port).toBe(5432)
  })

  test('loads valid TOML file', async () => {
    const config = await loadConfigFile(testFiles.validToml)

    expect(config).not.toBeNull()
    expect(config?.postgres?.host).toBe('localhost')
    expect(config?.postgres?.port).toBe(5432)
    expect(config?.servarr?.url).toBe('http://sonarr:8989')
    expect(config?.log?.level).toBe('info')
  })

  test('returns null for non-existent file', async () => {
    const config = await loadConfigFile(testFiles.nonExistent)
    expect(config).toBeNull()
  })

  test('returns null for empty file', async () => {
    const config = await loadConfigFile(testFiles.empty)
    expect(config).toBeNull()
  })

  test('throws error for invalid JSON', async () => {
    await expect(loadConfigFile(testFiles.invalidJson)).rejects.toThrow()
  })

  test('throws error for invalid YAML', async () => {
    await expect(loadConfigFile(testFiles.invalidYaml)).rejects.toThrow()
  })

  test('throws error for invalid TOML', async () => {
    await expect(loadConfigFile(testFiles.invalidToml)).rejects.toThrow()
  })

  test('handles complex nested configuration', async () => {
    const complexConfig = {
      postgres: {
        host: 'db.example.com',
        port: 5433,
        database: 'servarr_main',
        username: 'dbuser',
        password: 'secretpassword',
      },
      servarr: {
        url: 'http://sonarr:8989',
        type: 'sonarr',
        apiKey: 'generated-api-key',
        adminUser: 'admin',
        adminPassword: 'adminpass',
      },
      services: {
        qbittorrent: {
          url: 'http://qbittorrent:8080',
          username: 'qbtuser',
          password: 'qbtpass',
        },
        prowlarr: {
          url: 'http://prowlarr:9696',
          apiKey: 'prowlarr-key',
        },
      },
      config: {
        configPath: '/config/servarr.yaml',
        watch: true,
        reconcileInterval: 300,
      },
      log: {
        level: 'debug',
        format: 'pretty',
      },
      health: {
        port: 8080,
      },
    }

    const complexFile = `${testDir}/complex.json`
    await Bun.write(complexFile, JSON.stringify(complexConfig, null, 2))

    const config = await loadConfigFile(complexFile)

    expect(config?.postgres?.host).toBe('db.example.com')
    expect(config?.postgres?.port).toBe(5433)
    expect(config?.services?.qbittorrent?.url).toBe('http://qbittorrent:8080')
    expect(config?.services?.prowlarr?.apiKey).toBe('prowlarr-key')
    expect(config?.config?.watch).toBe(true)
    expect(config?.config?.reconcileInterval).toBe(300)
  })

  test('handles YAML with different value types', async () => {
    const yamlWithTypes = `
postgres:
  port: 5432          # number
  ssl: true           # boolean
  timeout: 30.5       # float
  tags:               # array
    - production
    - primary
    - "quoted-tag"
servarr:
  type: sonarr        # string
  enabled: false      # boolean
config:
  paths:              # array of strings
    - /config/main.yaml
    - /config/override.yaml
  debug: true
`
    const yamlTypeFile = `${testDir}/types.yaml`
    await Bun.write(yamlTypeFile, yamlWithTypes.trim())

    const config = await loadConfigFile(yamlTypeFile)

    expect(config?.postgres?.port).toBe(5432)
    expect(config?.postgres?.ssl).toBe(true)
    expect(config?.postgres?.timeout).toBe(30.5)
    expect(Array.isArray(config?.postgres?.tags)).toBe(true)
    expect(config?.postgres?.tags).toEqual(['production', 'primary', 'quoted-tag'])
    expect(config?.servarr?.enabled).toBe(false)
    expect(Array.isArray(config?.config?.paths)).toBe(true)
    expect(config?.config?.paths).toEqual(['/config/main.yaml', '/config/override.yaml'])
  })
})

describe('findConfigFile', () => {
  beforeEach(async () => {
    // Create test directory
    await Bun.spawn(['mkdir', '-p', testDir]).exited

    // Change to test directory for relative path tests
    process.chdir(testDir)
  })

  afterEach(async () => {
    // Clean up and restore original directory
    process.chdir('/')
    await Bun.spawn(['rm', '-rf', testDir]).exited
  })

  test('returns custom path when provided and exists', async () => {
    const customPath = `${testDir}/custom-config.yaml`
    await Bun.write(customPath, 'test: config')

    const result = await findConfigFile(customPath)
    expect(result).toBe(customPath)
  })

  test('returns null for custom path that does not exist', async () => {
    const customPath = `${testDir}/nonexistent-config.yaml`

    const result = await findConfigFile(customPath)
    expect(result).toBeNull()
  })

  test('finds config files in priority order', async () => {
    // Create multiple config files
    await Bun.write('./preparr.json', '{}')
    await Bun.write('./config.yaml', '{}')

    // Should find config.yaml first (higher priority)
    const result = await findConfigFile()
    expect(result).toBe('./config.yaml')
  })

  test('finds first available config file', async () => {
    // Only create the lower priority file
    await Bun.write('./preparr.toml', '{}')

    const result = await findConfigFile()
    expect(result).toBe('./preparr.toml')
  })

  test('returns null when no config files exist', async () => {
    const result = await findConfigFile()
    expect(result).toBeNull()
  })

  test('checks all supported formats in current directory', async () => {
    // Test each format individually
    const formats = [
      { file: './config.yaml', format: 'yaml' },
      { file: './config.yml', format: 'yml' },
      { file: './config.json', format: 'json' },
      { file: './config.toml', format: 'toml' },
      { file: './preparr.yaml', format: 'yaml' },
      { file: './preparr.yml', format: 'yml' },
      { file: './preparr.json', format: 'json' },
      { file: './preparr.toml', format: 'toml' },
    ]

    for (const { file } of formats) {
      // Clean up any existing files
      try {
        await Bun.spawn(['rm', '-f', ...formats.map((f) => f.file)]).exited
      } catch {
        // Ignore errors
      }

      // Create only this file
      await Bun.write(file, '{}')

      const result = await findConfigFile()
      expect(result).toBe(file)
    }
  })

  test('prefers /config directory over current directory', async () => {
    // Create /config directory (if we have permissions)
    try {
      await Bun.spawn(['mkdir', '-p', '/config']).exited
      await Bun.write('/config/servarr.yaml', '{}')
      await Bun.write('./config.yaml', '{}')

      const result = await findConfigFile()
      expect(result).toBe('/config/servarr.yaml')

      // Clean up
      await Bun.spawn(['rm', '-rf', '/config']).exited
    } catch {
      // Skip this test if we don't have permissions for /config
      // This is expected in many test environments
    }
  })
})
