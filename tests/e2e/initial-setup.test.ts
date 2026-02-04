/**
 * E2E Tests: Initial Setup Flow
 * Verifies PrepArr correctly initializes fresh Servarr instances
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import {
  callPreparrHealth,
  callServarrApi,
  getInitContainerExitCode,
  waitForServarrApi,
} from './utils'

describe('Initial Setup Flow', () => {
  beforeAll(async () => {
    // Wait for APIs to be ready
    await Promise.all([
      waitForServarrApi('sonarr', { timeoutMs: 120000 }),
      waitForServarrApi('radarr', { timeoutMs: 120000 }),
    ])
  })

  describe('PrepArr Init Container', () => {
    test('Sonarr init container completes successfully', async () => {
      const exitCode = await getInitContainerExitCode('app=sonarr', 'preparr-init')
      expect(exitCode).toBe(0)
    })

    test('Radarr init container completes successfully', async () => {
      const exitCode = await getInitContainerExitCode('app=radarr', 'preparr-init')
      expect(exitCode).toBe(0)
    })

    test('Prowlarr init container completes successfully', async () => {
      const exitCode = await getInitContainerExitCode('app=prowlarr', 'preparr-init')
      expect(exitCode).toBe(0)
    })
  })

  describe('Servarr API Access', () => {
    test('Sonarr API is accessible with configured API key', async () => {
      const result = await callServarrApi<{ version: string }>('sonarr', '/api/v3/system/status')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.version).toBeDefined()
    })

    test('Radarr API is accessible with configured API key', async () => {
      const result = await callServarrApi<{ version: string }>('radarr', '/api/v3/system/status')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.version).toBeDefined()
    })

    test('Prowlarr API is accessible with configured API key', async () => {
      const result = await callServarrApi<{ version: string }>('prowlarr', '/api/v1/system/status')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.version).toBeDefined()
    })
  })

  describe('Root Folders', () => {
    test('Sonarr has /tv root folder configured', async () => {
      const result = await callServarrApi<Array<{ path: string }>>('sonarr', '/api/v3/rootfolder')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const tvFolder = result.data?.find((f) => f.path === '/tv')
      expect(tvFolder).toBeDefined()
    })

    test('Radarr has /movies root folder configured', async () => {
      const result = await callServarrApi<Array<{ path: string }>>('radarr', '/api/v3/rootfolder')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const moviesFolder = result.data?.find((f) => f.path === '/movies')
      expect(moviesFolder).toBeDefined()
    })
  })

  describe('Quality Profiles', () => {
    test('Sonarr has HD - 1080p quality profile', async () => {
      const result = await callServarrApi<Array<{ name: string }>>(
        'sonarr',
        '/api/v3/qualityprofile',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const hdProfile = result.data?.find((p) => p.name === 'HD - 1080p')
      expect(hdProfile).toBeDefined()
    })

    test('Radarr has HD - 1080p quality profile', async () => {
      const result = await callServarrApi<Array<{ name: string }>>(
        'radarr',
        '/api/v3/qualityprofile',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const hdProfile = result.data?.find((p) => p.name === 'HD - 1080p')
      expect(hdProfile).toBeDefined()
    })
  })

  describe('Download Clients', () => {
    test('Sonarr has qBittorrent download client configured', async () => {
      const result = await callServarrApi<Array<{ name: string; implementation: string }>>(
        'sonarr',
        '/api/v3/downloadclient',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const qbit = result.data?.find(
        (dc) => dc.name === 'qBittorrent' && dc.implementation === 'QBittorrent',
      )
      expect(qbit).toBeDefined()
    })

    test('Radarr has qBittorrent download client configured', async () => {
      const result = await callServarrApi<Array<{ name: string; implementation: string }>>(
        'radarr',
        '/api/v3/downloadclient',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)

      const qbit = result.data?.find(
        (dc) => dc.name === 'qBittorrent' && dc.implementation === 'QBittorrent',
      )
      expect(qbit).toBeDefined()
    })
  })

  describe('PrepArr Sidecar Health', () => {
    test('Sonarr PrepArr sidecar is healthy', async () => {
      const result = await callPreparrHealth('sonarr', '/health/live')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })

    test('Radarr PrepArr sidecar is healthy', async () => {
      const result = await callPreparrHealth('radarr', '/health/live')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })

    test('Prowlarr PrepArr sidecar is healthy', async () => {
      const result = await callPreparrHealth('prowlarr', '/health/live')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
    })
  })
})
