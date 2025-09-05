import type { ConfigurationStep } from './step'

export class StepRegistry {
  private steps: Map<string, ConfigurationStep> = new Map()
  private executionOrder: string[] = []

  register(step: ConfigurationStep): void {
    try {
      this.steps.set(step.name, step)
      this.calculateExecutionOrder()
    } catch (error) {
      // Use proper error handling instead of console
      throw new Error(`Error registering step ${step.name}: ${error}`)
    }
  }

  unregister(stepName: string): void {
    this.steps.delete(stepName)
    this.calculateExecutionOrder()
  }

  get(stepName: string): ConfigurationStep | undefined {
    return this.steps.get(stepName)
  }

  getAll(): ConfigurationStep[] {
    return Array.from(this.steps.values())
  }

  getExecutionOrder(): string[] {
    return [...this.executionOrder]
  }

  getStepsForMode(mode: 'init' | 'sidecar'): ConfigurationStep[] {
    return this.getAll().filter((step) => step.mode === mode || step.mode === 'both')
  }

  private calculateExecutionOrder(): void {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const order: string[] = []

    const visit = (stepName: string): void => {
      if (visiting.has(stepName)) {
        throw new Error(`Circular dependency detected involving step: ${stepName}`)
      }
      if (visited.has(stepName)) {
        return
      }

      const step = this.steps.get(stepName)
      if (!step) {
        return
      }

      visiting.add(stepName)

      // Visit dependencies first
      for (const dependency of step.dependencies) {
        visit(dependency)
      }

      visiting.delete(stepName)
      visited.add(stepName)
      order.push(stepName)
    }

    // Visit all steps
    for (const stepName of this.steps.keys()) {
      visit(stepName)
    }

    this.executionOrder = order
  }

  validateDependencies(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const [stepName, step] of this.steps) {
      for (const dependency of step.dependencies) {
        if (!this.steps.has(dependency)) {
          errors.push(`Step '${stepName}' depends on non-existent step '${dependency}'`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
