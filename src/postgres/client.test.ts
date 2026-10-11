import { beforeEach, describe, expect, test } from 'bun:test'
import type { PostgresConfig } from '@/config/schema'
import { buildPostgresConnectionString, PostgresClient } from './client'

describe('PostgresClient', () => {
  let client: PostgresClient
  const mockConfig: PostgresConfig = {
    host: 'localhost',
    port: 5432,
    username: 'testuser',
    password: 'testpass',
    database: 'testdb',
    logDatabaseEnabled: true,
    skipProvisioning: false,
  }

  beforeEach(() => {
    client = new PostgresClient(mockConfig)
  })

  test('creates PostgreSQL client instance', () => {
    expect(client).toBeDefined()
    expect(client).toBeInstanceOf(PostgresClient)
  })

  test('builds connection strings with URL-encoded credentials', () => {
    const url = buildPostgresConnectionString({
      username: 'user@corp',
      password: 'p@ss:w/rd#1?%',
      host: 'db.local',
      port: 5433,
      database: 'sonarr_main',
    })

    expect(url).toBe('postgres://user%40corp:p%40ss%3Aw%2Frd%231%3F%25@db.local:5433/sonarr_main')
    const parsed = new URL(url)
    expect(decodeURIComponent(parsed.username)).toBe('user@corp')
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:w/rd#1?%')
    expect(parsed.hostname).toBe('db.local')
    expect(parsed.port).toBe('5433')
    expect(parsed.pathname).toBe('/sonarr_main')
  })

  test('builds connection strings unchanged for plain credentials', () => {
    expect(
      buildPostgresConnectionString({
        username: 'testuser',
        password: 'testpass',
        host: 'localhost',
        port: 5432,
        database: 'postgres',
      }),
    ).toBe('postgres://testuser:testpass@localhost:5432/postgres')
  })

  // Note: The actual database operations (testConnection, createDatabase, etc.)
  // would require a real database connection or more complex mocking.
  // These tests focus on the client logic and retry mechanism.
})
