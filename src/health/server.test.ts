import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HealthServer } from './server'

describe('HealthServer', () => {
  let healthServer: HealthServer

  beforeEach(() => {
    healthServer = new HealthServer(0) // Use port 0 for random available port
  })

  afterEach(() => {
    healthServer.stop()
  })

  test('creates health server instance', () => {
    expect(healthServer).toBeDefined()
    expect(healthServer).toBeInstanceOf(HealthServer)
  })

  test('starts and stops server', () => {
    expect(() => healthServer.start()).not.toThrow()
    expect(() => healthServer.stop()).not.toThrow()
  })

  test('updates health check status', () => {
    healthServer.updateHealthCheck('postgres', true)
    healthServer.updateHealthCheck('servarr', false)
    healthServer.updateHealthCheck('config', true)

    // Since we can't easily access private properties, we'll test the behavior
    // by starting the server and making requests (in a more comprehensive test)
    expect(() => healthServer.updateHealthCheck('test', true)).not.toThrow()
  })

  test('handles multiple start calls gracefully', () => {
    healthServer.start()
    expect(() => healthServer.start()).not.toThrow() // Should not throw on second start
  })

  test('handles multiple stop calls gracefully', () => {
    healthServer.start()
    healthServer.stop()
    expect(() => healthServer.stop()).not.toThrow() // Should not throw on second stop
  })

  test('liveness endpoint returns correct response', async () => {
    // Use a specific port for testing
    const testServer = new HealthServer(8888)

    // Set all health checks to true first
    testServer.updateHealthCheck('postgres', true)
    testServer.updateHealthCheck('servarr', true)
    testServer.updateHealthCheck('config', true)
    testServer.updateHealthCheck('qbittorrent', true)

    testServer.start()

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 100))

    const response = await fetch('http://localhost:8888/healthz')

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('status')
    expect(data.status).toBe('healthy')
    expect(data.checks.postgres).toBe(true)
    expect(data.checks.servarr).toBe(true)
    expect(data.checks.config).toBe(true)
    expect(data.checks.qbittorrent).toBe(true)

    testServer.stop()
  })

  test('readiness endpoint reflects health check status', async () => {
    // Use a specific port for testing
    const testServer = new HealthServer(8889)
    testServer.start()

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Initially all checks are false, so should not be ready
    let response = await fetch('http://localhost:8889/ready')
    expect(response.status).toBe(503)

    let data = await response.json()
    expect(data.ready).toBe(false)

    // Update health checks
    testServer.updateHealthCheck('postgres', true)
    testServer.updateHealthCheck('servarr', true)
    testServer.updateHealthCheck('config', true)

    // Now should be ready
    response = await fetch('http://localhost:8889/ready')
    expect(response.status).toBe(200)

    data = await response.json()
    expect(data.ready).toBe(true)

    testServer.stop()
  })

  test('handles 404 for unknown endpoints', async () => {
    // Use a specific port for testing
    const testServer = new HealthServer(8890)
    testServer.start()

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 100))

    const response = await fetch('http://localhost:8890/unknown')

    expect(response.status).toBe(404)

    const text = await response.text()
    expect(text).toBe('Not Found')

    testServer.stop()
  })
})
