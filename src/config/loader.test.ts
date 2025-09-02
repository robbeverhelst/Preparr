import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { ConfigLoader } from './loader'

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader
  const testConfigPath = '/tmp/test-config.json'

  beforeEach(() => {
    configLoader = new ConfigLoader()
    // Clean up any existing test file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath)
    }
  })

  afterEach(() => {
    // Clean up test file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath)
    }
  })

  test('creates ConfigLoader instance', () => {
    expect(configLoader).toBeDefined()
    expect(configLoader).toBeInstanceOf(ConfigLoader)
  })

  test('loads valid JSON configuration', async () => {
    const testConfig = {
      rootFolders: [
        { path: '/tv', accessible: true },
        { path: '/movies', accessible: true },
      ],
      qualityProfiles: [],
      indexers: [],
      downloadClients: [],
    }

    writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2))

    const config = await configLoader.loadConfig(testConfigPath)

    expect(config.rootFolders).toHaveLength(2)
    expect(config.rootFolders[0].path).toBe('/tv')
    expect(config.rootFolders[1].path).toBe('/movies')
    expect(config.qualityProfiles).toHaveLength(0)
    expect(config.indexers).toHaveLength(0)
    expect(config.downloadClients).toHaveLength(0)
  })

  test('loads empty configuration when file does not exist', async () => {
    const config = await configLoader.loadConfig('/tmp/nonexistent-config.json')

    expect(config.rootFolders).toHaveLength(0)
    expect(config.qualityProfiles).toHaveLength(0)
    expect(config.indexers).toHaveLength(0)
    expect(config.downloadClients).toHaveLength(0)
  })

  test('loads empty configuration when file is empty', async () => {
    writeFileSync(testConfigPath, '')

    const config = await configLoader.loadConfig(testConfigPath)

    expect(config.rootFolders).toHaveLength(0)
    expect(config.qualityProfiles).toHaveLength(0)
    expect(config.indexers).toHaveLength(0)
    expect(config.downloadClients).toHaveLength(0)
  })

  test('throws error for invalid JSON', async () => {
    writeFileSync(testConfigPath, '{ invalid json }')

    await expect(configLoader.loadConfig(testConfigPath)).rejects.toThrow()
  })

  test('validates configuration schema', async () => {
    const validConfig = {
      rootFolders: [{ path: '/tv' }],
      qualityProfiles: [],
      indexers: [],
      downloadClients: [],
    }

    const invalidConfig = {
      rootFolders: [{ path: 123 }], // Invalid: path should be string
      qualityProfiles: [],
      indexers: [],
      downloadClients: [],
    }

    expect(configLoader.validateConfig(validConfig)).toBeDefined()
    expect(() => configLoader.validateConfig(invalidConfig)).toThrow()
  })

  test('loads valid YAML configuration', async () => {
    const yamlPath = '/tmp/test-config.yaml'
    const yamlContent = `
rootFolders:
  - path: /tv
    accessible: true
  - path: /movies
    accessible: true
qualityProfiles: []
indexers: []
downloadClients: []
`
    writeFileSync(yamlPath, yamlContent)

    const config = await configLoader.loadConfig(yamlPath)

    expect(config.rootFolders).toHaveLength(2)
    expect(config.rootFolders[0].path).toBe('/tv')
    expect(config.rootFolders[1].path).toBe('/movies')
    expect(config.qualityProfiles).toHaveLength(0)

    unlinkSync(yamlPath)
  })
})
