/**
 * Reads the `exp` claim (in ms since epoch) out of a JWT without verifying its
 * signature — the server is the only authority on validity; this is just so the
 * client can schedule a silent refresh slightly before the token lapses.
 * Returns null for malformed tokens or a missing `exp`.
 */
export function decodeJwtExpMs(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) {
    return null
  }
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}
