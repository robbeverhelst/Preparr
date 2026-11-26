/* eslint-disable no-template-curly-in-string -- these tests are about literal ${VAR} strings */
import { describe, expect, test } from 'bun:test'

import { ConfigInterpolationError, interpolateEnv } from './interpolate'

function problemsOf(config: unknown, env: Record<string, string | undefined> = {}): string[] {
  try {
    interpolateEnv(config, env)
  } catch (error) {
    if (error instanceof ConfigInterpolationError) return error.problems
    throw error
  }
  throw new Error('expected interpolation to fail')
}

describe('interpolateEnv', () => {
  describe('${VAR}', () => {
    test('replaces a reference with the variable value', () => {
      expect(interpolateEnv({ apiKey: '${RADARR_KEY}' }, { RADARR_KEY: 'abc123' })).toEqual({
        apiKey: 'abc123',
      })
    })

    test('replaces a reference inside a longer string', () => {
      expect(interpolateEnv({ url: 'http://${HOST}/api' }, { HOST: 'sonarr:8989' })).toEqual({
        url: 'http://sonarr:8989/api',
      })
    })

    test('replaces several references in one string', () => {
      const env = { SCHEME: 'https', HOST: 'radarr', PORT: '7878' }

      expect(interpolateEnv({ url: '${SCHEME}://${HOST}:${PORT}/${HOST}' }, env)).toEqual({
        url: 'https://radarr:7878/radarr',
      })
    })

    test('replaces adjacent references', () => {
      expect(interpolateEnv({ value: '${A}${B}' }, { A: 'foo', B: 'bar' })).toEqual({
        value: 'foobar',
      })
    })

    test('treats an empty variable as set', () => {
      expect(
        interpolateEnv({ prefix: '${PREFIX}', path: '/tv${SUFFIX}' }, { PREFIX: '', SUFFIX: '' }),
      ).toEqual({
        prefix: '',
        path: '/tv',
      })
    })

    test('does not interpolate the substituted value again', () => {
      const env = { PASSWORD: 'pa${OTHER}ss$${x}', OTHER: 'nope' }

      expect(interpolateEnv({ password: '${PASSWORD}' }, env)).toEqual({
        password: 'pa${OTHER}ss$${x}',
      })
    })

    test('accepts underscores, digits and lowercase in variable names', () => {
      expect(interpolateEnv({ value: '${_my_Var_2}' }, { _my_Var_2: 'ok' })).toEqual({
        value: 'ok',
      })
    })
  })

  describe('nested structures', () => {
    test('interpolates strings in nested objects and arrays', () => {
      const config = {
        services: { qbittorrent: { url: 'http://${QBIT_HOST}:8080', password: '${QBIT_PASS}' } },
        app: {
          rootFolders: [{ path: '${MEDIA_ROOT}/tv' }, { path: '${MEDIA_ROOT}/anime' }],
          downloadClients: [
            {
              name: 'qBittorrent',
              fields: [
                { name: 'host', value: '${QBIT_HOST}' },
                { name: 'password', value: '${QBIT_PASS}' },
              ],
            },
          ],
          tags: ['${TAG_A}', ['${TAG_B}']],
        },
      }
      const env = {
        QBIT_HOST: 'qbittorrent',
        QBIT_PASS: 's3cret',
        MEDIA_ROOT: '/data',
        TAG_A: 'a',
        TAG_B: 'b',
      }

      expect(interpolateEnv(config, env)).toEqual({
        services: { qbittorrent: { url: 'http://qbittorrent:8080', password: 's3cret' } },
        app: {
          rootFolders: [{ path: '/data/tv' }, { path: '/data/anime' }],
          downloadClients: [
            {
              name: 'qBittorrent',
              fields: [
                { name: 'host', value: 'qbittorrent' },
                { name: 'password', value: 's3cret' },
              ],
            },
          ],
          tags: ['a', ['b']],
        },
      })
    })

    test('leaves non-string values untouched', () => {
      const date = new Date('2026-01-01T00:00:00Z')
      const config = {
        port: 8989,
        ratio: 1.5,
        enabled: true,
        disabled: false,
        nothing: null,
        missing: undefined,
        date,
        list: [1, false, null],
      }

      const result = interpolateEnv(config, {})

      expect(result).toEqual(config)
      expect(result.date).toBe(date)
    })

    test('leaves strings without references untouched', () => {
      const config = {
        format: '{Series Title} - S{season:00}E{episode:00}',
        price: 'costs $5 or $ {x}',
        regex: '^(foo|bar)$',
        empty: '',
        dollars: '$$ and $$$',
      }

      expect(interpolateEnv(config, {})).toEqual(config)
    })

    test('does not interpolate object keys', () => {
      expect(interpolateEnv({ '${KEY}': '${VALUE}' }, { KEY: 'k', VALUE: 'v' })).toEqual({
        '${KEY}': 'v',
      })
    })

    test('returns a new object and does not mutate the input', () => {
      const config = { app: { apiKey: '${KEY}', rootFolders: [{ path: '${ROOT}' }] } }
      const snapshot = structuredClone(config)

      const result = interpolateEnv(config, { KEY: 'abc', ROOT: '/tv' })

      expect(config).toEqual(snapshot)
      expect(result).not.toBe(config)
      expect(result.app.rootFolders).not.toBe(config.app.rootFolders)
    })

    test('interpolates objects without a prototype', () => {
      const config: Record<string, unknown> = Object.assign(Object.create(null), {
        nested: Object.assign(Object.create(null), { key: '${VAR}' }),
      })

      const result = interpolateEnv(config, { VAR: 'value' })

      expect((result.nested as Record<string, unknown>).key).toBe('value')
    })

    test('passes through null and undefined configs', () => {
      expect(interpolateEnv(null, {})).toBeNull()
      expect(interpolateEnv(undefined, {})).toBeUndefined()
    })
  })

  describe('defaults', () => {
    test('${VAR:-default} uses the default when the variable is unset', () => {
      expect(interpolateEnv({ host: '${PG_HOST:-postgres}' }, {})).toEqual({ host: 'postgres' })
    })

    test('${VAR:-default} uses the default when the variable is empty', () => {
      expect(interpolateEnv({ host: '${PG_HOST:-postgres}' }, { PG_HOST: '' })).toEqual({
        host: 'postgres',
      })
    })

    test('${VAR:-default} uses the variable when it has a value', () => {
      expect(interpolateEnv({ host: '${PG_HOST:-postgres}' }, { PG_HOST: 'db' })).toEqual({
        host: 'db',
      })
    })

    test('${VAR-default} uses the default only when the variable is unset', () => {
      expect(interpolateEnv({ base: '${URL_BASE-/sonarr}' }, {})).toEqual({ base: '/sonarr' })
      expect(interpolateEnv({ base: '${URL_BASE-/sonarr}' }, { URL_BASE: '' })).toEqual({
        base: '',
      })
      expect(interpolateEnv({ base: '${URL_BASE-/sonarr}' }, { URL_BASE: '/tv' })).toEqual({
        base: '/tv',
      })
    })

    test('allows an empty default', () => {
      expect(interpolateEnv({ a: '${A:-}', b: 'x${B-}y' }, {})).toEqual({ a: '', b: 'xy' })
    })

    test('keeps spaces, colons, dashes and dollars in the default', () => {
      expect(
        interpolateEnv({ url: '${URL:-http://sonarr:8989/a-b c}', price: '${PRICE:-$5}' }, {}),
      ).toEqual({ url: 'http://sonarr:8989/a-b c', price: '$5' })
    })

    test('mixes required references and defaults in one string', () => {
      expect(
        interpolateEnv({ url: '${SCHEME:-http}://${HOST}:${PORT:-8989}' }, { HOST: 'sonarr' }),
      ).toEqual({ url: 'http://sonarr:8989' })
    })
  })

  describe('escaping', () => {
    test('$${VAR} produces a literal ${VAR}', () => {
      expect(interpolateEnv({ value: '$${VAR}' }, { VAR: 'nope' })).toEqual({ value: '${VAR}' })
    })

    test('an escaped reference does not need the variable to exist', () => {
      expect(interpolateEnv({ value: 'literal $${MISSING} here' }, {})).toEqual({
        value: 'literal ${MISSING} here',
      })
    })

    test('escapes and references can be mixed in one string', () => {
      expect(interpolateEnv({ value: '$${A}=${A} $${B:-x}' }, { A: '1' })).toEqual({
        value: '${A}=1 ${B:-x}',
      })
    })

    test('only one $ is consumed by the escape', () => {
      expect(interpolateEnv({ value: '$$${VAR}' }, { VAR: 'nope' })).toEqual({
        value: '$${VAR}',
      })
    })

    test('an escaped ${ does not need a closing brace', () => {
      expect(interpolateEnv({ value: 'open $${ only' }, {})).toEqual({ value: 'open ${ only' })
    })
  })

  describe('errors', () => {
    test('a missing variable names the config key path and the variable', () => {
      expect(() => interpolateEnv({ radarr: { apiKey: '${RADARR_KEY}' } }, {})).toThrow(
        'radarr.apiKey: env var RADARR_KEY is not set',
      )
    })

    test('lists every missing variable at once', () => {
      const config = {
        postgres: { password: '${PG_PASSWORD}' },
        services: { prowlarr: { apiKey: '${PROWLARR_KEY}', url: 'http://${PROWLARR_HOST}:9696' } },
        app: {
          apiKey: '${SET}',
          downloadClients: [
            { name: 'ok', fields: [] },
            { name: 'qBittorrent', fields: [{ name: 'password', value: '${QBIT_PASS}' }] },
          ],
        },
      }

      expect(problemsOf(config, { SET: 'present' })).toEqual([
        'postgres.password: env var PG_PASSWORD is not set',
        'services.prowlarr.apiKey: env var PROWLARR_KEY is not set',
        'services.prowlarr.url: env var PROWLARR_HOST is not set',
        'app.downloadClients[1].fields[0].value: env var QBIT_PASS is not set',
      ])
    })

    test('reports each missing variable of a single string', () => {
      expect(problemsOf({ url: '${A}://${B}' })).toEqual([
        'url: env var A is not set',
        'url: env var B is not set',
      ])
    })

    test('throws a ConfigInterpolationError whose message lists the problems', () => {
      let caught: unknown
      try {
        interpolateEnv({ a: '${ONE}', b: ['${TWO}'] }, {}, '/config/servarr.yaml')
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(ConfigInterpolationError)
      expect((caught as Error).message).toBe(
        "Environment variable interpolation failed in '/config/servarr.yaml': " +
          'a: env var ONE is not set; b[0]: env var TWO is not set',
      )
    })

    test('never includes values, defaults or the surrounding string', () => {
      const config = {
        password: 'hunter2-prefix-${MISSING}-${SECRET}',
        token: '${TOKEN:-fallback-secret}${ALSO_MISSING}',
        broken: 'literal-secret-${not valid}',
        open: 'another-secret-${OPEN',
      }
      let message = ''
      try {
        interpolateEnv(config, { SECRET: 'env-secret-value' })
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).toContain('password: env var MISSING is not set')
      expect(message).toContain('token: env var ALSO_MISSING is not set')
      for (const secret of [
        'hunter2',
        'env-secret-value',
        'fallback-secret',
        'literal-secret',
        'not valid',
        'another-secret',
      ]) {
        expect(message).not.toContain(secret)
      }
    })

    test('rejects malformed expressions instead of passing them through', () => {
      const config = {
        empty: '${}',
        badName: '${1ABC}',
        spaces: '${MY VAR}',
        colonOnly: '${VAR:default}',
        unsupported: '${VAR:?required}',
        unterminated: 'http://${HOST',
      }

      const problems = problemsOf(config, { VAR: 'x', HOST: 'h' })

      expect(problems).toHaveLength(6)
      expect(problems[0]).toStartWith('empty: invalid ${...} expression')
      expect(problems[1]).toStartWith('badName: invalid ${...} expression')
      expect(problems[2]).toStartWith('spaces: invalid ${...} expression')
      expect(problems[3]).toStartWith('colonOnly: invalid ${...} expression')
      expect(problems[4]).toStartWith('unsupported: invalid ${...} expression')
      expect(problems[5]).toStartWith('unterminated: unterminated ${')
      expect(problems[0]).toContain('or $${ for a literal ${')
    })

    test('rejects a nested reference in a default', () => {
      expect(problemsOf({ value: '${A:-${B}}' }, { B: 'b' })).toEqual([
        'value: the default of env var A cannot contain another ${...}',
      ])
    })

    test('reports missing variables and malformed expressions together', () => {
      expect(problemsOf({ a: '${MISSING}', b: '${oops!}' })).toHaveLength(2)
    })
  })

  test('reads Bun.env by default', () => {
    const name = 'PREPARR_INTERPOLATE_TEST_VAR'
    const previous = process.env[name]
    process.env[name] = 'from-process-env'

    try {
      expect(interpolateEnv({ value: `\${${name}}` })).toEqual({ value: 'from-process-env' })
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, name)
      } else {
        process.env[name] = previous
      }
    }
  })
})
