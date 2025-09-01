import { logger } from '@utils/logger'

function main() {
  logger.info('PrepArr starting...')

  logger.info('PrepArr initialized successfully')
}

try {
  main()
} catch (error) {
  logger.error('Fatal error during startup', { error })
  process.exit(1)
}
