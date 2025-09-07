import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { loadConfiguration } from '../../config'

const testDir = '/tmp/preparr-scenario-test'
let originalEnv: Record<string, string | undefined>

/**
 * Integration tests covering real-world configuration scenarios
 */
describe('Configuration Integration Scenarios', () => {
  beforeEach(async () => {
    originalEnv = { ...process.env }
    clearTestEnvVars()

    await Bun.spawn(['mkdir', '-p', testDir]).exited
    process.chdir(testDir)
  })

  afterEach(async () => {
    clearTestEnvVars()
    Object.assign(process.env, originalEnv)

    process.chdir('/')
    await Bun.spawn(['rm', '-rf', testDir]).exited
  })

  test('Scenario 1: Docker Compose with environment variables', async () => {
    // Simulate Docker Compose environment
    process.env.POSTGRES_HOST = 'postgres'
    process.env.POSTGRES_PORT = '5432'
    process.env.POSTGRES_DATABASE = 'servarr'
    process.env.POSTGRES_USERNAME = 'servarr_user'
    process.env.POSTGRES_PASSWORD = 'docker_secret_123'

    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'
    process.env.SERVARR_ADMIN_USER = 'admin'
    process.env.SERVARR_ADMIN_PASSWORD = 'sonarr_admin_pass'

    process.env.QBITTORRENT_URL = 'http://qbittorrent:8080'
    process.env.QBITTORRENT_USERNAME = 'admin'
    process.env.QBITTORRENT_PASSWORD = 'qbt_docker_pass'

    process.env.LOG_LEVEL = 'info'
    process.env.LOG_FORMAT = 'json'
    process.env.HEALTH_PORT = '8080'

    const result = await loadConfiguration([])

    expect(result.config.postgres.host).toBe('postgres')
    expect(result.config.postgres.password).toBe('docker_secret_123')
    expect(result.config.servarr.url).toBe('http://sonarr:8989')
    expect(result.config.servarr.type).toBe('sonarr')
    expect(result.config.services.qbittorrent.url).toBe('http://qbittorrent:8080')
    expect(result.config.logLevel).toBe('info')
    expect(result.config.logFormat).toBe('json')

    // Should have valid complete configuration
    expect(result.config.postgres.port).toBe(5432)
    expect(result.config.health.port).toBe(8080)
  })

  test('Scenario 2: Kubernetes with ConfigMap and Secrets', async () => {
    // Create ConfigMap-like YAML file
    const configMapContent = `
postgres:
  host: postgres.database.svc.cluster.local
  port: 5432
  database: sonarr_main
  username: sonarr

servarr:
  url: http://sonarr.media.svc.cluster.local:8989
  type: sonarr
  adminUser: admin

services:
  qbittorrent:
    url: http://qbittorrent.downloads.svc.cluster.local:8080
    username: admin
  prowlarr:
    url: http://prowlarr.indexers.svc.cluster.local:9696

configWatch: true
configReconcileInterval: 300

logLevel: info
logFormat: json

health:
  port: 8080
`

    await Bun.write('./config.yaml', configMapContent.trim())

    // Simulate secrets from environment (mounted as env vars in K8s)
    process.env.POSTGRES_PASSWORD = 'k8s_postgres_secret_xyz'
    process.env.SERVARR_ADMIN_PASSWORD = 'k8s_servarr_secret_abc'
    process.env.QBITTORRENT_PASSWORD = 'k8s_qbt_secret_def'
    process.env.PROWLARR_API_KEY = 'k8s_prowlarr_key_ghi'

    const result = await loadConfiguration(['--config-path=./config.yaml'])

    expect(result.config.postgres.host).toBe('postgres.database.svc.cluster.local')
    expect(result.config.postgres.password).toBe('k8s_postgres_secret_xyz') // From secret
    expect(result.config.servarr.url).toBe('http://sonarr.media.svc.cluster.local:8989')
    expect(result.config.servarr.adminPassword).toBe('k8s_servarr_secret_abc') // From secret
    expect(result.config.services.qbittorrent.password).toBe('k8s_qbt_secret_def') // From secret
    expect(result.config.services.prowlarr.apiKey).toBe('k8s_prowlarr_key_ghi') // From secret
    expect(result.config.configReconcileInterval).toBe(300)
    expect(result.config.configWatch).toBe(true)

    expect(result.metadata.configFilePath).toBe('./config.yaml')
    expect(result.metadata.configFileFormat).toBe('yaml')
  })

  test('Scenario 3: Development override with CLI args', async () => {
    // Base production config
    const prodConfig = {
      postgres: {
        host: 'prod-postgres.example.com',
        port: 5432,
        database: 'servarr_prod',
        username: 'prod_user',
      },
      servarr: {
        url: 'https://sonarr.example.com',
        type: 'sonarr',
        adminUser: 'prod_admin',
      },
      log: {
        level: 'warn',
        format: 'json',
      },
      health: {
        port: 8080,
      },
    }

    await Bun.write('./config.json', JSON.stringify(prodConfig, null, 2))

    // Secrets from environment
    process.env.POSTGRES_PASSWORD = 'prod_secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'prod_admin_secret'

    // Developer overrides via CLI for local development
    const devArgs = [
      '--postgres-host=localhost',
      '--postgres-database=servarr_dev',
      '--servarr-url=http://localhost:8989',
      '--log-level=debug',
      '--log-format=pretty',
      '--health-port=9090',
    ]

    const result = await loadConfiguration(devArgs)

    // CLI should override config file
    expect(result.config.postgres.host).toBe('localhost') // CLI override
    expect(result.config.postgres.database).toBe('servarr_dev') // CLI override
    expect(result.config.postgres.port).toBe(5432) // From config file
    expect(result.config.postgres.password).toBe('prod_secret') // From environment

    expect(result.config.servarr.url).toBe('http://localhost:8989') // CLI override
    expect(result.config.servarr.adminPassword).toBe('prod_admin_secret') // From environment

    expect(result.config.logLevel).toBe('debug') // CLI override
    expect(result.config.logFormat).toBe('pretty') // CLI override
    expect(result.config.health.port).toBe(9090) // CLI override
  })

  test('Scenario 4: Multi-service media stack configuration', async () => {
    const _mediaStackConfig = {
      postgres: {
        host: 'postgres',
        port: 5432,
        database: 'media_stack',
      },
      servarr: {
        url: 'http://sonarr:8989',
        type: 'sonarr',
        adminUser: 'media_admin',
      },
      services: {
        qbittorrent: {
          url: 'http://qbittorrent:8080',
          username: 'admin',
        },
        prowlarr: {
          url: 'http://prowlarr:9696',
        },
      },
      config: {
        watch: true,
        reconcileInterval: 120,
      },
      log: {
        level: 'info',
        format: 'json',
      },
    }

    await Bun.write(
      './media-stack.toml',
      // Convert to TOML format
      `configWatch = true
configReconcileInterval = 120
logLevel = "info"
logFormat = "json"

[postgres]
host = "postgres"
port = 5432
database = "media_stack"

[servarr]  
url = "http://sonarr:8989"
type = "sonarr"
adminUser = "media_admin"

[services.qbittorrent]
url = "http://qbittorrent:8080"
username = "admin"

[services.prowlarr]
url = "http://prowlarr:9696"`,
    )

    // Secrets via environment
    process.env.POSTGRES_USERNAME = 'media_user'
    process.env.POSTGRES_PASSWORD = 'media_db_secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'media_servarr_secret'
    process.env.QBITTORRENT_PASSWORD = 'qbt_secret'
    process.env.PROWLARR_API_KEY = 'prowlarr_api_key'

    const result = await loadConfiguration(['--config-path=./media-stack.toml'])

    expect(result.config.postgres.database).toBe('media_stack')
    expect(result.config.postgres.username).toBe('media_user') // From env
    expect(result.config.postgres.password).toBe('media_db_secret') // From env

    expect(result.config.servarr.url).toBe('http://sonarr:8989')
    expect(result.config.servarr.adminPassword).toBe('media_servarr_secret') // From env

    expect(result.config.services.qbittorrent.url).toBe('http://qbittorrent:8080')
    expect(result.config.services.qbittorrent.password).toBe('qbt_secret') // From env
    expect(result.config.services.prowlarr.apiKey).toBe('prowlarr_api_key') // From env

    expect(result.config.configReconcileInterval).toBe(120)
    expect(result.config.configWatch).toBe(true)

    expect(result.metadata.configFilePath).toBe('./media-stack.toml')
    expect(result.metadata.configFileFormat).toBe('toml')
  })

  test('Scenario 5: Production security - minimal config with environment secrets', async () => {
    // Minimal config file without any secrets
    const _secureConfig = {
      postgres: {
        host: 'postgres-cluster.prod.internal',
        port: 5432,
        database: 'sonarr_production',
      },
      servarr: {
        url: 'https://sonarr.internal.example.com',
        type: 'sonarr',
      },
      log: {
        level: 'warn',
        format: 'json',
      },
      config: {
        watch: false,
        reconcileInterval: 600,
      },
      health: {
        port: 8080,
      },
    }

    await Bun.write(
      './production.yaml',
      `postgres:
  host: postgres-cluster.prod.internal
  port: 5432
  database: sonarr_production
servarr:
  url: https://sonarr.internal.example.com
  type: sonarr
logLevel: warn
logFormat: json
configWatch: false
configReconcileInterval: 600
health:
  port: 8080`,
    )

    // All secrets via environment (e.g., from vault, k8s secrets, etc.)
    process.env.POSTGRES_USERNAME = 'sonarr_prod_user'
    process.env.POSTGRES_PASSWORD = 'vault_generated_postgres_password_xyz123'
    process.env.SERVARR_ADMIN_USER = 'prod_admin'
    process.env.SERVARR_ADMIN_PASSWORD = 'vault_generated_servarr_password_abc456'
    process.env.SERVARR_API_KEY = 'abcdef1234567890abcdef1234567890'

    const result = await loadConfiguration(['--config-path=./production.yaml'])

    // Verify no secrets in config file, all from environment
    expect(result.config.postgres.username).toBe('sonarr_prod_user')
    expect(result.config.postgres.password).toBe('vault_generated_postgres_password_xyz123')
    expect(result.config.servarr.adminUser).toBe('prod_admin')
    expect(result.config.servarr.adminPassword).toBe('vault_generated_servarr_password_abc456')
    expect(result.config.servarr.apiKey).toBe('abcdef1234567890abcdef1234567890')

    // Verify production settings
    expect(result.config.logLevel).toBe('warn')
    expect(result.config.configWatch).toBe(false) // Don't watch in prod
    expect(result.config.configReconcileInterval).toBe(600) // Longer interval
    expect(result.config.postgres.host).toBe('postgres-cluster.prod.internal')
  })

  test('Scenario 6: Edge case - Empty config file with full environment setup', async () => {
    // Empty config file
    await Bun.write('./empty.json', '{}')

    // Everything via environment
    process.env.POSTGRES_HOST = 'env-postgres'
    process.env.POSTGRES_PORT = '5433'
    process.env.POSTGRES_DATABASE = 'env_database'
    process.env.POSTGRES_USERNAME = 'env_user'
    process.env.POSTGRES_PASSWORD = 'env_password'

    process.env.SERVARR_URL = 'http://env-sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'
    process.env.SERVARR_ADMIN_USER = 'env_admin'
    process.env.SERVARR_ADMIN_PASSWORD = 'env_admin_pass'
    process.env.SERVARR_API_KEY = '1234567890abcdef1234567890abcdef'

    process.env.QBITTORRENT_URL = 'http://env-qbt:8080'
    process.env.QBITTORRENT_USERNAME = 'env_qbt_user'
    process.env.QBITTORRENT_PASSWORD = 'env_qbt_pass'

    process.env.LOG_LEVEL = 'debug'
    process.env.LOG_FORMAT = 'pretty'

    const result = await loadConfiguration(['--config-path=./empty.json'])

    // All values should come from environment
    expect(result.config.postgres.host).toBe('env-postgres')
    expect(result.config.postgres.port).toBe(5433)
    expect(result.config.postgres.database).toBe('env_database')
    expect(result.config.postgres.username).toBe('env_user')
    expect(result.config.postgres.password).toBe('env_password')

    expect(result.config.servarr.url).toBe('http://env-sonarr:8989')
    expect(result.config.servarr.adminPassword).toBe('env_admin_pass')
    expect(result.config.servarr.apiKey).toBe('1234567890abcdef1234567890abcdef')

    expect(result.config.services.qbittorrent.url).toBe('http://env-qbt:8080')
    expect(result.config.services.qbittorrent.username).toBe('env_qbt_user')
    expect(result.config.services.qbittorrent.password).toBe('env_qbt_pass')

    expect(result.config.logLevel).toBe('debug')
    expect(result.config.logFormat).toBe('pretty')

    expect(result.metadata.configFilePath).toBe('./empty.json')
  })

  test('Scenario 7: CLI debugging and troubleshooting commands', async () => {
    // Set up basic working config
    process.env.POSTGRES_PASSWORD = 'secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'admin'
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'

    // Test with debugging CLI args
    const result = await loadConfiguration([
      '--log-level=debug',
      '--log-format=pretty',
      '--health-port=9999',
    ])

    expect(result.config.logLevel).toBe('debug')
    expect(result.config.logFormat).toBe('pretty')
    expect(result.config.health.port).toBe(9999)

    // Verify sources tracking for debugging
    expect(result.sources.cli.logLevel).toBe('debug')
    expect(result.sources.environment.postgres?.password).toBe('secret')
    expect(result.metadata.cliArgs.raw).toEqual([
      '--log-level=debug',
      '--log-format=pretty',
      '--health-port=9999',
    ])
  })

  test('Scenario 8: Array and complex value handling', async () => {
    const configWithArrays = {
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'test_arrays',
      },
      servarr: {
        url: 'http://sonarr:8989',
        type: 'sonarr',
        adminUser: 'admin',
      },
      configReconcileInterval: 120,
    }

    await Bun.write('./arrays.json', JSON.stringify(configWithArrays, null, 2))

    // Secrets
    process.env.POSTGRES_PASSWORD = 'array_test_secret'
    process.env.SERVARR_ADMIN_PASSWORD = 'array_admin_secret'
    process.env.SERVARR_URL = 'http://sonarr:8989'
    process.env.SERVARR_TYPE = 'sonarr'

    // Override with CLI array
    const result = await loadConfiguration([
      '--config-path=./arrays.json',
      '--config-reconcile-interval=180',
    ])

    // Test that CLI argument overrides file config
    expect(result.config.configReconcileInterval).toBe(180) // From CLI
    expect(result.config.postgres.database).toBe('test_arrays') // From file
    expect(result.config.postgres.password).toBe('array_test_secret') // From env
    expect(result.config.servarr.adminPassword).toBe('array_admin_secret') // From env
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
