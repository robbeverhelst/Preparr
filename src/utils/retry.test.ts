import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { withRetry } from './retry'

describe('withRetry', () => {
  beforeEach(() => {
    // Reset any mocks
    mock.restore()
  })

  test('succeeds on first attempt', async () => {
    const mockFn = mock(() => Promise.resolve('success'))

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 100,
      operation: 'test-operation',
    })

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  test('retries on failure and eventually succeeds', async () => {
    let callCount = 0
    const mockFn = mock(() => {
      callCount++
      if (callCount < 3) {
        return Promise.reject(new Error('temporary failure'))
      }
      return Promise.resolve('success')
    })

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 10, // Short delay for tests
      operation: 'test-operation',
    })

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(3)
  })

  test('fails after max attempts', async () => {
    const mockFn = mock(() => Promise.reject(new Error('persistent failure')))

    await expect(
      withRetry(mockFn, {
        maxAttempts: 2,
        delayMs: 10,
        operation: 'test-operation',
      }),
    ).rejects.toThrow('persistent failure')

    expect(mockFn).toHaveBeenCalledTimes(2)
  })

  test('respects delay between retries', async () => {
    const mockFn = mock(() => Promise.reject(new Error('failure')))
    const startTime = Date.now()

    try {
      await withRetry(mockFn, {
        maxAttempts: 2,
        delayMs: 50,
        operation: 'test-operation',
      })
    } catch {
      // Expected to fail
    }

    const duration = Date.now() - startTime
    expect(duration).toBeGreaterThan(40) // Account for some timing variance
  })
})
