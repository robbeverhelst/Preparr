import { logger } from '@/utils/logger'
import { serve } from 'bun'

interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  checks: {
    postgres: boolean
    servarr: boolean
    config: boolean
    qbittorrent?: boolean
  }
  version?: string
}

export class HealthServer {
  private server: ReturnType<typeof serve> | null = null
  private port: number
  private healthStatus: HealthStatus

  constructor(port = 8080) {
    this.port = port
    this.healthStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        postgres: false,
        servarr: false,
        config: false,
        qbittorrent: false,
      },
    }
  }

  updateHealthCheck(component: keyof HealthStatus['checks'], status: boolean): void {
    this.healthStatus.checks[component] = status
    this.healthStatus.timestamp = new Date().toISOString()

    const allHealthy = Object.values(this.healthStatus.checks).every((check) => check)
    this.healthStatus.status = allHealthy ? 'healthy' : 'unhealthy'

    logger.debug('Health status updated', { component, status, overall: this.healthStatus.status })
  }

  private handleHealthz(): Response {
    const isHealthy = this.healthStatus.status === 'healthy'
    return new Response(JSON.stringify(this.healthStatus), {
      status: isHealthy ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private handleReady(): Response {
    const isReady = this.healthStatus.checks.postgres && this.healthStatus.checks.config
    return new Response(
      JSON.stringify({
        ready: isReady,
        timestamp: new Date().toISOString(),
      }),
      {
        status: isReady ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  start(): void {
    this.server = serve({
      port: this.port,
      fetch: (req) => {
        const url = new URL(req.url)

        switch (url.pathname) {
          case '/healthz':
            return this.handleHealthz()
          case '/ready':
            return this.handleReady()
          case '/':
            return new Response('PrepArr Health Server', { status: 200 })
          default:
            return new Response('Not Found', { status: 404 })
        }
      },
    })

    logger.info('Health server started', { port: this.port })
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      logger.info('Health server stopped')
    }
  }
}
