/**
 * Generate a secure API key using crypto.getRandomValues()
 * Matches the same logic used in ServarrManager for consistency
 */
export function generateApiKey(): string {
  // Generate a 32-character hexadecimal API key
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
