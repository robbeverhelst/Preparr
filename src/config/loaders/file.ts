// @ts-ignore - YAML exists in Bun runtime but not yet in type definitions
import { TOML, YAML, file } from 'bun'
import type { Config } from '../schema'

export type ConfigFileFormat = 'yaml' | 'json' | 'toml'

export function detectFileFormat(filePath: string): ConfigFileFormat {
  const ext = filePath.toLowerCase().split('.').pop()

  switch (ext) {
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'toml':
      return 'toml'
    default:
      return 'json'
  }
}

/**
 * Load and parse configuration file
 */
export async function loadConfigFile(filePath: string): Promise<Partial<Config> | null> {
  try {
    const configFile = file(filePath)

    if (!(await configFile.exists())) {
      return null
    }

    const content = await configFile.text()
    if (!content.trim()) {
      return null
    }

    const format = detectFileFormat(filePath)

    let parsed: Partial<Config> | null
    switch (format) {
      case 'yaml':
        parsed = parseYAML(content)
        break
      case 'toml':
        parsed = parseTOML(content)
        break
      default:
        parsed = parseJSON(content)
    }

    return parsed
  } catch (error) {
    throw new Error(
      `Failed to load config file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Parse JSON configuration with environment variable substitution
 */
function parseJSON(content: string): Partial<Config> {
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Parse YAML configuration using Bun's native YAML support with environment variable substitution
 */
function parseYAML(content: string): Partial<Config> {
  try {
    return YAML.parse(content) as Partial<Config>
  } catch (error) {
    throw new Error(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Parse TOML configuration with environment variable substitution
 */
function parseTOML(content: string): Partial<Config> {
  try {
    return TOML.parse(content) as Partial<Config>
  } catch (error) {
    throw new Error(`Invalid TOML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Find configuration file in common locations
 */
export async function findConfigFile(customPath?: string): Promise<string | null> {
  const searchPaths = customPath
    ? [customPath]
    : [
        '/config/servarr.yaml',
        '/config/servarr.yml',
        '/config/servarr.json',
        '/config/servarr.toml',
        './config.yaml',
        './config.yml',
        './config.json',
        './config.toml',
        './preparr.yaml',
        './preparr.yml',
        './preparr.json',
        './preparr.toml',
      ]

  for (const path of searchPaths) {
    if (await file(path).exists()) {
      return path
    }
  }

  return null
}

// No file-level environment interpolation; precedence is handled by loader/merger
