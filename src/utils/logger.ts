const logLevel = process.env.LOG_LEVEL || 'info'
const logFormat = process.env.LOG_FORMAT || 'json'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const shouldLog = (level: LogLevel): boolean => {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  return levels[level] >= levels[logLevel as LogLevel]
}

const formatLog = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString()

  if (logFormat === 'json') {
    return JSON.stringify({ timestamp, level, message, ...meta })
  }

  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('debug')) console.log(formatLog('debug', message, meta))
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('info')) console.log(formatLog('info', message, meta))
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('warn')) console.warn(formatLog('warn', message, meta))
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog('error')) console.error(formatLog('error', message, meta))
  },
}
