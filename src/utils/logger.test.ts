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

  logger.info('test message', { key: 'value' })

  expect(logs).toHaveLength(1)
  expect(logs[0]).toContain('test message')
  expect(logs[0]).toContain('key')
  expect(logs[0]).toContain('value')

  console.log = originalLog
  console.warn = originalWarn
  console.error = originalError
})
