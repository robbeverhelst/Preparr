import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { file } from 'bun'
import { loadConfiguration, loadConfigurationSafe } from './index'

const testDir = '/tmp/preparr-integration-test'
let originalEnv: Record<string, string | undefined>
let originalProcessExit: typeof process.exit

describe('loadConfiguration', () => {
  beforeEach(async () => {
    // Store original environment and process.exit
    originalEnv = { ...process.env }
    originalProcessExit = process.exit

    // Clear test environment variables
    clearTestEnvVars()

    // Create test directory
    await Bun.spawn(['mkdir', '-p', testDir]).exited
    process.chdir(testDir)
  })

  afterEach(async () => {
    // Restore environment and process.exit
    clearTestEnvVars()
    Object.assign(process.env, originalEnv)
    process.exit = originalProcessExit

    // Clean up test directory
    process.chdir('/')
    await Bun.spawn(['rm', '-rf', testDir]).exited
  })

  test('loads configuration with defaults only', async () => {
    // Set required environment variables
    process.env.POSTGRES_PASSWORD = 'test-password'
    process.env.SERVARR_ADMIN_PASSWORD = 'test-admin'
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'

    const result = await loadConfiguration([])

    expect(result.config).toBeDefined()
    expect(result.sources).toBeDefined()
    expect(result.metadata).toBeDefined()

    // Should have default values
    expect(result.config.postgres.host).toBe('localhost')
    expect(result.config.postgres.port).toBe(5432)
    expect(result.config.logLevel).toBe('info')
    expect(result.config.health.port).toBe(8080)

    // Should have no config file
    expect(result.metadata.configFilePath).toBeNull()
    expect(result.metadata.configFileFormat).toBeNull()

    // Sources should be populated
    expect(result.sources.defaults).toBeDefined()
    expect(result.sources.file).toBeNull()
    expect(result.sources.environment).toBeDefined()
    expect(result.sources.cli).toBeDefined()
  })

  test('handles --help flag', async () => {
    let exitCode: number | undefined
    let loggedOutput = ''

    // Mock process.exit and console.log
    process.exit = ((code?: string | number) => {
      exitCode = typeof code === 'number' ? code : code ? Number.parseInt(code) : 0
      throw new Error('process.exit called') // Stop execution
    }) as typeof process.exit

    const originalStdoutWrite = process.stdout.write
    process.stdout.write = ((chunk: string) => {
      loggedOutput += chunk
      return true
    }) as typeof process.stdout.write

    try {
      await loadConfiguration(['--help'])
    } catch (_error) {
      // Expected due to process.exit mock
    }

    process.stdout.write = originalStdoutWrite

    expect(exitCode).toBe(0)
    expect(loggedOutput).toContain('PrepArr - Servarr Automation Tool')
    expect(loggedOutput).toContain('--help')
  })

  test('handles --version flag', async () => {
    let exitCode: number | undefined
    let loggedOutput = ''

    // Create a mock package.json
    const packageJson = { version: '1.2.3' }
    await Bun.write('./package.json', JSON.stringify(packageJson))

    // Mock process.exit and console.log
    process.exit = ((code?: string | number) => {
      exitCode = typeof code === 'number' ? code : code ? Number.parseInt(code) : 0
      throw new Error('process.exit called')
    }) as typeof process.exit

    const originalStdoutWrite = process.stdout.write
    process.stdout.write = ((chunk: string) => {
      loggedOutput += chunk
      return true
    }) as typeof process.stdout.write

    try {
      await loadConfiguration(['--version'])
    } catch (_error) {
      // Expected due to process.exit mock
    }

    process.stdout.write = originalStdoutWrite

    expect(exitCode).toBe(0)
    expect(loggedOutput).toContain('PrepArr v1.2.3')
  })

  test('handles --generate-api-key flag', async () => {
    let exitCode: number | undefined
    let loggedOutput = ''

    // Mock process.exit and console.log
    process.exit = ((code?: string | number) => {
      exitCode = typeof code === 'number' ? code : code ? Number.parseInt(code) : 0
      throw new Error('process.exit called')
    }) as typeof process.exit

    const originalStdoutWrite = process.stdout.write
    process.stdout.write = ((chunk: string) => {
      loggedOutput += chunk
      return true
    }) as typeof process.stdout.write

    try {
      await loadConfiguration(['--generate-api-key'])
    } catch (_error) {
      // Expected due to process.exit mock
    }

    process.stdout.write = originalStdoutWrite

    expect(exitCode).toBe(0)
    expect(loggedOutput.replace(/\\n/g, '').trim()).toMatch(/^[0-9a-f]{32}$/) // Should be 32-char hex
  })

  test('loads configuration from file', async () => {
    const configContent = {
      postgres: {
        host: 'filehost',
        database: 'filedb',
        password: 'file-pg-password', // Include required password in file for this test
      },
      servarr: {
        url: 'http://file-sonarr:8989',
        adminPassword: 'file-admin-pass',
        type: 'sonarr',
      },
      logLevel: 'debug',
    }

    await Bun.write('./config.json', JSON.stringify(configContent, null, 2))

    // Set only required environment variables that aren't in the file
    process.env.POSTGRES_PASSWORD = 'env-pg-secret' // Override file value
    // Don't set SERVARR fields - let file values take precedence

    const result = await loadConfiguration(['--config-path=./config.json'])

    expect(result.config.postgres.host).toBe('filehost') // From file
    expect(result.config.postgres.database).toBe('filedb') // From file
    expect(result.config.postgres.password).toBe('env-pg-secret') // From env
    expect(result.config.servarr.url).toBe('http://file-sonarr:8989') // From file
    expect(result.config.servarr.adminPassword).toBe('file-admin-pass') // From file
    expect(result.config.logLevel).toBe('debug') // From file

    expect(result.metadata.configFilePath).toBe('./config.json')
    expect(result.metadata.configFileFormat).toBe('json')
  })

  test('loads configuration from environment variables', async () => {
    process.env.POSTGRES_HOST = 'env-host'
    process.env.POSTGRES_PASSWORD = 'env-secret'
    process.env.POSTGRES_PORT = '5433'
    process.env.SERVARR_URL = 'http://env-sonarr:8989'
    process.env.SERVARR_ADMIN_PASSWORD = 'env-admin-pass'
    process.env.SERVARR_TYPE = 'sonarr'
    process.env.LOG_LEVEL = 'debug'

    const result = await loadConfiguration([])

    expect(result.config.postgres.host).toBe('env-host')
    expect(result.config.postgres.password).toBe('env-secret')
    expect(result.config.postgres.port).toBe(5433) // Converted to number
    expect(result.config.servarr.url).toBe('http://env-sonarr:8989')
    expect(result.config.servarr.adminPassword).toBe('env-admin-pass')
    expect(result.config.logLevel).toBe('debug')
  })

  test('loads configuration from CLI arguments', async () => {
    // Set required fields via environment
    process.env.POSTGRES_PASSWORD = 'env-secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'env-admin'

    const args = [
      '--postgres-host=cli-host',
      '--postgres-port=5434',
      '--servarr-url=http://cli-sonarr:8989',
      '--servarr-type=sonarr',
      '--log-level=error',
    ]

    const result = await loadConfiguration(args)

    expect(result.config.postgres.host).toBe('cli-host')
    expect(result.config.postgres.port).toBe(5434)
    expect(result.config.servarr.url).toBe('http://cli-sonarr:8989')
    expect(result.config.logLevel).toBe('error')
  })

  test('respects configuration priority: CLI > ENV > FILE > DEFAULTS', async () => {
    // Create config file
    const fileConfig = {
      postgres: {
        host: 'file-host',
        port: 5435,
        database: 'file-db',
        password: 'file-password',
      },
      servarr: {
        url: 'http://file-sonarr:8989',
        adminPassword: 'file-admin',
        type: 'sonarr',
      },
      logLevel: 'info',
      logFormat: 'pretty',
    }

    await Bun.write('./config.json', JSON.stringify(fileConfig, null, 2))

    // Set environment variables (should override file)
    process.env.POSTGRES_HOST = 'env-host'
    process.env.POSTGRES_PASSWORD = 'env-secret'
    process.env.LOG_LEVEL = 'debug'

    // Set CLI arguments (should override everything)
    const args = ['--config-path=./config.json', '--postgres-port=5436', '--log-format=json']

    const result = await loadConfiguration(args)

    // Verify priority: CLI > ENV > FILE > DEFAULTS
    expect(result.config.postgres.host).toBe('env-host') // ENV overrides FILE
    expect(result.config.postgres.port).toBe(5436) // CLI overrides FILE
    expect(result.config.postgres.database).toBe('file-db') // FILE overrides DEFAULTS
    expect(result.config.postgres.password).toBe('env-secret') // ENV (only source)
    expect(result.config.logLevel).toBe('debug') // ENV overrides FILE
    expect(result.config.logFormat).toBe('json') // CLI overrides FILE
    expect(result.config.servarr.url).toBe('http://file-sonarr:8989') // FILE overrides DEFAULTS
    expect(result.config.servarr.adminPassword).toBe('file-admin') // FILE overrides DEFAULTS
  })

  test('fails validation when required fields are missing', async () => {
    // Don't set required passwords

    await expect(loadConfiguration([])).rejects.toThrow(/Configuration validation failed/)
  })

  test('validates required fields before Zod validation', async () => {
    const result = loadConfiguration([])

    await expect(result).rejects.toThrow(/postgres.password is required/)
    await expect(result).rejects.toThrow(/servarr.adminPassword is required/)
  })

  test('handles custom config file path via CLI', async () => {
    const customConfig = {
      postgres: {
        host: 'custom-host',
        password: 'custom-secret',
      },
      servarr: {
        url: 'http://custom-sonarr:8989',
        adminPassword: 'custom-admin',
        type: 'sonarr',
      },
    }

    const customPath = `${testDir}/custom-config.yaml`
    await Bun.write(customPath, JSON.stringify(customConfig, null, 2))

    const result = await loadConfiguration([`--config-path=${customPath}`])

    expect(result.config.postgres.host).toBe('custom-host')
    expect(result.config.postgres.password).toBe('custom-secret')
    expect(result.metadata.configFilePath).toBe(customPath)
  })

  test('handles YAML config file', async () => {
    const yamlContent = `
postgres:
  host: yaml-host
  password: yaml-secret
  port: 5437
servarr:
  url: http://yaml-sonarr:8989
  adminPassword: yaml-admin
  type: sonarr
logLevel: warn
logFormat: pretty
`

    await Bun.write('./config.yaml', yamlContent.trim())

    const result = await loadConfiguration(['--config-path=./config.yaml'])

    expect(result.config.postgres.host).toBe('yaml-host')
    expect(result.config.postgres.port).toBe(5437)
    expect(result.config.logLevel).toBe('warn')
    expect(result.metadata.configFilePath).toBe('./config.yaml')
    expect(result.metadata.configFileFormat).toBe('yaml')
  })

  test('handles TOML config file', async () => {
    const tomlContent = `
logLevel = "error"
logFormat = "json"

[postgres]
host = "toml-host"
password = "toml-secret"
port = 5438

[servarr]
url = "http://toml-sonarr:8989"
adminPassword = "toml-admin"
type = "sonarr"
`

    await Bun.write('./config.toml', tomlContent.trim())

    const result = await loadConfiguration(['--config-path=./config.toml'])

    expect(result.config.postgres.host).toBe('toml-host')
    expect(result.config.postgres.port).toBe(5438)
    expect(result.config.logLevel).toBe('error')
    expect(result.metadata.configFilePath).toBe('./config.toml')
    expect(result.metadata.configFileFormat).toBe('toml')
  })

  test('handles complex nested services configuration', async () => {
    process.env.POSTGRES_PASSWORD = 'env-secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'env-admin'

    const args = [
      '--postgres-host=localhost',
      '--servarr-url=http://sonarr:8989',
      '--servarr-type=sonarr',
      '--qbittorrent-url=http://qbt:8080',
      '--qbittorrent-username=qbtuser',
      '--qbittorrent-password=qbtpass',
      '--prowlarr-url=http://prowlarr:9696',
      '--prowlarr-api-key=prowlarr123',
    ]

    const result = await loadConfiguration(args)

    expect(result.config.services.qbittorrent.url).toBe('http://qbt:8080')
    expect(result.config.services.qbittorrent.username).toBe('qbtuser')
    expect(result.config.services.qbittorrent.password).toBe('qbtpass')
    expect(result.config.services.prowlarr.url).toBe('http://prowlarr:9696')
    expect(result.config.services.prowlarr.apiKey).toBe('prowlarr123')
  })
})

