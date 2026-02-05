/**
 * E2E Tests: Bazarr Integration
 * Verifies PrepArr correctly configures Bazarr with Sonarr/Radarr integration
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import {
  callBazarrApi,
  getInitContainerExitCode,
  HEALTH_PORTS,
  NAMESPACE,
  waitForBazarrApi,
} from './utils'

const BAZARR_API_KEY = 'e2e33333333333333333333333333333'

describe('Bazarr Integration', () => {
  beforeAll(async () => {
    // Wait for Bazarr API to be ready
    await waitForBazarrApi('bazarr', { timeoutMs: 120000 })
  })

  describe('PrepArr Init Container', () => {
    test('Bazarr init container completes successfully', async () => {
      const exitCode = await getInitContainerExitCode('app=bazarr', 'preparr-init')
      expect(exitCode).toBe(0)
    })
  })

  describe('Bazarr API Access', () => {
    test('Bazarr API is accessible with configured API key', async () => {
      const result = await callBazarrApi<{ status: string }>('bazarr', '/system/status', {
        apiKey: BAZARR_API_KEY,
      })

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
    })

    test('Bazarr health endpoint responds', async () => {
      const result = await callBazarrApi<{ status: string }>('bazarr', '/system/health', {
        apiKey: BAZARR_API_KEY,
      })

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })

    test('Bazarr ping endpoint responds', async () => {
      const result = await callBazarrApi<{ status: string }>('bazarr', '/system/ping', {
        apiKey: BAZARR_API_KEY,
      })

      expect(result.ok || result.status === 404).toBe(true) // May not exist on all versions
    })
  })

  describe('Sonarr Integration', () => {
    test('Bazarr has Sonarr integration configured', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()

      const sonarrSettings = result.data?.sonarr as Record<string, unknown> | undefined
      expect(sonarrSettings).toBeDefined()
      expect(sonarrSettings?.enabled).toBe(true)
      expect(sonarrSettings?.ip).toBeDefined()
      expect(sonarrSettings?.apikey).toBeDefined()
    })

    test('Bazarr Sonarr URL is correctly set', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      const sonarrSettings = result.data?.sonarr as Record<string, unknown> | undefined
      expect(sonarrSettings?.ip).toContain('sonarr')
    })

    test('Bazarr Sonarr API key is configured', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      const sonarrSettings = result.data?.sonarr as Record<string, unknown> | undefined
      expect(sonarrSettings?.apikey).toBeDefined()
      expect(typeof sonarrSettings?.apikey).toBe('string')
      expect((sonarrSettings?.apikey as string).length).toBeGreaterThan(0)
    })
  })

  describe('Radarr Integration', () => {
    test('Bazarr has Radarr integration configured', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      expect(result.ok).toBe(true)

      const radarrSettings = result.data?.radarr as Record<string, unknown> | undefined
      expect(radarrSettings).toBeDefined()
      expect(radarrSettings?.enabled).toBe(true)
      expect(radarrSettings?.ip).toBeDefined()
      expect(radarrSettings?.apikey).toBeDefined()
    })

    test('Bazarr Radarr URL is correctly set', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      const radarrSettings = result.data?.radarr as Record<string, unknown> | undefined
      expect(radarrSettings?.ip).toContain('radarr')
    })

    test('Bazarr Radarr API key is configured', async () => {
      const result = await callBazarrApi<Record<string, unknown>>('bazarr', '/system/settings', {
        apiKey: BAZARR_API_KEY,
      })

      const radarrSettings = result.data?.radarr as Record<string, unknown> | undefined
      expect(radarrSettings?.apikey).toBeDefined()
      expect(typeof radarrSettings?.apikey).toBe('string')
      expect((radarrSettings?.apikey as string).length).toBeGreaterThan(0)
    })
  })

  describe('Language Configuration', () => {
    test('Bazarr has languages configured', async () => {
      const result = await callBazarrApi<{ language?: Array<{ code: string }> }>(
        'bazarr',
        '/languages',
        { apiKey: BAZARR_API_KEY },
      )

      expect(result.ok).toBe(true)
      expect(result.data?.language).toBeDefined()
      expect(Array.isArray(result.data?.language)).toBe(true)
    })

    test('Bazarr has English language available', async () => {
      const result = await callBazarrApi<{ language?: Array<{ code: string }> }>(
        'bazarr',
        '/languages',
        { apiKey: BAZARR_API_KEY },
      )

      const languages = result.data?.language || []
      const englishLang = languages.find((l) => l.code === 'en')
      expect(englishLang).toBeDefined()
    })

    test('Bazarr has Dutch language available', async () => {
      const result = await callBazarrApi<{ language?: Array<{ code: string }> }>(
        'bazarr',
        '/languages',
        { apiKey: BAZARR_API_KEY },
      )

      const languages = result.data?.language || []
      const dutchLang = languages.find((l) => l.code === 'nl')
      expect(dutchLang).toBeDefined()
    })
  })

  describe('Provider Configuration', () => {
    test('Bazarr has providers list available', async () => {
      const result = await callBazarrApi<{ provider?: Array<{ name: string }> }>(
        'bazarr',
        '/providers',
        { apiKey: BAZARR_API_KEY },
      )

      expect(result.ok).toBe(true)
      expect(result.data?.provider).toBeDefined()
      expect(Array.isArray(result.data?.provider)).toBe(true)
    })

    test('Bazarr has OpenSubtitles provider', async () => {
      const result = await callBazarrApi<{ provider?: Array<{ name: string }> }>(
        'bazarr',
        '/providers',
        { apiKey: BAZARR_API_KEY },
      )

      const providers = result.data?.provider || []
      const opensubtitles = providers.find((p) => p.name === 'opensubtitlescom')
      expect(opensubtitles).toBeDefined()
    })
  })

  describe('Subtitle Management', () => {
    test('Bazarr can retrieve series metadata', async () => {
      const result = await callBazarrApi<{ data?: Array<{ sonarrSeriesId?: number }> }>(
        'bazarr',
        '/series',
        { apiKey: BAZARR_API_KEY },
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data?.data || result.data)).toBe(true)
    })

    test('Bazarr can retrieve movies metadata', async () => {
      const result = await callBazarrApi<{ data?: Array<{ radarrId?: number }> }>(
        'bazarr',
        '/movies',
        { apiKey: BAZARR_API_KEY },
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data?.data || result.data)).toBe(true)
    })
  })

  describe('PrepArr Health', () => {
    test('PrepArr health check passes for Bazarr', async () => {
      const result = await fetch(
        `http://bazarr.${NAMESPACE}.svc.cluster.local:${HEALTH_PORTS.bazarr}/health`,
      )
      expect(result.ok).toBe(true)

      const health = (await result.json()) as Record<string, unknown>
      expect(health.status).toBe('healthy')
    })
  })
})
