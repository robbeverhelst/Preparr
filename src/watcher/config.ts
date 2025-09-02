import { watch } from 'node:fs'
import { ConfigLoader } from '@/config/loader'
import type { ServarrApplicationConfig } from '@/config/schema'
import { logger } from '@/utils/logger'

export class ConfigWatcher {
  private configPath: string
  private onChange: (config: ServarrApplicationConfig) => Promise<void>
  private watcher: ReturnType<typeof watch> | null = null
  private isWatching = false
  private configLoader: ConfigLoader

  constructor(configPath: string, onChange: (config: ServarrApplicationConfig) => Promise<void>) {
    this.configPath = configPath
    this.onChange = onChange
    this.configLoader = new ConfigLoader()
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
            const config = await this.loadConfig()
            if (config) {
              await this.onChange(config)
            }
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

  async loadConfig(): Promise<ServarrApplicationConfig | null> {
    try {
      return await this.configLoader.loadConfig(this.configPath)
    } catch (error) {
      logger.error('Failed to load config file', { path: this.configPath, error })
      return null
    }
  }
}
