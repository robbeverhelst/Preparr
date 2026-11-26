import { env as processEnv } from 'bun'

export type InterpolationEnv = Record<string, string | undefined>

/**
 * Thrown when one or more `${VAR}` references in a config file cannot be resolved.
 * `problems` holds one entry per failing reference: the config key path and the
 * variable name, never a value.
 */
export class ConfigInterpolationError extends Error {
  readonly problems: string[]

  constructor(problems: string[], source?: string) {
    const where = source ? ` in '${source}'` : ''
    // One line: the logger prints errors as JSON, where line breaks become a literal \n
    super(`Environment variable interpolation failed${where}: ${problems.join('; ')}`)
    this.name = 'ConfigInterpolationError'
    this.problems = problems
  }
}

// VAR, VAR:-default (default when unset or empty) or VAR-default (default when unset)
const REFERENCE = /^([A-Za-z_][A-Za-z0-9_]*)(?:(:?-)(.*))?$/s

const SYNTAX_HELP = `use \${VAR}, \${VAR:-default} or \${VAR-default}, or $\${ for a literal \${`

function interpolateString(
  input: string,
  path: string,
  env: InterpolationEnv,
  problems: string[],
): string {
  let output = ''
  let position = 0

  for (let start = input.indexOf('${'); start !== -1; start = input.indexOf('${', position)) {
    // `$${` is the escape for a literal `${`
    if (input[start - 1] === '$') {
      output += `${input.slice(position, start - 1)}\${`
      position = start + 2
      continue
    }

    const end = input.indexOf('}', start + 2)
    if (end === -1) {
      problems.push(`${path}: unterminated \${ (${SYNTAX_HELP})`)
      return input
    }

    output += input.slice(position, start)
    position = end + 1

    const match = REFERENCE.exec(input.slice(start + 2, end))
    if (!match) {
      problems.push(`${path}: invalid \${...} expression (${SYNTAX_HELP})`)
      continue
    }

    const [, name = '', operator, fallback = ''] = match
    if (fallback.includes('${')) {
      problems.push(`${path}: the default of env var ${name} cannot contain another \${...}`)
      continue
    }

    const value = env[name]
    if (operator === undefined) {
      // An empty variable counts as set, like POSIX ${VAR-}
      if (value === undefined) {
        problems.push(`${path}: env var ${name} is not set`)
        continue
      }
      output += value
    } else if (value === undefined || (operator === ':-' && value === '')) {
      output += fallback
    } else {
      output += value
    }
  }

  return output + input.slice(position)
}

function interpolateValue(
  value: unknown,
  path: string,
  env: InterpolationEnv,
  problems: string[],
): unknown {
  if (typeof value === 'string') {
    return interpolateString(value, path, env, problems)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => interpolateValue(item, `${path}[${index}]`, env, problems))
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        interpolateValue(child, path ? `${path}.${key}` : key, env, problems),
      ]),
    )
  }

  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Resolve `${VAR}`, `${VAR:-default}` and `${VAR-default}` in every string value of a
 * parsed config (nested objects and arrays included). Keys and non-string values are
 * left untouched, `$${` produces a literal `${`, and substituted values are not
 * scanned again. Returns a new object; throws one ConfigInterpolationError that lists
 * every unresolved reference by config key path.
 */
export function interpolateEnv<T>(
  config: T,
  env: InterpolationEnv = processEnv,
  source?: string,
): T {
  const problems: string[] = []
  const result = interpolateValue(config, '', env, problems)

  if (problems.length > 0) {
    throw new ConfigInterpolationError(problems, source)
  }

  return result as T
}
