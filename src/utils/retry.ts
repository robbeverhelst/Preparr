import { logger } from './logger'

export interface RetryOptions {
  maxAttempts?: number
  delayMs?: number
  operation: string // For logging context
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, operation } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts

      if (isLastAttempt) {
        logger.error(`${operation} failed after ${maxAttempts} attempts`, { error })
        throw error
      }

      logger.warn(`${operation} failed, retrying (${attempt}/${maxAttempts})`, {
        error: error instanceof Error ? error.message : String(error),
        nextRetryInMs: delayMs,
      })

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw new Error('Should never reach here')
}
