import { describe, expect, test } from 'bun:test'
import type { StepContext } from '@/core/step'
import { PostgresUsersStep } from './postgres-users'

const logger = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

describe('PostgresUsersStep', () => {
  test('grants permissions only on the main database when log database is disabled', async () => {
    const createdUsers: string[] = []
    const grantedPermissions: Array<{ username: string; database: string }> = []
    const step = new PostgresUsersStep()
    const postgresClient = {
      userExists: async () => false,
      createUser: (username: string) => {
        createdUsers.push(username)
        return Promise.resolve()
      },
      grantPermissions: (username: string, database: string) =>
        Promise.resolve(grantedPermissions.push({ username, database })).then(() => undefined),
    } as unknown as import('@/postgres/client').PostgresClient
    const context: StepContext = {
      config: {
        postgres: {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres-secret',
          database: 'servarr',
          logDatabaseEnabled: false,
          skipProvisioning: false,
        },
        servarr: {
          type: 'sonarr',
          url: 'http://sonarr:8989',
          adminUser: 'admin',
          adminPassword: 'adminpass',
          authenticationMethod: 'forms',
        },
        app: {
          prowlarrSync: false,
          rootFolders: [],
          qualityProfiles: [],
          downloadClients: [],
          applications: [],
          customFormats: [],
          releaseProfiles: [],
          qualityDefinitions: [],
        },
        health: {
          port: 8080,
        },
        logLevel: 'info',
        logFormat: 'json',
        configPath: '/config/config.json',
        configWatch: true,
        configReconcileInterval: 60,
      },
      servarrType: 'sonarr',
      servarrClient: {} as unknown as import('@/servarr/client').ServarrManager,
      postgresClient,
      logger,
      executionMode: 'init',
    }

    const result = await step.execute(context)

    expect(result.success).toBe(true)
    expect(createdUsers).toEqual(['sonarr'])
    expect(grantedPermissions).toEqual([{ username: 'sonarr', database: 'sonarr_main' }])
  })

  test('skips user provisioning for qbittorrent', async () => {
    const step = new PostgresUsersStep()
    const context: StepContext = {
      config: {
        postgres: {
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: '',
          database: 'servarr',
          logDatabaseEnabled: true,
          skipProvisioning: false,
        },
        servarr: {
          type: 'qbittorrent',
          adminUser: 'admin',
          authenticationMethod: 'forms',
        },
        app: {
          prowlarrSync: false,
          rootFolders: [],
          qualityProfiles: [],
          downloadClients: [],
          applications: [],
          customFormats: [],
          releaseProfiles: [],
          qualityDefinitions: [],
        },
        services: {
          qbittorrent: {
            url: 'http://qbittorrent:8080',
            username: 'admin',
            password: 'adminpass',
          },
        },
        health: {
          port: 8080,
        },
        logLevel: 'info',
        logFormat: 'json',
        configPath: '/config/qbittorrent.json',
        configWatch: true,
        configReconcileInterval: 60,
      },
      servarrType: 'qbittorrent',
      postgresClient: {} as unknown as import('@/postgres/client').PostgresClient,
      qbittorrentClient: {} as unknown as import('@/qbittorrent/client').QBittorrentManager,
      logger,
      executionMode: 'init',
    }

    const result = await step.execute(context)

    expect(result.skipped).toBe(true)
  })
})
