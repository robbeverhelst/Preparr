import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServarrManager } from './client'

describe('ServarrManager config.xml generation', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('POSTGRES_') || key === 'SERVARR_INSTANCE_NAME') {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  test('writes LogDbEnabled=False and omits PostgresLogDb when log databases are disabled', async () => {
    const configPath = join(tmpdir(), `servarr-config-${Date.now()}.xml`)
    const manager = new ServarrManager(
      {
        type: 'sonarr',
        url: 'http://sonarr:8989',
        apiKey: '0123456789abcdef0123456789abcdef',
        adminUser: 'admin',
        adminPassword: 'adminpass',
        authenticationMethod: 'forms',
      },
      {
        configPath,
        logDatabaseEnabled: false,
      },
    )

    process.env.POSTGRES_PASSWORD = 'postgres-secret'
    process.env.POSTGRES_HOST = 'postgres'
    process.env.POSTGRES_PORT = '5432'

    await manager.writeConfigurationOnly()

    const configXml = readFileSync(configPath, 'utf8')
    rmSync(configPath)

    expect(configXml).toContain('<PostgresMainDb>sonarr_main</PostgresMainDb>')
    expect(configXml).not.toContain('<PostgresLogDb>')
    expect(configXml).toContain('<LogDbEnabled>False</LogDbEnabled>')
  })

  test('writes LogDbEnabled=True and includes PostgresLogDb when log databases are enabled', async () => {
    const configPath = join(tmpdir(), `servarr-config-${Date.now()}.xml`)
    const manager = new ServarrManager(
      {
        type: 'sonarr',
        url: 'http://sonarr:8989',
        apiKey: '0123456789abcdef0123456789abcdef',
        adminUser: 'admin',
        adminPassword: 'adminpass',
        authenticationMethod: 'forms',
      },
      {
        configPath,
        logDatabaseEnabled: true,
      },
    )

    process.env.POSTGRES_PASSWORD = 'postgres-secret'
    process.env.POSTGRES_HOST = 'postgres'
    process.env.POSTGRES_PORT = '5432'

    await manager.writeConfigurationOnly()

    const configXml = readFileSync(configPath, 'utf8')
    rmSync(configPath)

    expect(configXml).toContain('<PostgresMainDb>sonarr_main</PostgresMainDb>')
    expect(configXml).toContain('<PostgresLogDb>sonarr_log</PostgresLogDb>')
    expect(configXml).toContain('<LogDbEnabled>True</LogDbEnabled>')
  })
})
