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

interface CustomFormat {
  id: number
  name: string
  includeCustomFormatWhenRenaming: boolean
  specifications: Array<{
    name: string
    implementation: string
    negate: boolean
    required: boolean
    fields: Array<{ name: string; value: unknown }>
  }>
}

interface ReleaseProfile {
  id: number
  name: string
  enabled: boolean
  preferred: Array<{ key: string; value: number }>
}

interface MediaManagementConfig {
  id: number
  importExtraFiles: boolean
  copyUsingHardlinks: boolean
  [key: string]: unknown
}

interface QualityDefinition {
  id: number
  quality: { id: number; name: string }
  minSize: number
  maxSize: number
  preferredSize: number
}

describe('Configuration Drift Detection', () => {
  beforeAll(async () => {
    // Wait for APIs to be ready
    await Promise.all([
      waitForServarrApi('sonarr', { timeoutMs: 120000 }),
      waitForServarrApi('radarr', { timeoutMs: 120000 }),
    ])
  })

  // Quality profile management is not yet implemented in PrepArr
  describe('Quality Profile Drift', () => {
    test.skip('PrepArr recreates deleted quality profile in Sonarr', async () => {
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

    test.skip('PrepArr recreates deleted quality profile in Radarr', async () => {
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

  // Custom format drift - requires E2E config with customFormats defined
  describe('Custom Format Drift', () => {
    test.skip('PrepArr recreates deleted custom format in Sonarr', async () => {
      // Get current custom formats
      const initialResult = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')
      expect(initialResult.ok).toBe(true)

      // Find a PrepArr-managed custom format (name from E2E config)
      const managedFormat = initialResult.data?.[0]
      expect(managedFormat).toBeDefined()

      const formatName = managedFormat?.name

      // Delete the custom format
      const deleteResult = await callServarrApi(
        'sonarr',
        `/api/v3/customformat/${managedFormat?.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResult.ok).toBe(true)

      // Verify it's deleted
      const afterDeleteResult = await callServarrApi<CustomFormat[]>(
        'sonarr',
        '/api/v3/customformat',
      )
      expect(afterDeleteResult.data?.find((cf) => cf.name === formatName)).toBeUndefined()

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')
          return result.data?.some((cf) => cf.name === formatName) ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'custom format to be recreated',
        },
      )

      // Verify format exists again
      const finalResult = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')
      expect(finalResult.data?.find((cf) => cf.name === formatName)).toBeDefined()
    })

    test.skip('PrepArr recreates deleted custom format in Radarr', async () => {
      // Get current custom formats
      const initialResult = await callServarrApi<CustomFormat[]>('radarr', '/api/v3/customformat')
      expect(initialResult.ok).toBe(true)

      const managedFormat = initialResult.data?.[0]
      expect(managedFormat).toBeDefined()

      const formatName = managedFormat?.name

      // Delete the custom format
      const deleteResult = await callServarrApi(
        'radarr',
        `/api/v3/customformat/${managedFormat?.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResult.ok).toBe(true)

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<CustomFormat[]>('radarr', '/api/v3/customformat')
          return result.data?.some((cf) => cf.name === formatName) ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'custom format to be recreated',
        },
      )

      const finalResult = await callServarrApi<CustomFormat[]>('radarr', '/api/v3/customformat')
      expect(finalResult.data?.find((cf) => cf.name === formatName)).toBeDefined()
    })
  })

  // Release profile drift - requires E2E config with releaseProfiles defined (Sonarr only)
  describe('Release Profile Drift', () => {
    test.skip('PrepArr recreates deleted release profile in Sonarr', async () => {
      // Get current release profiles
      const initialResult = await callServarrApi<ReleaseProfile[]>(
        'sonarr',
        '/api/v3/releaseprofile',
      )
      expect(initialResult.ok).toBe(true)

      const managedProfile = initialResult.data?.[0]
      expect(managedProfile).toBeDefined()

      const profileName = managedProfile?.name

      // Delete the release profile
      const deleteResult = await callServarrApi(
        'sonarr',
        `/api/v3/releaseprofile/${managedProfile?.id}`,
        { method: 'DELETE' },
      )
      expect(deleteResult.ok).toBe(true)

      // Wait for PrepArr to recreate it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')
          return result.data?.some((rp) => rp.name === profileName) ?? false
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'release profile to be recreated',
        },
      )

      const finalResult = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')
      expect(finalResult.data?.find((rp) => rp.name === profileName)).toBeDefined()
    })
  })

  // Media management drift - requires E2E config with mediaManagement defined
  describe('Media Management Drift', () => {
    test.skip('PrepArr restores modified media management settings in Sonarr', async () => {
      // Get current media management config
      const initialResult = await callServarrApi<MediaManagementConfig>(
        'sonarr',
        '/api/v3/config/mediamanagement',
      )
      expect(initialResult.ok).toBe(true)
      expect(initialResult.data).toBeDefined()

      const originalCopyUsingHardlinks = initialResult.data?.copyUsingHardlinks

      // Flip the setting
      const updateResult = await callServarrApi(
        'sonarr',
        `/api/v3/config/mediamanagement/${initialResult.data?.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...initialResult.data,
            copyUsingHardlinks: !originalCopyUsingHardlinks,
          }),
        },
      )
      expect(updateResult.ok).toBe(true)

      // Wait for PrepArr to restore it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<MediaManagementConfig>(
            'sonarr',
            '/api/v3/config/mediamanagement',
          )
          return result.data?.copyUsingHardlinks === originalCopyUsingHardlinks
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'media management config to be restored',
        },
      )

      const finalResult = await callServarrApi<MediaManagementConfig>(
        'sonarr',
        '/api/v3/config/mediamanagement',
      )
      expect(finalResult.data?.copyUsingHardlinks).toBe(originalCopyUsingHardlinks)
    })
  })

  // Quality definition drift - requires E2E config with qualityDefinitions defined
  describe('Quality Definition Drift', () => {
    test.skip('PrepArr restores modified quality definition sizes in Sonarr', async () => {
      // Get current quality definitions
      const initialResult = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )
      expect(initialResult.ok).toBe(true)

      const bluray1080p = initialResult.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
      expect(bluray1080p).toBeDefined()

      const originalMinSize = bluray1080p?.minSize

      // Modify the min size - must respect constraint: minSize <= preferredSize <= maxSize
      const updateResult = await callServarrApi(
        'sonarr',
        `/api/v3/qualitydefinition/${bluray1080p?.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...bluray1080p,
            minSize: (originalMinSize ?? 0) + 1,
          }),
        },
      )
      expect(updateResult.ok).toBe(true)

      // Wait for PrepArr to restore it
      await waitForCondition(
        async () => {
          const result = await callServarrApi<QualityDefinition[]>(
            'sonarr',
            '/api/v3/qualitydefinition',
          )
          const def = result.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
          return def?.minSize === originalMinSize
        },
        {
          timeoutMs: DRIFT_CORRECTION_TIMEOUT,
          intervalMs: 3000,
          description: 'quality definition to be restored',
        },
      )

      const finalResult = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )
      const restoredDef = finalResult.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
      expect(restoredDef?.minSize).toBe(originalMinSize)
    })
  })
})
