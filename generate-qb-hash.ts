import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto'

function generateQBittorrentHash(password: string): string {
  const salt = randomBytes(16)
  const iterations = 100000
  const keyLength = 64 // 512 bits / 8

  const hash = pbkdf2Sync(password, salt, iterations, keyLength, 'sha512')

  const encodedSalt = salt.toString('base64')
  const encodedHash = hash.toString('base64')

  return `@ByteArray(${encodedSalt}:${encodedHash})`
}

const passwordHash = generateQBittorrentHash('newqbpass789')
console.log(`WebUI\\Password_PBKDF2="${passwordHash}"`)
