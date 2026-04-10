import type { Mock } from 'bun:test'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { BazarrManager } from './client'

describe('BazarrManager language profile configuration', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test('restarts Bazarr after creating the first language profiles', async () => {
    let restarted = false
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = input.toString()

      if (url.includes('/api/system/languages/profiles')) {
        // After restart, return the created profile to simulate cache reload
        const data = restarted
          ? [{ profileId: 1, name: 'Default', cutoff: 1, items: [], mustContain: '', mustNotContain: '', originalFormat: null, tag: null }]
          : []
        return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
      }

      if (url.includes('/api/system/settings')) {
        return Promise.resolve(new Response('', { status: 204 }))
      }

      if (url.includes('/api/system?action=restart')) {
        restarted = true
        return Promise.resolve(new Response('', { status: 204 }))
      }

      if (url.includes('/api/system/status')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { bazarr_version: '1.5.5' } }), { status: 200 }),
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as Mock<typeof fetch>

    globalThis.fetch = fetchMock as typeof fetch

    const manager = new BazarrManager({
      url: 'http://bazarr:6767',
      apiKey: '0123456789abcdef0123456789abcdef',
    })

    await manager.configureLanguageProfiles([
      {
        name: 'Default',
        cutoff: 1,
        items: [{ language: 'en' }, { language: 'nl', hi: true }],
      },
    ])

    const calledUrls = fetchMock.mock.calls.map(([input]) => input.toString())

    expect(calledUrls).toContain(
      'http://bazarr:6767/api/system?action=restart&apikey=0123456789abcdef0123456789abcdef',
    )
    // After restart, should check that language profiles are available
    expect(calledUrls).toContain(
      'http://bazarr:6767/api/system/languages/profiles?apikey=0123456789abcdef0123456789abcdef',
    )
  })

  test('does not restart Bazarr when language profiles already exist', async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = input.toString()

      if (url.includes('/api/system/languages/profiles')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                profileId: 1,
                name: 'Default',
                cutoff: 1,
                items: [],
                mustContain: '',
                mustNotContain: '',
                originalFormat: null,
                tag: null,
              },
            ]),
            { status: 200 },
          ),
        )
      }

      if (url.includes('/api/system/settings')) {
        return Promise.resolve(new Response('', { status: 204 }))
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as Mock<typeof fetch>

    globalThis.fetch = fetchMock as typeof fetch

    const manager = new BazarrManager({
      url: 'http://bazarr:6767',
      apiKey: '0123456789abcdef0123456789abcdef',
    })

    await manager.configureLanguageProfiles([
      {
        name: 'Default',
        cutoff: 1,
        items: [{ language: 'en' }],
      },
    ])

    const calledUrls = fetchMock.mock.calls.map(([input]) => input.toString())
    expect(calledUrls.some((url) => url.includes('/api/system?action=restart'))).toBe(false)
  })
})
