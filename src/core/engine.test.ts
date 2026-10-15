import { describe, expect, test } from 'bun:test'

import { ConfigurationEngine } from './engine'
import { type ChangeRecord, ConfigurationStep, type StepContext, type StepResult } from './step'

type Outcome = 'success' | 'fail' | 'skip' | 'throw'

class FakeStep extends ConfigurationStep<null> {
  readonly description: string

  constructor(
    readonly name: string,
    private readonly log: string[],
    readonly dependencies: string[] = [],
    readonly mode: 'init' | 'sidecar' | 'both' = 'both',
    private readonly outcome: Outcome = 'success',
  ) {
    super()
    this.description = `fake ${name}`
  }

  override execute(context: StepContext): Promise<StepResult> {
    this.log.push(this.name)
    if (this.outcome === 'throw') {
      return Promise.reject(new Error(`${this.name} exploded`))
    }
    return super.execute(context)
  }

  validatePrerequisites(): boolean {
    return this.outcome !== 'skip'
  }

  readCurrentState(): Promise<null> {
    return Promise.resolve(null)
  }

  compareAndPlan(): ChangeRecord[] {
    return [{ type: 'create', resource: 'fake', identifier: this.name }]
  }

  executeChanges(changes: ChangeRecord[]): Promise<StepResult> {
    if (this.outcome === 'fail') {
      return Promise.resolve({
        success: false,
        changes: [],
        errors: [new Error(`${this.name} failed`)],
        warnings: [],
      })
    }
    return Promise.resolve({ success: true, changes, errors: [], warnings: [] })
  }

  verifySuccess(): boolean {
    return true
  }

  protected getDesiredState(): null {
    return null
  }
}

const context = { executionMode: 'sidecar' } as unknown as StepContext

describe('ConfigurationEngine', () => {
  test('runs steps in dependency order regardless of registration order', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([
      new FakeStep('c', log, ['b']),
      new FakeStep('b', log, ['a']),
      new FakeStep('a', log),
    ])

    const result = await engine.execute('sidecar', context)

    expect(log).toEqual(['a', 'b', 'c'])
    expect(result.success).toBe(true)
    expect(result.summary).toEqual({
      totalSteps: 3,
      successfulSteps: 3,
      failedSteps: 0,
      skippedSteps: 0,
      totalChanges: 3,
      criticalFailures: [],
    })
  })

  test('only runs steps whose mode matches or is both', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([
      new FakeStep('init-only', log, [], 'init'),
      new FakeStep('sidecar-only', log, [], 'sidecar'),
      new FakeStep('always', log, [], 'both'),
    ])

    await engine.execute('init', context)
    expect(log).toEqual(['init-only', 'always'])

    log.length = 0
    await engine.execute('sidecar', context)
    expect(log).toEqual(['sidecar-only', 'always'])
  })

  test('continues after a non-critical step fails and reports failure', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([
      new FakeStep('root-folders', log, [], 'both', 'fail'),
      new FakeStep('indexers', log, ['root-folders']),
    ])

    const result = await engine.execute('sidecar', context)

    expect(log).toEqual(['root-folders', 'indexers'])
    expect(result.success).toBe(false)
    expect(result.errors.map((e) => e.message)).toEqual(['root-folders failed'])
    expect(result.summary.failedSteps).toBe(1)
    expect(result.summary.criticalFailures).toEqual([])
  })

  for (const critical of ['postgres-connectivity', 'servarr-connectivity']) {
    test(`stops execution when critical step ${critical} fails`, async () => {
      const log: string[] = []
      const engine = new ConfigurationEngine([
        new FakeStep(critical, log, [], 'both', 'fail'),
        new FakeStep('after', log, [critical]),
      ])

      const result = await engine.execute('sidecar', context)

      expect(log).toEqual([critical])
      expect(result.success).toBe(false)
      expect(result.summary.criticalFailures).toEqual([critical])
    })
  }

  test('does not treat config-loading as critical (critical list names config-validation)', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([
      new FakeStep('config-loading', log, [], 'both', 'fail'),
      new FakeStep('after', log, ['config-loading']),
    ])

    const result = await engine.execute('sidecar', context)

    expect(log).toEqual(['config-loading', 'after'])
    expect(result.summary.criticalFailures).toEqual([])
  })

  test('records a step that throws and stops if it is critical', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([
      new FakeStep('postgres-connectivity', log, [], 'both', 'throw'),
      new FakeStep('after', log, ['postgres-connectivity']),
    ])

    const result = await engine.execute('sidecar', context)

    expect(log).toEqual(['postgres-connectivity'])
    expect(result.errors.map((e) => e.message)).toEqual(['postgres-connectivity exploded'])
    expect(result.stepResults.get('postgres-connectivity')?.success).toBe(false)
    expect(result.summary.criticalFailures).toEqual(['postgres-connectivity'])
  })

  test('counts skipped steps as successful and skipped', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([new FakeStep('optional', log, [], 'both', 'skip')])

    const result = await engine.execute('sidecar', context)

    expect(result.success).toBe(true)
    expect(result.summary).toMatchObject({
      totalSteps: 1,
      successfulSteps: 1,
      skippedSteps: 1,
      totalChanges: 0,
    })
  })

  test('runs nothing when a step depends on a missing step', async () => {
    const log: string[] = []
    const engine = new ConfigurationEngine([new FakeStep('orphan', log, ['missing'])])

    const result = await engine.execute('sidecar', context)

    expect(log).toEqual([])
    expect(result.success).toBe(false)
    expect(result.errors.map((e) => e.message)).toEqual([
      "Step 'orphan' depends on non-existent step 'missing'",
    ])
  })

  test('rejects circular dependencies at registration', () => {
    const log: string[] = []
    expect(
      () => new ConfigurationEngine([new FakeStep('a', log, ['b']), new FakeStep('b', log, ['a'])]),
    ).toThrow('Circular dependency detected')
  })
})
