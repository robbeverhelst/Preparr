import { afterEach, describe, expect, test } from 'bun:test'
import { HealthServer } from './health'
import type { ReconciliationManager, ReconciliationState } from './reconciliation'

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port as number
  probe.stop(true)
  return port
}

function fakeManager(
  state: Partial<ReconciliationState>,
  force: () => Promise<void> = () => Promise.resolve(),
): ReconciliationManager {
  const fullState: ReconciliationState = {
    lastReconciliation: new Date(),
    lastConfigHash: 'hash',
    reconciliationCount: 0,
    errors: 0,
    ...state,
  }
  return {
    getState: () => ({ ...fullState }),
    forceReconciliation: force,
  } as unknown as ReconciliationManager
}

describe('HealthServer', () => {
  let server: HealthServer | undefined
  let baseUrl = ''

  const start = (manager?: ReconciliationManager): HealthServer => {
    const port = freePort()
    server = new HealthServer(port)
    if (manager) server.setReconciliationManager(manager)
    server.start()
    baseUrl = `http://localhost:${port}`
    return server
  }

  afterEach(() => {
    server?.stop()
    server = undefined
  })

  test('reports healthy on /health and /health/ready once started', async () => {
    start()

    for (const path of ['/health', '/health/ready']) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'healthy' })
    }
  })

  test('answers liveness on /health/live and /health/liveness', async () => {
    start()

    for (const path of ['/health/live', '/health/liveness']) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('OK')
    }
  })

  test('returns 404 for unknown paths and GET /reconciliation/force', async () => {
    start()

    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/reconciliation/force`)).status).toBe(404)
  })

  test('answers CORS preflight', async () => {
    start()

    const response = await fetch(`${baseUrl}/health`, { method: 'OPTIONS' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('marks unhealthy with 503 until reconciliation succeeds again', async () => {
    const health = start(fakeManager({ reconciliationCount: 0 }))
    health.markUnhealthy('init failed')

    const unhealthy = await fetch(`${baseUrl}/health`)
    expect(unhealthy.status).toBe(503)
    expect(await unhealthy.json()).toEqual({ status: 'unhealthy' })

    health.setReconciliationManager(fakeManager({ reconciliationCount: 1, errors: 0 }))
    const recovered = await fetch(`${baseUrl}/health`)
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ status: 'healthy' })
  })

  test('stays healthy while recent reconciliations fail', async () => {
    start(fakeManager({ reconciliationCount: 10, errors: 10, lastReconciliation: new Date() }))

    expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
  })

  test('reports unhealthy after many errors and no reconciliation for over 5 minutes', async () => {
    start(
      fakeManager({
        reconciliationCount: 10,
        errors: 6,
        lastReconciliation: new Date(Date.now() - 301_000),
      }),
    )

    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unhealthy' })
  })

  test('includes reconciliation state and checks in /health/status', async () => {
    start(fakeManager({ reconciliationCount: 2, errors: 1, lastError: new Error('boom') }))

    const response = await fetch(`${baseUrl}/health/status`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('healthy')
    expect(body.reconciliation).toMatchObject({
      reconciliationCount: 2,
      errors: 1,
      status: 'error',
    })
    expect(body.checks.server.status).toBe('pass')
    expect(body.checks.reconciliation.status).toBe('pass')
  })

  test('reports reconciliation status as unavailable without a manager', async () => {
    start()

    const response = await fetch(`${baseUrl}/reconciliation/status`)
    expect(await response.json()).toEqual({ status: 'unavailable' })

    const status = await (await fetch(`${baseUrl}/health/status`)).json()
    expect(status.checks.reconciliation.status).toBe('warn')
  })

  test('forces reconciliation via POST /reconciliation/force', async () => {
    let forced = 0
    start(
      fakeManager({}, () => {
        forced++
        return Promise.resolve()
      }),
    )

    const response = await fetch(`${baseUrl}/reconciliation/force`, { method: 'POST' })
    expect(response.status).toBe(200)
    expect(forced).toBe(1)
  })

  test('returns 503 for forced reconciliation without a manager and 500 when it throws', async () => {
    const health = start()
    expect((await fetch(`${baseUrl}/reconciliation/force`, { method: 'POST' })).status).toBe(503)

    health.setReconciliationManager(fakeManager({}, () => Promise.reject(new Error('nope'))))
    const response = await fetch(`${baseUrl}/reconciliation/force`, { method: 'POST' })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Failed to trigger reconciliation',
      details: 'nope',
    })
  })

  test('exposes Prometheus metrics', async () => {
    start(fakeManager({ reconciliationCount: 4, errors: 2 }))

    const response = await fetch(`${baseUrl}/metrics`)
    expect(response.headers.get('Content-Type')).toBe('text/plain; version=0.0.4')
    const metrics = await response.text()
    expect(metrics).toContain('preparr_health_status 1')
    expect(metrics).toContain('preparr_reconciliation_total 4')
    expect(metrics).toContain('preparr_reconciliation_errors_total 2')
  })
})
