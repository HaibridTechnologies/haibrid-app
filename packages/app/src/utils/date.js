/**
 * Shared date utilities used across tasks and links components.
 * Kept in a single module so the formatting logic stays consistent.
 */

/**
 * Returns true if `dueDate` is strictly in the past (day-level precision).
 * Uses the local date string for comparison so time-of-day is ignored.
 *
 * @param {string|null} dueDate - ISO date string (e.g. "2026-04-08")
 * @returns {boolean}
 */
export function isOverdue(dueDate) {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

/**
 * Format an ISO date string as a short human-readable label.
 * Example: "2026-04-08T14:30:00.000Z" → "8 Apr 2026"
 *
 * @param {string|null} iso - ISO date/datetime string
 * @returns {string}  Formatted date, or empty string if `iso` is falsy
 */
export function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Format an ISO datetime string including the time.
 * Example: "2026-04-08T14:30:00.000Z" → "8 Apr, 14:30"
 *
 * @param {string|null} iso
 * @returns {string}
 */
export function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDwell(seconds) {
  if (seconds < 60)   return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

/**
 * Format dwell seconds for link items — returns null when the value is
 * too short (< 60 s) to be meaningful so callers can hide the badge.
 *
 * @param {number|null|undefined} seconds
 * @returns {string|null}
 */
export function fmtDwellCompact(seconds) {
  if (!seconds || seconds < 60) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
