import type { BazarrLanguageProfile } from '@/config/schema'
import {
  BazarrStep,
  type ChangeRecord,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'

interface BazarrLanguageProfileState {
  profileId: number
  name: string
  cutoff: number | null
  items: Array<{
    language: string
    forced: boolean
    hi: boolean
  }>
  mustContain: string
  mustNotContain: string
}

export class BazarrLanguageProfilesStep extends BazarrStep {
  readonly name = 'bazarr-language-profiles'
  readonly description = 'Configure Bazarr language profiles'
  readonly dependencies: string[] = ['bazarr-languages']
  readonly mode: 'init' | 'sidecar' | 'both' = 'sidecar'

  private getProfilesConfig(context: StepContext): BazarrLanguageProfile[] {
    return context.config.app?.bazarr?.languageProfiles ?? []
  }

  private getDefaultProfilesConfig(context: StepContext): {
    series: string | undefined
    movies: string | undefined
  } {
    // Check for profile-level default flag first
    const profiles = this.getProfilesConfig(context)
    const defaultProfile = profiles.find((p) => p.default)
    if (defaultProfile) {
      return { series: defaultProfile.name, movies: defaultProfile.name }
    }

    // Fall back to explicit defaultProfiles config
    const defaults = context.config.app?.bazarr?.defaultProfiles
    return {
      series: defaults?.series,
      movies: defaults?.movies,
    }
  }

  validatePrerequisites(context: StepContext): boolean {
    return this.getProfilesConfig(context).length > 0
  }

  async readCurrentState(context: StepContext): Promise<BazarrLanguageProfileState[]> {
    try {
      const profiles = await this.client.getLanguageProfiles()
      return profiles.map((p) => ({
        profileId: p.profileId,
        name: p.name,
        cutoff: p.cutoff,
        items: p.items.map((item) => ({
          language: item.language,
          forced: item.forced === 'True',
          hi: item.hi === 'True',
        })),
        mustContain: p.mustContain,
        mustNotContain: p.mustNotContain,
      }))
    } catch (error) {
      context.logger.debug('Failed to read Bazarr language profiles state', { error })
      return []
    }
  }

  protected getDesiredState(context: StepContext): BazarrLanguageProfile[] {
    return this.getProfilesConfig(context)
  }

  compareAndPlan(
    current: BazarrLanguageProfileState[],
    desired: BazarrLanguageProfile[],
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    const currentByName = new Map(current.map((p) => [p.name, p]))
    const desiredNames = new Set(desired.map((p) => p.name))

    // Check for new profiles or updates
    for (const profile of desired) {
      const existing = currentByName.get(profile.name)

      if (!existing) {
        changes.push({
          type: 'create',
          resource: 'bazarr-language-profile',
          identifier: profile.name,
          details: { itemCount: profile.items.length },
        })
      } else {
        // Check if profile needs update
        const needsUpdate = this.profileNeedsUpdate(existing, profile)
        if (needsUpdate) {
          changes.push({
            type: 'update',
            resource: 'bazarr-language-profile',
            identifier: profile.name,
            details: { itemCount: profile.items.length },
          })
        }
      }
    }

    // Check for profiles to remove (not in desired state)
    for (const name of currentByName.keys()) {
      if (!desiredNames.has(name)) {
        changes.push({
          type: 'delete',
          resource: 'bazarr-language-profile',
          identifier: name,
        })
      }
    }

    return changes
  }

  private profileNeedsUpdate(
    current: BazarrLanguageProfileState,
    desired: BazarrLanguageProfile,
  ): boolean {
    // Compare cutoff
    if (current.cutoff !== (desired.cutoff ?? null)) return true

    // Compare mustContain/mustNotContain
    if (current.mustContain !== (desired.mustContain ?? '')) return true
    if (current.mustNotContain !== (desired.mustNotContain ?? '')) return true

    // Compare items
    if (current.items.length !== desired.items.length) return true

    for (let i = 0; i < current.items.length; i++) {
      const currentItem = current.items[i]
      const desiredItem = desired.items[i]

      if (!currentItem || !desiredItem) return true
      if (currentItem.language !== desiredItem.language) return true
      if (currentItem.forced !== (desiredItem.forced ?? false)) return true
      if (currentItem.hi !== (desiredItem.hi ?? false)) return true
    }

    return false
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const errors: Error[] = []
    const warnings: Warning[] = []

    try {
      if (changes.length > 0) {
        const desired = this.getDesiredState(context)
        context.logger.info('Configuring Bazarr language profiles...', {
          profileCount: desired.length,
        })

        await this.client.configureLanguageProfiles(desired)

        context.logger.info('Bazarr language profiles configured successfully', {
          profiles: desired.map((p) => p.name).join(', '),
        })
      }

      // Always configure default profiles if specified (idempotent, runs even when profiles unchanged)
      const defaultProfiles = this.getDefaultProfilesConfig(context)
      if (defaultProfiles.series || defaultProfiles.movies) {
        await this.client.configureDefaultProfiles(defaultProfiles.series, defaultProfiles.movies)
      }

      // Bulk-assign profile to existing media with no profile
      const applyProfile = this.getProfilesConfig(context).find((p) => p.applyToExisting)
      if (applyProfile) {
        await this.applyProfileToExistingMedia(applyProfile.name, context)
      }

      return {
        success: true,
        changes,
        errors,
        warnings,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)
      context.logger.error('Failed to configure Bazarr language profiles', {
        error: err.message,
      })
      return {
        success: false,
        changes,
        errors,
        warnings,
      }
    }
  }

  private async applyProfileToExistingMedia(
    profileName: string,
    context: StepContext,
  ): Promise<void> {
    const profiles = await this.client.getLanguageProfiles()
    const profile = profiles.find((p) => p.name === profileName)
    if (!profile) {
      context.logger.warn('Cannot apply profile to existing media: profile not found', {
        name: profileName,
      })
      return
    }

    const profileId = profile.profileId

    // Assign to series with no profile
    const series = await this.client.getSeries()
    const unassignedSeries = series.filter((s) => s.profileId == null).map((s) => s.sonarrSeriesId)
    if (unassignedSeries.length > 0) {
      context.logger.info('Assigning default profile to unassigned series...', {
        count: unassignedSeries.length,
        profileName,
      })
      await this.client.assignSeriesProfiles(unassignedSeries, profileId)
    }

    // Assign to movies with no profile
    const movies = await this.client.getMovies()
    const unassignedMovies = movies.filter((m) => m.profileId == null).map((m) => m.radarrId)
    if (unassignedMovies.length > 0) {
      context.logger.info('Assigning default profile to unassigned movies...', {
        count: unassignedMovies.length,
        profileName,
      })
      await this.client.assignMoviesProfiles(unassignedMovies, profileId)
    }

    if (unassignedSeries.length === 0 && unassignedMovies.length === 0) {
      context.logger.debug('All media already has a profile assigned')
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      const current = await this.readCurrentState(context)
      const desired = this.getDesiredState(context)

      if (desired.length === 0) return true

      const currentNames = new Set(current.map((p) => p.name))
      return desired.every((profile) => currentNames.has(profile.name))
    } catch {
      return false
    }
  }
}
