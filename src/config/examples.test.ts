import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { defaultConfig } from './defaults'
import { loadConfigFile } from './loaders/file'
import { mergeConfigs } from './merger'
import { AppConfigSchema, type Config, ConfigSchema } from './schema'

const examplesDir = join(import.meta.dir, '../../examples')
const exampleFiles = readdirSync(examplesDir).filter((name) => /\.(json|ya?ml|toml)$/.test(name))

// Zod strips unknown keys, so a misplaced section would silently configure nothing
describe('examples/', () => {
  test('contains example config files', () => {
    expect(exampleFiles.length).toBeGreaterThan(0)
  })

  for (const name of exampleFiles) {
    describe(name, () => {
      test('only uses known top-level and app keys', async () => {
        const fileConfig = (await loadConfigFile(join(examplesDir, name))) as Record<
          string,
          unknown
        >
        const topLevelKeys = Object.keys(ConfigSchema.shape)
        const appKeys = Object.keys(AppConfigSchema.shape)

        expect(Object.keys(fileConfig).filter((key) => !topLevelKeys.includes(key))).toEqual([])
        const app = (fileConfig.app ?? {}) as Record<string, unknown>
        expect(Object.keys(app).filter((key) => !appKeys.includes(key))).toEqual([])
      })

      test('validates against the config schema', async () => {
        const fileConfig = await loadConfigFile(join(examplesDir, name))
        // Secrets normally arrive via env vars, so stand in for them beneath the file
        const secrets = {
          postgres: { password: 'example' },
          servarr: { url: 'http://servarr:8989', adminPassword: 'example' },
        } as Partial<Config>
        const result = ConfigSchema.safeParse(mergeConfigs(defaultConfig, secrets, fileConfig))

        expect(result.error?.issues ?? []).toEqual([])
      })
    })
  }
})
