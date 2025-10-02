import crypto from 'node:crypto'
import {
  type ChangeRecord,
  ConfigurationStep,
  type StepContext,
  type StepResult,
  type Warning,
} from '@/core/step'
import { file, spawn, write } from 'bun'

export class QBittorrentInitStep extends ConfigurationStep {
  readonly name = 'qbittorrent-init'
  readonly description = 'Initialize qBittorrent configuration file'
  readonly dependencies: string[] = []
  readonly mode: 'init' | 'sidecar' | 'both' = 'init'

  validatePrerequisites(context: StepContext): boolean {
    // Only run in init mode and only for qBittorrent type
    if (context.executionMode !== 'init') {
      return false
    }

    if (context.servarrType !== 'qbittorrent') {
      context.logger.debug('Skipping qBittorrent-init step for non-qBittorrent type', {
        servarrType: context.servarrType,
      })
      return false
    }

    return true
  }

  async readCurrentState(
    context: StepContext,
  ): Promise<{ configExists: boolean; username?: string }> {
    try {
      const configPath = '/config/qBittorrent/qBittorrent.conf'
      const configFile = file(configPath)
      const exists = await configFile.exists()

      if (!exists) {
        return { configExists: false }
      }

      // Read the config file to get the current username
      const configContent = await configFile.text()
      const usernameMatch = configContent.match(/WebUI\\Username=(.+)/)
      const username = usernameMatch ? usernameMatch[1] : undefined

      return username ? { configExists: true, username } : { configExists: true }
    } catch (error) {
      context.logger.debug('Failed to check qBittorrent config file', { error })
      return { configExists: false }
    }
  }

  protected getDesiredState(_context: StepContext): { configExists: boolean; username: string } {
    const username = process.env.QBITTORRENT_USER || 'admin'
    return { configExists: true, username }
  }

  compareAndPlan(
    current: { configExists: boolean; username?: string },
    desired: { configExists: boolean; username: string },
    _context: StepContext,
  ): ChangeRecord[] {
    const changes: ChangeRecord[] = []

    if (!current.configExists && desired.configExists) {
      changes.push({
        type: 'create',
        resource: 'qbittorrent-config-file',
        identifier: 'qBittorrent.conf',
        details: {
          action: 'create-config-file',
        },
      })
    } else if (current.configExists && current.username !== desired.username) {
      changes.push({
        type: 'update',
        resource: 'qbittorrent-config-file',
        identifier: 'qBittorrent.conf',
        details: {
          action: 'update-credentials',
        },
      })
    }

    return changes
  }

  async executeChanges(changes: ChangeRecord[], context: StepContext): Promise<StepResult> {
    const results: ChangeRecord[] = []
    const errors: Error[] = []
    const warnings: Warning[] = []

    for (const change of changes) {
      try {
        if (change.type === 'create' && change.details?.action === 'create-config-file') {
          await this.createQBittorrentConfig(context)

          results.push({
            ...change,
            type: 'create',
          })

          context.logger.info('qBittorrent configuration file created successfully')
        } else if (change.type === 'update' && change.details?.action === 'update-credentials') {
          await this.createQBittorrentConfig(context)

          results.push({
            ...change,
            type: 'update',
          })

          context.logger.info('qBittorrent configuration file updated successfully')
        }
      } catch (error) {
        const stepError = error instanceof Error ? error : new Error(String(error))
        errors.push(stepError)
        context.logger.error('Failed to create qBittorrent configuration', {
          error: stepError.message,
        })
      }
    }

    return {
      success: errors.length === 0,
      changes: results,
      errors,
      warnings,
    }
  }

  async verifySuccess(context: StepContext): Promise<boolean> {
    try {
      const configPath = '/config/qBittorrent/qBittorrent.conf'
      const configFile = file(configPath)
      return await configFile.exists()
    } catch (error) {
      context.logger.debug('qBittorrent config verification failed', { error })
      return false
    }
  }

  private async createQBittorrentConfig(context: StepContext): Promise<void> {
    // Read credentials directly from environment variables since config might not be loaded yet
    const username = process.env.QBITTORRENT_USER || 'admin'
    const password = process.env.QBITTORRENT_PASSWORD || 'adminpass'

    context.logger.info('Creating qBittorrent configuration', { username })

    const passwordHash = this.generatePBKDF2Hash(password, context)

    const configContent = `[AutoRun]
enabled=false
program=

[BitTorrent]
Session\\AddTorrentStopped=false
Session\\DefaultSavePath=/downloads/
Session\\Port=6881
Session\\QueueingSystemEnabled=true
Session\\SSL\\Port=53540
Session\\ShareLimitAction=Stop
Session\\TempPath=/downloads/incomplete/

[LegalNotice]
Accepted=true

[Meta]
MigrationVersion=8

[Network]
PortForwardingEnabled=false
Proxy\\HostnameLookupEnabled=false
Proxy\\Profiles\\BitTorrent=true
Proxy\\Profiles\\Misc=true
Proxy\\Profiles\\RSS=true

[Preferences]
Connection\\PortRangeMin=6881
Connection\\UPnP=false
Downloads\\SavePath=/downloads/
Downloads\\TempPath=/downloads/incomplete/
WebUI\\Address=*
WebUI\\AuthSubnetWhitelist=127.0.0.1
WebUI\\AuthSubnetWhitelistEnabled=false
WebUI\\CSRFProtection=false
WebUI\\ClickjackingProtection=false
WebUI\\HostHeaderValidation=false
WebUI\\LocalHostAuth=true
WebUI\\Port=8080
WebUI\\RootFolder=
WebUI\\SecureCookie=false
WebUI\\ServerDomains=
WebUI\\SessionTimeout=3600
WebUI\\UseUPnP=false
WebUI\\Username=${username}
WebUI\\Password_PBKDF2=${passwordHash}
`

    // Ensure the qBittorrent directory exists
    try {
      await spawn(['mkdir', '-p', '/config/qBittorrent']).exited
      context.logger.debug('qBittorrent directory created successfully')
    } catch (error) {
      context.logger.error('Failed to create qBittorrent directory:', { error: String(error) })
      throw error
    }

    // Write the config file
    await write('/config/qBittorrent/qBittorrent.conf', configContent)
  }

  private generatePBKDF2Hash(password: string, context: StepContext): string {
    // Use Node's crypto module for PBKDF2
    const salt = crypto.randomBytes(16)
    const iterations = 100000
    const keyLength = 64

    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')

    context.logger.debug('Generated PBKDF2 hash for qBittorrent', { iterations })

    const encodedSalt = salt.toString('base64')
    const encodedHash = hash.toString('base64')

    return `@ByteArray(${encodedSalt}:${encodedHash})`
  }
}
