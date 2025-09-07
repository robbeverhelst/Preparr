import { describe, expect, test } from 'bun:test'
import { generateApiKey } from './api-key'

describe('generateApiKey', () => {
  test('generates a string', () => {
    const key = generateApiKey()
    expect(typeof key).toBe('string')
  })

  test('generates 32 character hexadecimal string', () => {
    const key = generateApiKey()
    expect(key).toHaveLength(32)
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  test('generates unique keys', () => {
    const key1 = generateApiKey()
    const key2 = generateApiKey()
    expect(key1).not.toBe(key2)
  })

  test('generates multiple unique keys', () => {
    const keys = new Set()
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey())
    }
    expect(keys.size).toBe(100) // All keys should be unique
  })

  test('only contains valid hexadecimal characters', () => {
    const key = generateApiKey()
    const validHex = /^[0-9a-f]+$/
    expect(validHex.test(key)).toBe(true)
  })
})
