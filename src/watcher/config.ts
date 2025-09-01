import { watch } from 'node:fs'
import { logger } from '@/utils/logger'

export class ConfigWatcher {
  private configPath: string
  private onChange: () => Promise<void>
  private watcher: ReturnType<typeof watch> | null = null
  private isWatching = false

  constructor(configPath: string, onChange: () => Promise<void>) {
    this.configPath = configPath
    this.onChange = onChange
  }

  async start(): Promise<void> {
    if (this.isWatching) {
      return
    }

    try {
      const file = Bun.file(this.configPath)

      if (!(await file.exists())) {
        logger.warn('Config file does not exist, watching for creation', { path: this.configPath })
      }

      this.watcher = watch(this.configPath, async (eventType, filename) => {
        if (eventType === 'change' || eventType === 'rename') {
          logger.info('Config file changed, triggering reconciliation', {
            path: this.configPath,
            eventType,
            filename,
          })

          try {
            await this.onChange()
          } catch (error) {
            logger.error('Error during config reconciliation', { error })
          }
        }
      })

      this.isWatching = true
      logger.info('Config watcher started', { path: this.configPath })
    } catch (error) {
      logger.error('Failed to start config watcher', { path: this.configPath, error })
      throw error
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.isWatching = false
      logger.info('Config watcher stopped')
    }
  }

  async loadConfig(): Promise<unknown> {
    try {
      const file = Bun.file(this.configPath)

      if (!(await file.exists())) {
        logger.warn('Config file not found', { path: this.configPath })
        return null
      }

      const content = await file.text()

      if (this.configPath.endsWith('.json')) {
        return JSON.parse(content)
      }

      if (this.configPath.endsWith('.yaml') || this.configPath.endsWith('.yml')) {
        throw new Error('YAML parsing not implemented yet - use JSON config for now')
      }

      throw new Error(`Unsupported config file format: ${this.configPath}`)
    } catch (error) {
      logger.error('Failed to load config file', { path: this.configPath, error })
      throw error
    }
  }
}