describe('loadConfigurationSafe', () => {
  beforeEach(() => {
    originalEnv = { ...process.env }
    originalProcessExit = process.exit
    clearTestEnvVars()
  })

  afterEach(() => {
    clearTestEnvVars()
    Object.assign(process.env, originalEnv)
    process.exit = originalProcessExit
  })

  test('exits with error code 1 on configuration failure', async () => {
    let exitCode: number | undefined
    let errorOutput = ''

    // Mock process.exit and console.error
    process.exit = ((code?: string | number) => {
      exitCode = typeof code === 'number' ? code : code ? Number.parseInt(code) : 0
      throw new Error('process.exit called')
    }) as typeof process.exit

    // Mock the logger module
    const originalError = console.error
    console.error = (message: string) => {
      errorOutput += `${message}\\n`
    }

    try {
      await loadConfigurationSafe([])
    } catch (_error) {
      // Expected due to process.exit mock
    }

    console.error = originalError

    expect(exitCode).toBe(1)
    expect(errorOutput).toContain('Configuration loading failed')
    expect(errorOutput).toContain('Tips:')
    expect(errorOutput).toContain('POSTGRES_PASSWORD')
    expect(errorOutput).toContain('SERVARR_ADMIN_PASSWORD')
  })

  test('returns configuration result on success', async () => {
    process.env.POSTGRES_PASSWORD = 'env-secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'env-admin'
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'

    const result = await loadConfigurationSafe([])

    expect(result).toBeDefined()
    expect(result.config).toBeDefined()
    expect(result.config.postgres.password).toBe('env-secret')
    expect(result.config.servarr.adminPassword).toBe('env-admin')
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
