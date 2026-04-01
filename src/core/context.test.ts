import { describe, expect, test } from 'bun:test'
import type { Config } from '@/config/schema'
import { ContextBuilder } from './context'

describe('ContextBuilder', () => {
  test('builds qbittorrent-only execution contexts', () => {
    const config: Config = {
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
      services: {
        qbittorrent: {
          url: 'http://qbittorrent:8080',
          username: 'admin',
          password: 'adminpass',
        },
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
      configPath: '/config/qbittorrent.json',
      configWatch: true,
      configReconcileInterval: 60,
    }
    const context = new ContextBuilder()
      .setConfig(config)
      .setServarrType('qbittorrent')
      .setPostgresClient({} as unknown as import('@/postgres/client').PostgresClient)
      .setQBittorrentClient({} as unknown as import('@/qbittorrent/client').QBittorrentManager)
      .setExecutionMode('init')
      .build()

    expect(context.servarrType).toBe('qbittorrent')
    expect(context.qbittorrentClient).toBeDefined()
  })
})
