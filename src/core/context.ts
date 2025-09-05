import type { EnvironmentConfig, ServarrApplicationConfig } from '@/config/schema'
import type { PostgresClient } from '@/postgres/client'
import type { QBittorrentManager } from '@/qbittorrent/client'
import type { ServarrManager } from '@/servarr/client'
import { logger } from '@/utils/logger'
import type { StepContext } from './step'

export interface ExecutionContext extends StepContext {
  executionMode: 'init' | 'sidecar'
  startTime: Date
  stepResults: Map<string, import('./step').StepResult>
  servarrConfig?: ServarrApplicationConfig
  configPath?: string
  configWatch?: boolean
}

export class ContextBuilder {
  private context: Partial<ExecutionContext> = {}

  setConfig(config: EnvironmentConfig): this {
    this.context.config = config
    return this
  }

  setServarrType(type: string): this {
    this.context.servarrType = type
    return this
  }

  setApiKey(apiKey?: string): this {
    this.context.apiKey = apiKey
    return this
  }

  setPostgresClient(client: PostgresClient): this {
    this.context.postgresClient = client
    return this
  }

  setServarrClient(client: ServarrManager): this {
    this.context.servarrClient = client
    return this
  }

  setQBittorrentClient(client?: QBittorrentManager): this {
    this.context.qbittorrentClient = client
    return this
  }

  setExecutionMode(mode: 'init' | 'sidecar'): this {
    this.context.executionMode = mode
    return this
  }

  setServarrConfig(config: ServarrApplicationConfig): this {
    this.context.servarrConfig = config
    return this
  }

  setConfigPath(path: string): this {
    this.context.configPath = path
    return this
  }

  setConfigWatch(watch: boolean): this {
    this.context.configWatch = watch
    return this
  }

  build(): ExecutionContext {
    if (!this.context.config) {
      throw new Error('Configuration is required')
    }
    if (!this.context.postgresClient) {
      throw new Error('PostgreSQL client is required')
    }
    if (!this.context.servarrClient) {
      throw new Error('Servarr client is required')
    }
    if (!this.context.servarrType) {
      throw new Error('Servarr type is required')
    }
    if (!this.context.executionMode) {
      throw new Error('Execution mode is required')
    }

    return {
      ...this.context,
      logger,
      startTime: new Date(),
      stepResults: new Map(),
    } as ExecutionContext
  }
}
