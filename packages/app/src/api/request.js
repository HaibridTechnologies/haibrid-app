/**
 * Shared fetch wrapper for API modules.
 * Throws on any non-OK HTTP response so callers can `.catch()` errors uniformly.
 */
export async function request(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return null
  return res.json()
}
