/**
 * E2E Tests: Configuration Drift Detection
 * Verifies PrepArr detects and corrects configuration changes
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { callServarrApi, waitForCondition, waitForServarrApi } from './utils'

// Reconciliation interval is 15s in E2E values, wait up to 45s for drift correction
const DRIFT_CORRECTION_TIMEOUT = 45000

interface QualityProfile {
  id: number
  name: string
}

interface DownloadClient {
  id: number
  name: string
  implementation: string
  enable: boolean
  fields: Array<{ name: string; value: unknown }>
}

interface RootFolder {
  id: number
  path: string
}

describe('Configuration Drift Detection', () => {
  beforeAll(async () => {
    // Wait for APIs to be ready
    await Promise.all([
      waitForServarrApi('sonarr', { timeoutMs: 120000 }),
      waitForServarrApi('radarr', { timeoutMs: 120000 }),
    ])
  })

  describe('Quality Profile Drift', () => {
    test('PrepArr recreates deleted quality profile in Sonarr', async () => {
      // Get current quality profiles
      const initialResult = await callServarrApi<QualityProfile[]>(
        'sonarr',
        '/api/v3/qualityprofile',
      )
      expect(initialResult.ok).toBe(true)

      const hdProfile = initialResult.data?.find((p) => p.name === 'HD - 1080p')
      expect(hdProfile).toBeDefined()

      // Delete the profile
      const deleteResult = await callServarrApi(
        'sonarr',
        `/api/v3/qualityprofile/${hdProfile?.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResult.ok).toBe(true)

      // Verify it's deleted
      const afterDeleteResult = await callServarrApi<QualityProfile[]>(
        'sonarr',
        '/api/v3/qualityprofile',
      )
      expect(afterDeleteResult.data?.find((p) => p.name === 'HD - 1080p')).toBeUndefined()

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<QualityProfile[]>('sonarr', '/api/v3/qualityprofile')
          return result.data?.some((p) => p.name === 'HD - 1080p') ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'quality profile to be recreated',
        },
      )

      // Verify profile exists again
      const finalResult = await callServarrApi<QualityProfile[]>('sonarr', '/api/v3/qualityprofile')
      expect(finalResult.data?.find((p) => p.name === 'HD - 1080p')).toBeDefined()
    })

    test('PrepArr recreates deleted quality profile in Radarr', async () => {
      // Get current quality profiles
      const initialResult = await callServarrApi<QualityProfile[]>(
        'radarr',
        '/api/v3/qualityprofile',
      )
      expect(initialResult.ok).toBe(true)

      const hdProfile = initialResult.data?.find((p) => p.name === 'HD - 1080p')
      expect(hdProfile).toBeDefined()

      // Delete the profile
      const deleteResult = await callServarrApi(
        'radarr',
        `/api/v3/qualityprofile/${hdProfile?.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResult.ok).toBe(true)

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<QualityProfile[]>('radarr', '/api/v3/qualityprofile')
          return result.data?.some((p) => p.name === 'HD - 1080p') ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'quality profile to be recreated',
        },
      )

      // Verify profile exists again
      const finalResult = await callServarrApi<QualityProfile[]>('radarr', '/api/v3/qualityprofile')
      expect(finalResult.data?.find((p) => p.name === 'HD - 1080p')).toBeDefined()
    })
  })

  describe('Root Folder Drift', () => {
    test('PrepArr recreates deleted root folder in Sonarr', async () => {
      // Get current root folders
      const initialResult = await callServarrApi<RootFolder[]>('sonarr', '/api/v3/rootfolder')
      expect(initialResult.ok).toBe(true)

      const tvFolder = initialResult.data?.find((f) => f.path === '/tv')
      expect(tvFolder).toBeDefined()

      // Delete the root folder
      const deleteResult = await callServarrApi('sonarr', `/api/v3/rootfolder/${tvFolder?.id}`, {
        method: 'DELETE',
      })
      expect(deleteResult.ok).toBe(true)

      // Verify it's deleted
      const afterDeleteResult = await callServarrApi<RootFolder[]>('sonarr', '/api/v3/rootfolder')
      expect(afterDeleteResult.data?.find((f) => f.path === '/tv')).toBeUndefined()

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<RootFolder[]>('sonarr', '/api/v3/rootfolder')
          return result.data?.some((f) => f.path === '/tv') ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'root folder to be recreated',
        },
      )

      // Verify folder exists again
      const finalResult = await callServarrApi<RootFolder[]>('sonarr', '/api/v3/rootfolder')
      expect(finalResult.data?.find((f) => f.path === '/tv')).toBeDefined()
    })
  })

  describe('Download Client Drift', () => {
    test('PrepArr restores disabled download client in Sonarr', async () => {
      // Get current download clients
      const initialResult = await callServarrApi<DownloadClient[]>(
        'sonarr',
        '/api/v3/downloadclient',
      )
      expect(initialResult.ok).toBe(true)

      const qbit = initialResult.data?.find((dc) => dc.name === 'qBittorrent')
      expect(qbit).toBeDefined()
      expect(qbit?.enable).toBe(true)

      // Disable the download client
      const updateResult = await callServarrApi('sonarr', `/api/v3/downloadclient/${qbit?.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...qbit, enable: false }),
      })
      expect(updateResult.ok).toBe(true)

      // Verify it's disabled
      const afterUpdateResult = await callServarrApi<DownloadClient[]>(
        'sonarr',
        '/api/v3/downloadclient',
      )
      const disabledQbit = afterUpdateResult.data?.find((dc) => dc.name === 'qBittorrent')
      expect(disabledQbit?.enable).toBe(false)

      // Wait for PrepArr to re-enable it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<DownloadClient[]>('sonarr', '/api/v3/downloadclient')
          const client = result.data?.find((dc) => dc.name === 'qBittorrent')
          return client?.enable === true
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'download client to be re-enabled',
        },
      )

      // Verify client is enabled again
      const finalResult = await callServarrApi<DownloadClient[]>('sonarr', '/api/v3/downloadclient')
      const enabledQbit = finalResult.data?.find((dc) => dc.name === 'qBittorrent')
      expect(enabledQbit?.enable).toBe(true)
    })

    test('PrepArr recreates deleted download client in Radarr', async () => {
      // Get current download clients
      const initialResult = await callServarrApi<DownloadClient[]>(
        'radarr',
        '/api/v3/downloadclient',
      )
      expect(initialResult.ok).toBe(true)

      const qbit = initialResult.data?.find((dc) => dc.name === 'qBittorrent')
      expect(qbit).toBeDefined()

      // Delete the download client
      const deleteResult = await callServarrApi('radarr', `/api/v3/downloadclient/${qbit?.id}`, {
        method: 'DELETE',
      })
      expect(deleteResult.ok).toBe(true)

      // Verify it's deleted
      const afterDeleteResult = await callServarrApi<DownloadClient[]>(
        'radarr',
        '/api/v3/downloadclient',
      )
      expect(afterDeleteResult.data?.find((dc) => dc.name === 'qBittorrent')).toBeUndefined()

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<DownloadClient[]>('radarr', '/api/v3/downloadclient')
          return result.data?.some((dc) => dc.name === 'qBittorrent') ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'download client to be recreated',
        },
      )

      // Verify client exists again
      const finalResult = await callServarrApi<DownloadClient[]>('radarr', '/api/v3/downloadclient')
      expect(finalResult.data?.find((dc) => dc.name === 'qBittorrent')).toBeDefined()
    })
  })
})
