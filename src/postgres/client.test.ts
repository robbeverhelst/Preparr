import { beforeEach, describe, expect, test } from 'bun:test'
import type { PostgresConfig } from '@/config/schema'
import { PostgresClient } from './client'

describe('PostgresClient', () => {
  let client: PostgresClient
  const mockConfig: PostgresConfig = {
    host: 'localhost',
    port: 5432,
    username: 'testuser',
    password: 'testpass',
    database: 'testdb',
  }

  beforeEach(() => {
    client = new PostgresClient(mockConfig)
  })

  test('creates PostgreSQL client instance', () => {
    expect(client).toBeDefined()
    expect(client).toBeInstanceOf(PostgresClient)
  })

  test('generates correct connection string', () => {
    // Access private method through any casting for testing
    const connString = (client as any).getConnectionString()
    expect(connString).toBe('postgres://testuser:testpass@localhost:5432/postgres')

    const dbConnString = (client as any).getConnectionString('customdb')
    expect(dbConnString).toBe('postgres://testuser:testpass@localhost:5432/customdb')
  })

  // Skip SQL-dependent tests that require actual database connection
  test.skip('connect creates database connections', () => {
    // Would require SQL mock
  })

  test.skip('connect is idempotent', () => {
    // Would require SQL mock
  })

  test.skip('close cleans up connections', () => {
    // Would require SQL mock
  })

  test('close handles null connections gracefully', () => {
    // Should not throw when no connections exist
    expect(() => client.close()).not.toThrow()
  })

  test('withRetry retries on failure', async () => {
    let attempts = 0
    const operation = async () => {
      attempts++
      if (attempts < 3) {
        throw new Error('Test error')
      }
      return 'success'
    }

    const result = await (client as any).withRetry(operation, {
      maxRetries: 5,
      initialDelay: 10,
    })

    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  test('withRetry throws after max retries', async () => {
    let attempts = 0
    const operation = async () => {
      attempts++
      throw new Error('Always fails')
    }

    await expect(
      (client as any).withRetry(operation, {
        maxRetries: 2,
        initialDelay: 10,
      }),
    ).rejects.toThrow('Always fails')

    expect(attempts).toBe(3) // initial + 2 retries
  })

  test('withRetry respects delay parameters', async () => {
    const startTime = Date.now()
    let attempts = 0

    const operation = async () => {
      attempts++
      if (attempts < 3) {
        throw new Error('Test error')
      }
      return 'success'
    }

    await (client as any).withRetry(operation, {
      maxRetries: 5,
      initialDelay: 50,
      factor: 2,
    })

    const elapsedTime = Date.now() - startTime
    // Should have waited at least 50ms + 100ms = 150ms
    expect(elapsedTime).toBeGreaterThanOrEqual(150)
  })

  test('withRetry respects max delay', async () => {
    const startTime = Date.now()
    let attempts = 0

    const operation = async () => {
      attempts++
      if (attempts < 4) {
        throw new Error('Test error')
      }
      return 'success'
    }

    await (client as any).withRetry(operation, {
      maxRetries: 5,
      initialDelay: 10,
      maxDelay: 20,
      factor: 10, // Would exponentially grow beyond maxDelay
    })

    const elapsedTime = Date.now() - startTime
    // Should have waited 10ms + 20ms + 20ms = 50ms (capped at maxDelay)
    expect(elapsedTime).toBeLessThan(100)
  })

  // Note: The actual database operations (testConnection, createDatabase, etc.)
  // would require a real database connection or more complex mocking.
  // These tests focus on the client logic and retry mechanism.
})
