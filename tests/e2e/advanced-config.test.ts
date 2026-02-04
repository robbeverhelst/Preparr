/**
 * E2E Tests: Advanced Configuration
 * Verifies PrepArr correctly configures custom formats, release profiles,
 * naming config, media management, and quality definitions
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { callServarrApi, waitForServarrApi } from './utils'

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
  required: string | null
  ignored: string | null
  preferred: Array<{ key: string; value: number }>
  includePreferredWhenRenaming: boolean
  indexerId: number
  tags: number[]
}

interface NamingConfig {
  id: number
  renameEpisodes?: boolean
  renameMovies?: boolean
  replaceIllegalCharacters: boolean
  standardEpisodeFormat?: string
  movieFormat?: string
  movieFolderFormat?: string
  [key: string]: unknown
}

interface MediaManagementConfig {
  id: number
  importExtraFiles: boolean
  extraFileExtensions: string
  downloadPropersAndRepacks: string
  deleteEmptyFolders: boolean
  copyUsingHardlinks: boolean
  recycleBin: string
  recycleBinCleanupDays: number
  [key: string]: unknown
}

interface QualityDefinition {
  id: number
  quality: { id: number; name: string }
  title: string
  minSize: number
  maxSize: number
  preferredSize: number
}

describe('Advanced Configuration', () => {
  beforeAll(async () => {
    // Wait for APIs to be ready
    await Promise.all([
      waitForServarrApi('sonarr', { timeoutMs: 120000 }),
      waitForServarrApi('radarr', { timeoutMs: 120000 }),
    ])
  })

  describe('Custom Formats API', () => {
    test('Sonarr custom format API is accessible', async () => {
      const result = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
    })

    test('Radarr custom format API is accessible', async () => {
      const result = await callServarrApi<CustomFormat[]>('radarr', '/api/v3/customformat')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
    })

    // Custom format creation tests - requires E2E config with customFormats defined
    test.skip('Sonarr has configured custom formats', async () => {
      const result = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBeGreaterThan(0)
    })

    test.skip('Radarr has configured custom formats', async () => {
      const result = await callServarrApi<CustomFormat[]>('radarr', '/api/v3/customformat')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBeGreaterThan(0)
    })

    test('Sonarr custom format CRUD lifecycle works', async () => {
      // Create a test custom format
      const testFormat = {
        name: 'E2E Test Format',
        includeCustomFormatWhenRenaming: false,
        specifications: [
          {
            name: 'Test Spec',
            implementation: 'ReleaseTitleSpecification',
            negate: false,
            required: false,
            fields: [{ name: 'value', value: 'e2e-test-marker' }],
          },
        ],
      }

      const createResult = await callServarrApi<CustomFormat>('sonarr', '/api/v3/customformat', {
        method: 'POST',
        body: JSON.stringify(testFormat),
      })

      expect(createResult.ok).toBe(true)
      expect(createResult.data).toBeDefined()
      expect(createResult.data?.name).toBe('E2E Test Format')
      expect(createResult.data?.id).toBeDefined()

      const formatId = createResult.data?.id

      // Verify it exists
      const getResult = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')
      expect(getResult.data?.some((cf) => cf.name === 'E2E Test Format')).toBe(true)

      // Update it
      const updateResult = await callServarrApi<CustomFormat>(
        'sonarr',
        `/api/v3/customformat/${formatId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...createResult.data,
            includeCustomFormatWhenRenaming: true,
          }),
        },
      )

      expect(updateResult.ok).toBe(true)
      expect(updateResult.data?.includeCustomFormatWhenRenaming).toBe(true)

      // Delete it
      const deleteResult = await callServarrApi('sonarr', `/api/v3/customformat/${formatId}`, {
        method: 'DELETE',
      })

      expect(deleteResult.ok).toBe(true)

      // Verify it's gone
      const finalResult = await callServarrApi<CustomFormat[]>('sonarr', '/api/v3/customformat')
      expect(finalResult.data?.some((cf) => cf.name === 'E2E Test Format')).toBe(false)
    })

    test('Radarr custom format CRUD lifecycle works', async () => {
      // Create a test custom format
      const testFormat = {
        name: 'E2E Test Format',
        includeCustomFormatWhenRenaming: false,
        specifications: [
          {
            name: 'Test Spec',
            implementation: 'ReleaseTitleSpecification',
            negate: false,
            required: false,
            fields: [{ name: 'value', value: 'e2e-test-marker' }],
          },
        ],
      }

      const createResult = await callServarrApi<CustomFormat>('radarr', '/api/v3/customformat', {
        method: 'POST',
        body: JSON.stringify(testFormat),
      })

      expect(createResult.ok).toBe(true)
      expect(createResult.data?.name).toBe('E2E Test Format')

      const formatId = createResult.data?.id

      // Delete it (cleanup)
      const deleteResult = await callServarrApi('radarr', `/api/v3/customformat/${formatId}`, {
        method: 'DELETE',
      })

      expect(deleteResult.ok).toBe(true)
    })
  })

  describe('Release Profiles API (Sonarr only)', () => {
    test('Sonarr release profile API is accessible', async () => {
      const result = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
    })

    // Release profile creation tests - requires E2E config with releaseProfiles defined
    test.skip('Sonarr has configured release profiles', async () => {
      const result = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.length).toBeGreaterThan(0)
    })

    test('Sonarr release profile CRUD lifecycle works', async () => {
      // Create a test release profile
      const testProfile = {
        name: 'E2E Test Profile',
        enabled: true,
        required: null,
        ignored: 'cam,ts,hdts',
        preferred: [
          { key: 'repack|proper', value: 5 },
          { key: 'remux', value: 100 },
        ],
        includePreferredWhenRenaming: false,
        indexerId: 0,
        tags: [],
      }

      const createResult = await callServarrApi<ReleaseProfile>(
        'sonarr',
        '/api/v3/releaseprofile',
        {
          method: 'POST',
          body: JSON.stringify(testProfile),
        },
      )

      expect(createResult.ok).toBe(true)
      expect(createResult.data).toBeDefined()
      expect(createResult.data?.name).toBe('E2E Test Profile')
      expect(createResult.data?.id).toBeDefined()

      const profileId = createResult.data?.id

      // Verify it exists
      const getResult = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')
      expect(getResult.data?.some((rp) => rp.name === 'E2E Test Profile')).toBe(true)

      // Update it
      const updateResult = await callServarrApi<ReleaseProfile>(
        'sonarr',
        `/api/v3/releaseprofile/${profileId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...createResult.data,
            enabled: false,
          }),
        },
      )

      expect(updateResult.ok).toBe(true)
      expect(updateResult.data?.enabled).toBe(false)

      // Delete it
      const deleteResult = await callServarrApi('sonarr', `/api/v3/releaseprofile/${profileId}`, {
        method: 'DELETE',
      })

      expect(deleteResult.ok).toBe(true)

      // Verify it's gone
      const finalResult = await callServarrApi<ReleaseProfile[]>('sonarr', '/api/v3/releaseprofile')
      expect(finalResult.data?.some((rp) => rp.name === 'E2E Test Profile')).toBe(false)
    })
  })

  describe('Naming Configuration', () => {
    test('Sonarr naming config API is accessible', async () => {
      const result = await callServarrApi<NamingConfig>('sonarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBeDefined()
    })

    test('Radarr naming config API is accessible', async () => {
      const result = await callServarrApi<NamingConfig>('radarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBeDefined()
    })

    test('Sonarr naming config has expected structure', async () => {
      const result = await callServarrApi<NamingConfig>('sonarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      // Sonarr-specific fields
      expect(typeof result.data?.renameEpisodes).toBe('boolean')
      expect(typeof result.data?.replaceIllegalCharacters).toBe('boolean')
    })

    test('Radarr naming config has expected structure', async () => {
      const result = await callServarrApi<NamingConfig>('radarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      // Radarr-specific fields
      expect(typeof result.data?.renameMovies).toBe('boolean')
      expect(typeof result.data?.replaceIllegalCharacters).toBe('boolean')
    })

    // Naming config update tests - requires E2E config with naming defined
    test.skip('Sonarr naming config matches desired state', async () => {
      const result = await callServarrApi<NamingConfig>('sonarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.data?.renameEpisodes).toBe(true)
    })

    test.skip('Radarr naming config matches desired state', async () => {
      const result = await callServarrApi<NamingConfig>('radarr', '/api/v3/config/naming')

      expect(result.ok).toBe(true)
      expect(result.data?.renameMovies).toBe(true)
    })
  })

  describe('Media Management Configuration', () => {
    test('Sonarr media management config API is accessible', async () => {
      const result = await callServarrApi<MediaManagementConfig>(
        'sonarr',
        '/api/v3/config/mediamanagement',
      )

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBeDefined()
    })

    test('Radarr media management config API is accessible', async () => {
      const result = await callServarrApi<MediaManagementConfig>(
        'radarr',
        '/api/v3/config/mediamanagement',
      )

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBeDefined()
    })

    test('Sonarr media management config has expected structure', async () => {
      const result = await callServarrApi<MediaManagementConfig>(
        'sonarr',
        '/api/v3/config/mediamanagement',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(typeof result.data?.importExtraFiles).toBe('boolean')
      expect(typeof result.data?.copyUsingHardlinks).toBe('boolean')
      expect(typeof result.data?.deleteEmptyFolders).toBe('boolean')
      expect(typeof result.data?.recycleBinCleanupDays).toBe('number')
    })

    test('Radarr media management config has expected structure', async () => {
      const result = await callServarrApi<MediaManagementConfig>(
        'radarr',
        '/api/v3/config/mediamanagement',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(typeof result.data?.importExtraFiles).toBe('boolean')
      expect(typeof result.data?.copyUsingHardlinks).toBe('boolean')
      expect(typeof result.data?.deleteEmptyFolders).toBe('boolean')
    })

    // Media management update tests - requires E2E config with mediaManagement defined
    test.skip('Sonarr media management matches desired state', async () => {
      const result = await callServarrApi<MediaManagementConfig>(
        'sonarr',
        '/api/v3/config/mediamanagement',
      )

      expect(result.ok).toBe(true)
      expect(result.data?.importExtraFiles).toBe(true)
      expect(result.data?.extraFileExtensions).toBe('srt,sub,idx')
    })
  })

  describe('Quality Definitions', () => {
    test('Sonarr quality definition API is accessible', async () => {
      const result = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data?.length).toBeGreaterThan(0)
    })

    test('Radarr quality definition API is accessible', async () => {
      const result = await callServarrApi<QualityDefinition[]>(
        'radarr',
        '/api/v3/qualitydefinition',
      )

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data?.length).toBeGreaterThan(0)
    })

    test('Sonarr quality definitions have expected structure', async () => {
      const result = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )

      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()

      const firstDef = result.data?.[0]
      expect(firstDef.id).toBeDefined()
      expect(firstDef.quality).toBeDefined()
      expect(firstDef.quality.id).toBeDefined()
      expect(firstDef.quality.name).toBeDefined()
      expect(typeof firstDef.minSize).toBe('number')
      expect(typeof firstDef.maxSize).toBe('number')
      expect(typeof firstDef.preferredSize).toBe('number')
    })

    test('Sonarr has Bluray-1080p quality definition', async () => {
      const result = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )

      expect(result.ok).toBe(true)
      const bluray1080p = result.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
      expect(bluray1080p).toBeDefined()
      expect(bluray1080p?.minSize).toBeGreaterThanOrEqual(0)
    })

    test('Radarr has Bluray-1080p quality definition', async () => {
      const result = await callServarrApi<QualityDefinition[]>(
        'radarr',
        '/api/v3/qualitydefinition',
      )

      expect(result.ok).toBe(true)
      const bluray1080p = result.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
      expect(bluray1080p).toBeDefined()
      expect(bluray1080p?.minSize).toBeGreaterThanOrEqual(0)
    })

    test('Sonarr quality definition can be updated and restored', async () => {
      // Get current definitions
      const initialResult = await callServarrApi<QualityDefinition[]>(
        'sonarr',
        '/api/v3/qualitydefinition',
      )
      expect(initialResult.ok).toBe(true)

      const bluray1080p = initialResult.data?.find((qd) => qd.quality.name === 'Bluray-1080p')
      expect(bluray1080p).toBeDefined()

      const originalMinSize = bluray1080p?.minSize
      const originalMaxSize = bluray1080p?.maxSize
      const originalPreferredSize = bluray1080p?.preferredSize

      // Update it - must respect constraint: minSize <= preferredSize <= maxSize
      const updateResult = await callServarrApi<QualityDefinition>(
        'sonarr',
        `/api/v3/qualitydefinition/${bluray1080p?.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...bluray1080p,
            minSize: 5,
            preferredSize: 30,
            maxSize: 100,
          }),
        },
      )

      expect(updateResult.ok).toBe(true)
      expect(updateResult.data?.minSize).toBe(5)
      expect(updateResult.data?.preferredSize).toBe(30)
      expect(updateResult.data?.maxSize).toBe(100)

      // Restore original values
      const restoreResult = await callServarrApi<QualityDefinition>(
        'sonarr',
        `/api/v3/qualitydefinition/${bluray1080p?.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...bluray1080p,
            minSize: originalMinSize,
            preferredSize: originalPreferredSize,
            maxSize: originalMaxSize,
          }),
        },
      )

      expect(restoreResult.ok).toBe(true)
      expect(restoreResult.data?.minSize).toBe(originalMinSize)
      expect(restoreResult.data?.maxSize).toBe(originalMaxSize)
    })
  })
})
