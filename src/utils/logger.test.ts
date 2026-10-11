import { expect, test } from 'bun:test'
import { logger } from './logger'

test('logger exports all methods', () => {
  expect(typeof logger.debug).toBe('function')
  expect(typeof logger.info).toBe('function')
  expect(typeof logger.warn).toBe('function')
  expect(typeof logger.error).toBe('function')
})

test('logger handles metadata correctly', () => {
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  const logs: string[] = []
  console.log = (msg: string) => logs.push(msg)
  console.warn = (msg: string) => logs.push(msg)
  console.error = (msg: string) => logs.push(msg)

  logger.error('test message', { key: 'value' })

  expect(logs).toHaveLength(1)
  expect(logs[0]).toContain('test message')
  expect(logs[0]).toContain('key')
  expect(logs[0]).toContain('value')

  console.log = originalLog
  console.warn = originalWarn
  console.error = originalError
})

test('logger serializes Error values in metadata', () => {
  const originalError = console.error
  const logs: string[] = []
  console.error = (msg: string) => logs.push(msg)

  try {
    logger.error('operation failed', {
      error: Object.assign(new Error('boom'), { code: 'ECONNREFUSED' }),
      nested: { cause: new TypeError('bad') },
    })
  } finally {
    console.error = originalError
  }

  expect(logs).toHaveLength(1)
  const entry = JSON.parse(logs[0] as string)
  expect(entry.error.message).toBe('boom')
  expect(entry.error.name).toBe('Error')
  expect(entry.error.stack).toContain('boom')
  expect(entry.error.code).toBe('ECONNREFUSED')
  expect(entry.nested.cause.message).toBe('bad')
  expect(entry.nested.cause.name).toBe('TypeError')
})
