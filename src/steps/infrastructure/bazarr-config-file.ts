import { file, write } from 'bun'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

const BAZARR_CONFIG_PATH = '/config/config/config.yaml'

export class BazarrConfigFileStep extends ConfigurationStep {
  readonly name = 'bazarr-config-file'
  readonly description = 'Write Bazarr configuration file (config.yaml)'
  readonly dependencies: string[] = ['postgres-users', 'config-loading']
  readonly mode: 'init' | 'sidecar' | 'both' = 'init'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in init mode for standalone Bazarr deployments
    return context.executionMode === 'init' && !!context.bazarrClient && !context.servarrClient
  }

  async readCurrentState(
    _context: StepContext,
  ): Promise<{ configExists: boolean; hasApiKey: boolean }> {
    try {
      const configFile = file(BAZARR_CONFIG_PATH)
      if (await configFile.exists()) {
        const content = await configFile.text()
        const hasApiKey = /apikey:\s*.+/.test(content) && !/apikey:\s*['"]?['"]?\s*$/.test(content)
        return { configExists: true, hasApiKey }
      }
    } catch (error) {
      _context.logger.debug('Failed to check Bazarr config file', { error })
    }
    return { configExists: false, hasApiKey: false }
  }

  protected getDesiredState(_context: StepContext): { configExists: boolean; hasApiKey: boolean } {
    return { configExists: true, hasApiKey: true }
  }

  compareAndPlan(
    current: { configExists: boolean; hasApiKey: boolean },
    desired: { configExists: boolean; hasApiKey: boolean },
    context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.configExists) {
      changes.push({
        type: 'create',
        resource: 'bazarr-config-file',
        identifier: 'config.yaml',
        details: { servarrType: context.servarrType },
      })
    } else if (!current.hasApiKey && desired.hasApiKey) {
      changes.push({
        type: 'update',
        resource: 'bazarr-config-file',
        identifier: 'config.yaml',
        details: { action: 'add-api-key', servarrType: context.servarrType },
      })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create' || change.type === 'update') {
          await this.writeBazarrConfig(context)
          results.push({ ...change, type: 'create' })
          context.logger.info('Bazarr configuration file written successfully', {
            path: BAZARR_CONFIG_PATH,
          })
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to write Bazarr configuration file', {
          error: stepError.message,
        })
      }
    }

    return { success: errors.length === 0, changes: results, errors, warnings }
  }

  async verifySuccess(_context: StepContext): Promise<boolean> {
    try {
      const configFile = file(BAZARR_CONFIG_PATH)
      if (!(await configFile.exists())) return false
      const content = await configFile.text()
      return /apikey:\s*.+/.test(content)
    } catch {
      return false
    }
  }

  private async writeBazarrConfig(context: StepContext): Promise<void> {
    const apiKey =
      context.config.services?.bazarr?.apiKey ||
      context.config.app?.bazarr?.apiKey ||
      context.config.app?.apiKey
    if (!apiKey) {
      throw new Error('API key is required to write Bazarr config.yaml')
    }

    const postgresHost = context.config.postgres.host
    const postgresPort = context.config.postgres.port
    const postgresPassword = context.config.postgres.password

    const yamlQuote = (v: string) => `'${v.replace(/'/g, "''")}'`

    const configYaml = `auth:
  apikey: ${yamlQuote(apiKey)}
  password: ''
  type: null
  username: ''
general:
  ip: 0.0.0.0
  port: 6767
  base_url: /
postgresql:
  enabled: true
  host: ${yamlQuote(postgresHost)}
  port: ${postgresPort}
  database: bazarr
  username: bazarr
  password: ${yamlQuote(postgresPassword)}
`

    // Ensure directory exists
    const dir = BAZARR_CONFIG_PATH.substring(0, BAZARR_CONFIG_PATH.lastIndexOf('/'))
    const { mkdirSync } = await import('node:fs')
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // Directory may already exist
    }

    await write(BAZARR_CONFIG_PATH, configYaml)
    context.logger.info('Wrote Bazarr config.yaml', {
      path: BAZARR_CONFIG_PATH,
      apiKey: `${apiKey.slice(0, 8)}...`,
      postgresHost,
    })
  }
}
