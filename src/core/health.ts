import type { ReconciliationManager, ReconciliationState } from '@/core/reconciliation'
import { logger } from '@/utils/logger'

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'starting'
  timestamp: string
  uptime: number
  reconciliation?:
    | (ReconciliationState & {
        status: 'active' | 'inactive' | 'error'
      })
    | undefined
  checks: Record<
    string,
    {
      status: 'pass' | 'fail' | 'warn'
      message?: string
      lastChecked: string
    }
  >
}

export class HealthServer {
  private server: ReturnType<typeof Bun.serve> | undefined = undefined
  private startTime: Date = new Date()
  private reconciliationManager?: ReconciliationManager
  private healthStatus: HealthStatus['status'] = 'starting'

  constructor(private port = 9000) {}

  setReconciliationManager(manager: ReconciliationManager): void {
    this.reconciliationManager = manager
  }

  start(): void {
    this.server = Bun.serve({
      port: this.port,
      fetch: this.handleRequest.bind(this),
    })

    logger.info('Health server started', { port: this.port })
    this.healthStatus = 'healthy'
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      this.server = undefined
    }
    logger.info('Health server stopped')
  }

  private handleRequest(request: Request): Response | Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers for development
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      switch (path) {
        case '/health':
        case '/health/ready':
          return this.handleReadinessProbe(corsHeaders)

        case '/health/live':
        case '/health/liveness':
          return this.handleLivenessProbe(corsHeaders)

        case '/health/status':
          return this.handleDetailedStatus(corsHeaders)

        case '/reconciliation/force':
          if (request.method === 'POST') {
            return this.handleForceReconciliation(corsHeaders)
          }
          return this.notFound(corsHeaders)

        case '/reconciliation/status':
          return this.handleReconciliationStatus(corsHeaders)

        case '/metrics':
          return this.handleMetrics(corsHeaders)

        default:
          return this.notFound(corsHeaders)
      }
    } catch (error) {
      logger.error('Health server error', { error, path })
      return new Response('Internal Server Error', {
        status: 500,
        headers: corsHeaders,
      })
    }
  }

  private handleLivenessProbe(headers: Record<string, string>): Response {
    // Liveness probe - is the process running?
    const status = this.healthStatus === 'starting' ? 200 : 200
    return new Response('OK', { status, headers })
  }

  private handleReadinessProbe(headers: Record<string, string>): Response {
    // Readiness probe - is the service ready to handle requests?
    const health = this.getHealthStatus()
    const status = health.status === 'healthy' ? 200 : 503

    return new Response(JSON.stringify({ status: health.status }), {
      status,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    })
  }

  private handleDetailedStatus(headers: Record<string, string>): Response {
    const health = this.getHealthStatus()

    return new Response(JSON.stringify(health, null, 2), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    })
  }

  private async handleForceReconciliation(headers: Record<string, string>): Promise<Response> {
    if (!this.reconciliationManager) {
      return new Response(
        JSON.stringify({
          error: 'Reconciliation manager not available',
        }),
        {
          status: 503,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    try {
      await this.reconciliationManager.forceReconciliation()
      return new Response(
        JSON.stringify({
          message: 'Reconciliation triggered successfully',
        }),
        {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        },
      )
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Failed to trigger reconciliation',
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        },
      )
    }
  }

  private handleReconciliationStatus(headers: Record<string, string>): Response {
    const reconciliationState = this.reconciliationManager?.getState()

    return new Response(
      JSON.stringify(
        reconciliationState || {
          status: 'unavailable',
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      },
    )
  }

  private handleMetrics(headers: Record<string, string>): Response {
    const health = this.getHealthStatus()
    const reconciliation = this.reconciliationManager?.getState()

    // Simple Prometheus-style metrics
    const metrics = [
      '# HELP preparr_uptime_seconds Uptime in seconds',
      '# TYPE preparr_uptime_seconds counter',
      `preparr_uptime_seconds ${health.uptime}`,
      '',
      '# HELP preparr_health_status Health status (1=healthy, 0=unhealthy)',
      '# TYPE preparr_health_status gauge',
      `preparr_health_status ${health.status === 'healthy' ? 1 : 0}`,
      '',
      '# HELP preparr_reconciliation_total Total number of reconciliation cycles',
      '# TYPE preparr_reconciliation_total counter',
      `preparr_reconciliation_total ${reconciliation?.reconciliationCount || 0}`,
      '',
      '# HELP preparr_reconciliation_errors_total Total number of reconciliation errors',
      '# TYPE preparr_reconciliation_errors_total counter',
      `preparr_reconciliation_errors_total ${reconciliation?.errors || 0}`,
    ].join('\n')

    return new Response(metrics, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/plain; version=0.0.4',
      },
    })
  }

  private notFound(headers: Record<string, string>): Response {
    return new Response('Not Found', { status: 404, headers })
  }

  private getHealthStatus(): HealthStatus {
    const now = Date.now()
    const uptime = Math.floor((now - this.startTime.getTime()) / 1000)
    const reconciliationState = this.reconciliationManager?.getState()

    return {
      status: this.determineOverallHealth(reconciliationState),
      timestamp: new Date().toISOString(),
      uptime,
      reconciliation: reconciliationState
        ? {
            ...reconciliationState,
            status: this.determineReconciliationStatus(reconciliationState),
          }
        : undefined,
      checks: this.runHealthChecks(),
    }
  }

  private determineOverallHealth(reconciliation?: ReconciliationState): HealthStatus['status'] {
    if (this.healthStatus === 'starting') return 'starting'

    // Auto-recovery: mark healthy if reconciliation is working
    if (reconciliation && reconciliation.reconciliationCount > 0) {
      const timeSinceLastReconciliation = Date.now() - reconciliation.lastReconciliation.getTime()

      // If reconciliation succeeded recently, we're healthy regardless of past errors
      if (timeSinceLastReconciliation < 120000 && reconciliation.errors === 0) {
        if (this.healthStatus === 'unhealthy') {
          logger.info('Auto-recovery: marking service healthy after successful reconciliation')
          this.healthStatus = 'healthy'
        }
        return 'healthy'
      }

      // Consider unhealthy only if many recent errors AND no recent success
      if (reconciliation.errors > 5 && timeSinceLastReconciliation > 300000) {
        return 'unhealthy'
      }
    }

    return this.healthStatus
  }

  private determineReconciliationStatus(
    state: ReconciliationState,
  ): 'active' | 'inactive' | 'error' {
    const timeSinceLastReconciliation = Date.now() - state.lastReconciliation.getTime()

    if (state.lastError && timeSinceLastReconciliation < 60000) {
      return 'error'
    }

    if (timeSinceLastReconciliation > 600000) {
      // 10 minutes
      return 'inactive'
    }

    return 'active'
  }

  private runHealthChecks(): HealthStatus['checks'] {
    const now = new Date().toISOString()

    return {
      server: {
        status: 'pass',
        message: 'Health server is running',
        lastChecked: now,
      },
      reconciliation: {
        status: this.reconciliationManager ? 'pass' : 'warn',
        message: this.reconciliationManager
          ? 'Reconciliation manager active'
          : 'Reconciliation manager not initialized',
        lastChecked: now,
      },
    }
  }

  markUnhealthy(reason?: string): void {
    this.healthStatus = 'unhealthy'
    logger.warn('Health status marked as unhealthy', { reason })
  }

  markHealthy(): void {
    this.healthStatus = 'healthy'
    logger.info('Health status marked as healthy')
  }
}
