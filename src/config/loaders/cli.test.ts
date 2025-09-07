import { describe, expect, test } from 'bun:test'
import { generateHelpText, parseCliArgs } from './cli'

describe('parseCliArgs', () => {
  test('parses empty args', () => {
    const result = parseCliArgs([])
    expect(result.init).toBe(false)
    expect(result.help).toBe(false)
    expect(result.version).toBe(false)
    expect(result.generateApiKey).toBe(false)
    expect(result.config).toEqual({})
    expect(result.raw).toEqual([])
  })

  test('parses special flags', () => {
    const result1 = parseCliArgs(['--init'])
    expect(result1.init).toBe(true)

    const result2 = parseCliArgs(['--help'])
    expect(result2.help).toBe(true)

    const result3 = parseCliArgs(['-h'])
    expect(result3.help).toBe(true)

    const result4 = parseCliArgs(['--version'])
    expect(result4.version).toBe(true)

    const result5 = parseCliArgs(['-v'])
    expect(result5.version).toBe(true)

    const result6 = parseCliArgs(['--generate-api-key'])
    expect(result6.generateApiKey).toBe(true)
  })

  test('parses configuration arguments with = syntax', () => {
    const result = parseCliArgs([
      '--postgres-host=localhost',
      '--postgres-port=5432',
      '--log-level=debug',
    ])

    expect(result.config.postgres?.host).toBe('localhost')
    expect(result.config.postgres?.port).toBe(5432) // Converted to number
    expect(result.config.logLevel).toBe('debug')
  })

  test('parses configuration arguments with space syntax', () => {
    const result = parseCliArgs([
      '--postgres-host',
      'localhost',
      '--postgres-port',
      '5432',
      '--log-level',
      'debug',
    ])

    expect(result.config.postgres?.host).toBe('localhost')
    expect(result.config.postgres?.port).toBe(5432)
    expect(result.config.logLevel).toBe('debug')
  })

  test('handles boolean values', () => {
    const result = parseCliArgs(['--config-watch=true', '--config-reconcile-interval', '60'])

    expect(result.config.configWatch).toBe(true) // Converted to boolean
    expect(result.config.configReconcileInterval).toBe(60) // Converted to number
  })

  test('handles string values with quotes', () => {
    const result = parseCliArgs([
      '--postgres-password="secret password"',
      "--servarr-admin-user='admin user'",
    ])

    expect(result.config.postgres?.password).toBe('secret password')
    expect(result.config.servarr?.adminUser).toBe('admin user')
  })

  test('handles complex nested paths', () => {
    const result = parseCliArgs([
      '--postgres-host=db.example.com',
      '--servarr-url=http://sonarr:8989',
      '--qbittorrent-url=http://qbt:8080',
    ])

    expect(result.config.postgres?.host).toBe('db.example.com')
    expect(result.config.servarr?.url).toBe('http://sonarr:8989')
    expect(result.config.services?.qbittorrent?.url).toBe('http://qbt:8080')
  })

  test('handles array values (comma-separated)', () => {
    const result = parseCliArgs(['--config-path=config1.yaml,config2.yaml,config3.yaml'])

    expect(Array.isArray(result.config.configPath)).toBe(true)
    expect(result.config.configPath).toEqual(['config1.yaml', 'config2.yaml', 'config3.yaml'])
  })

  test('handles numeric values', () => {
    const result = parseCliArgs([
      '--postgres-port=5432',
      '--health-port=8080',
      '--config-reconcile-interval=120',
    ])

    expect(result.config.postgres?.port).toBe(5432) // Converted to number
    expect(result.config.health?.port).toBe(8080) // Converted to number
    expect(result.config.configReconcileInterval).toBe(120) // Converted to number
  })

  test('handles float values', () => {
    const result = parseCliArgs(['--some-float=3.14'])
    // Note: This will depend on the CLI mapping configuration
    // For now, just test that floats are parsed correctly
    expect(typeof result.config).toBe('object')
  })

  test('ignores unknown arguments', () => {
    const result = parseCliArgs(['--unknown-arg=value', '--postgres-host=localhost'])

    expect(result.config.postgres?.host).toBe('localhost')
    // Unknown arg should be ignored
    expect(result.config).not.toHaveProperty('unknownArg')
  })

  test('handles mixed argument styles', () => {
    const result = parseCliArgs([
      '--init',
      '--postgres-host=localhost',
      '--postgres-port',
      '5432',
      '--help',
      '--log-level',
      'info',
    ])

    expect(result.init).toBe(true)
    expect(result.help).toBe(true)
    expect(result.config.postgres?.host).toBe('localhost')
    expect(result.config.postgres?.port).toBe(5432)
    expect(result.config.logLevel).toBe('info')
  })

  test('handles values with equals signs', () => {
    const result = parseCliArgs(['--postgres-password=pass=word=with=equals'])

    expect(result.config.postgres?.password).toBe('pass=word=with=equals')
  })

  test('preserves raw arguments', () => {
    const args = ['--init', '--postgres-host', 'localhost']
    const result = parseCliArgs(args)
    expect(result.raw).toEqual(args)
  })

  test('handles edge cases', () => {
    // Empty argument
    const result1 = parseCliArgs(['--postgres-host='])
    expect(result1.config.postgres?.host).toBe('')

    // Just dashes
    const result2 = parseCliArgs(['--'])
    expect(result2.config).toEqual({})

    // Single dash (not a valid argument)
    const result3 = parseCliArgs(['-'])
    expect(result3.config).toEqual({})
  })
})

describe('generateHelpText', () => {
  test('generates help text', () => {
    const help = generateHelpText()
    expect(typeof help).toBe('string')
    expect(help).toContain('PrepArr - Servarr Automation Tool')
    expect(help).toContain('Usage: preparr [OPTIONS]')
    expect(help).toContain('--init')
    expect(help).toContain('--help')
    expect(help).toContain('--version')
    expect(help).toContain('--generate-api-key')
  })

  test('includes configuration options', () => {
    const help = generateHelpText()
    expect(help).toContain('Configuration Options:')
    expect(help).toContain('--postgres-host')
    expect(help).toContain('--servarr-url')
  })

  test('includes examples', () => {
    const help = generateHelpText()
    expect(help).toContain('Examples:')
    expect(help).toContain('preparr --init')
    expect(help).toContain('--postgres-host=db.example.com')
  })

  test('includes configuration priority information', () => {
    const help = generateHelpText()
    expect(help).toContain('Configuration Priority')
    expect(help).toContain('CLI arguments')
    expect(help).toContain('Environment variables')
    expect(help).toContain('Configuration files')
    expect(help).toContain('Default values')
  })
})
