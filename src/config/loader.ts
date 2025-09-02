import { logger } from '@/utils/logger'
import { type ServarrApplicationConfig, ServarrApplicationConfigSchema } from './schema'

export class ConfigLoader {
  async loadConfig(filePath: string): Promise<ServarrApplicationConfig> {
    try {
      logger.debug('Loading configuration file...', { filePath })

      const file = Bun.file(filePath)
      const exists = await file.exists()

      if (!exists) {
        logger.warn('Configuration file does not exist, using empty config', { filePath })
        return ServarrApplicationConfigSchema.parse({})
      }

      const content = await file.text()

      if (content.trim() === '') {
        logger.warn('Configuration file is empty, using empty config', { filePath })
        return ServarrApplicationConfigSchema.parse({})
      }

      // Parse YAML content
      let configData: unknown

      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        // For now, we'll parse as JSON until we add a YAML parser
        // In production, we should add a YAML parser library
        try {
          configData = JSON.parse(content)
        } catch (jsonError) {
          logger.error('Failed to parse configuration as JSON (YAML parser not implemented)', {
            filePath,
            error: jsonError,
          })
          throw new Error('YAML parsing not yet implemented. Use JSON format for now.')
        }
      } else {
        configData = JSON.parse(content)
      }

      const config = ServarrApplicationConfigSchema.parse(configData)

      logger.info('Configuration loaded successfully', {
        filePath,
        rootFolders: config.rootFolders.length,
        qualityProfiles: config.qualityProfiles.length,
        indexers: config.indexers.length,
        downloadClients: config.downloadClients.length,
      })

      return config
    } catch (error) {
      logger.error('Failed to load configuration', { filePath, error })
      throw error
    }
  }

  validateConfig(config: unknown): ServarrApplicationConfig {
    try {
      return ServarrApplicationConfigSchema.parse(config)
    } catch (error) {
      logger.error('Configuration validation failed', { error })
      throw error
    }
  }
}
