import { pbkdf2Sync, randomBytes } from 'node:crypto'

function generatePBKDF2Hash(password: string): string {
  const salt = randomBytes(16)
  const iterations = 100000
  const keyLength = 64

  const hash = pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')

  const encodedSalt = salt.toString('base64')
  const encodedHash = hash.toString('base64')

  return `@ByteArray(${encodedSalt}:${encodedHash})`
}

async function initQBittorrent() {
  const username = process.env.QBITTORRENT_USER || 'admin'
  const password = process.env.QBITTORRENT_PASSWORD || 'adminpass'

  console.log(`Setting up qBittorrent with user: ${username}`)

  const passwordHash = generatePBKDF2Hash(password)

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
WebUI\\ServerDomains=*
WebUI\\Username=${username}
WebUI\\Password_PBKDF2="${passwordHash}"
`

  // Ensure the qBittorrent directory exists
  try {
    await Bun.spawn(['mkdir', '-p', '/config/qBittorrent']).exited
    console.log('qBittorrent directory created successfully')
  } catch (error) {
    console.error('Failed to create qBittorrent directory:', error)
    throw error
  }

  // Write the config file
  await Bun.write('/config/qBittorrent/qBittorrent.conf', configContent)

  console.log('qBittorrent config initialized successfully')
}

await initQBittorrent()
